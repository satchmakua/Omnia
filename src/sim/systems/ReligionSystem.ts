// Faiths over time (M18): a religion with no followers left falls extinct (kept as a descent
// record), and on the culture/language/tribe era cadence a large, loosely-held faith may
// **schism** — a sect breaks away with a new deity, a coined name, and a nudged fervour,
// gathering half the faithful. Mirrors the schism machinery of cultures/tongues/tribes. The
// faith's fervour also drifts a touch each era. Runs daily; schism evaluates per era.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Agent, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import { getReligionStore, forkReligion, pruneReligions } from '../../religion/religionStore.ts';
import { getCultureStore, getCulture } from '../../culture/cultureStore.ts';
import { getLanguageStore, getLanguage } from '../../lang/languageStore.ts';
import { word } from '../../lang/language.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// Coin a deity name from a representative follower's tongue.
function coinDeity(world: World, store: { created: number }, member: EntityId, key: string): string {
  const cid = world.getComponent<Agent>(member, C_AGENT)!.cultureId;
  const cstore = getCultureStore(world);
  const langId = cid && cstore ? getCulture(cstore, cid)?.language : undefined;
  const lstore = getLanguageStore(world);
  const lang = (lstore && langId ? getLanguage(lstore, langId) : undefined) ?? (lstore ? Object.values(lstore.byId)[0] : undefined);
  return cap(lang ? word(lang, key) : `God${store.created}`);
}

export function runReligionSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const store = getReligionStore(world);
  if (!store) return;
  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  if (tick === 0 || tick % cfg.ticksPerDay !== 0) return;   // daily

  // Followers per faith.
  const followers = new Map<string, EntityId[]>();
  for (const e of world.query(C_AGENT)) {
    const rid = world.getComponent<Agent>(e, C_AGENT)!.religionId;
    if (!rid) continue;
    const list = followers.get(rid); if (list) list.push(e); else followers.set(rid, [e]);
  }

  // Extinction: a faith with no living followers falls.
  for (const id of Object.keys(store.byId)) {
    const r = store.byId[id];
    if (r.extinct) continue;
    if (!followers.get(id)?.length) { r.extinct = true; r.diedTick = tick; }
  }

  // Schism + drift on the era cadence.
  if (tick - store.lastEvolveTick >= cfg.evolutionIntervalDays * cfg.ticksPerDay) {
    store.lastEvolveTick = tick;
    const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
    for (const id of Object.keys(store.byId)) {       // snapshot — sects aren't re-checked
      const r = store.byId[id];
      if (r.extinct) continue;
      r.fervor = clamp01(r.fervor + (rng() * 2 - 1) * 0.05);   // belief intensity drifts
      const f = followers.get(id);
      if (!f || f.length < cfg.minFaithFollowers) continue;
      if (rng() >= cfg.religionSchismChancePerEra * (1 - r.cohesion)) continue;
      const deity = coinDeity(world, store, f[0], `god-${store.created}`);
      const sect = forkReligion(store, id, `the Order of ${deity}`, deity, tick, rng);
      const sorted = [...f].sort((a, b) => a - b);
      const half = Math.ceil(sorted.length / 2);
      for (const e of sorted.slice(half)) world.getComponent<Agent>(e, C_AGENT)!.religionId = sect;
      emitEvent(world, 'culture', `The Order of ${deity} broke away from ${r.name}.`);
      if (ch) chronicleAdd(ch, { tick, importance: 0.66, kind: 'religion', text: `A sect, the Order of ${deity}, split from ${r.name}.` }, cfg.chronicleImportanceThreshold);
    }
  }

  pruneReligions(store, cfg.maxLineages);
}
