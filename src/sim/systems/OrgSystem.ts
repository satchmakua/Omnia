// Organizations over time (M14): leadership succession when a head dies, a tribe falling
// when its last member does, and schism — a faction breaking away from a large, loose tribe
// over the eras (new tribes emerge alongside cultures & tongues). Runs daily (succession is
// cheap and need not be instant); schism evaluates on the culture/language era cadence.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Agent, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import { getOrgStore, forkOrg, pruneOrgs, areAtWar, declareWar, endWar } from '../../org/orgStore.ts';
import type { OrgStoreData } from '../../org/orgStore.ts';
import { getCultureStore, getCulture } from '../../culture/cultureStore.ts';
import { getLanguageStore, getLanguage } from '../../lang/languageStore.ts';
import { word } from '../../lang/language.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Coin a tribe name from the (representative) member's tongue — e.g. "Korvu clan".
function tribeName(world: World, store: OrgStoreData, memberCultureLang: string | undefined, key: string): string {
  const lstore = getLanguageStore(world);
  const lang = (lstore && memberCultureLang ? getLanguage(lstore, memberCultureLang) : undefined)
    ?? (lstore ? Object.values(lstore.byId)[0] : undefined);
  return `${cap(lang ? word(lang, key) : `tribe${store.created}`)} clan`;
}

function eldest(world: World, members: EntityId[]): EntityId {
  let best = members[0], bestAge = -1;
  for (const e of members) {
    const age = world.getComponent<Agent>(e, C_AGENT)!.ticksAlive;
    if (age > bestAge) { bestAge = age; best = e; }
  }
  return best;
}

function cultureLangOf(world: World, e: EntityId): string | undefined {
  const cid = world.getComponent<Agent>(e, C_AGENT)!.cultureId;
  const cstore = getCultureStore(world);
  return cid && cstore ? getCulture(cstore, cid)?.language : undefined;
}

// War→militarism (D26): going to war hardens both belligerents' cultures toward `martial`
// — the matching response to famine→thrift (S71). Each represented culture is nudged once;
// bounded + clamped, deterministic (no RNG). The era value-drift counterbalances it, so
// martiality breathes rather than ratchets to a permanent war footing.
function militarize(world: World, aId: string, bId: string, members: Map<string, EntityId[]>): void {
  const cstore = getCultureStore(world);
  if (!cstore) return;
  const touched = new Set<string>();
  for (const tribe of [aId, bId]) {
    for (const e of members.get(tribe) ?? []) {
      const cid = world.getComponent<Agent>(e, C_AGENT)!.cultureId;
      if (!cid || touched.has(cid)) continue;
      touched.add(cid);
      const c = getCulture(cstore, cid);
      if (c) c.values.martial = Math.min(1, c.values.martial + 0.05);
    }
  }
}

export function runOrgSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const store = getOrgStore(world);
  if (!store) return;
  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  if (tick === 0 || tick % cfg.ticksPerDay !== 0) return;   // daily

  // Living members per tribe.
  const members = new Map<string, EntityId[]>();
  for (const e of world.query(C_AGENT)) {
    const orgId = world.getComponent<Agent>(e, C_AGENT)!.orgId;
    if (!orgId) continue;
    const list = members.get(orgId); if (list) list.push(e); else members.set(orgId, [e]);
  }

  // Succession + extinction: a memberless tribe falls; otherwise keep a living head.
  for (const id of Object.keys(store.byId)) {
    const org = store.byId[id];
    if (org.extinct) continue;
    const mem = members.get(id);
    if (!mem || mem.length === 0) { org.extinct = true; org.diedTick = tick; org.leader = null; continue; }
    const valid = org.leader != null && world.hasComponent(org.leader, C_AGENT)
      && world.getComponent<Agent>(org.leader, C_AGENT)!.orgId === id;
    if (!valid) {
      org.leader = eldest(world, mem);
      emitEvent(world, 'culture', `${world.getComponent<Agent>(org.leader, C_AGENT)!.name} now leads the ${org.name}.`);
    }
  }

  // Schism on the era cadence: a large, loose tribe fractures — a faction breaks away with a
  // new colour, coined name, and nudged values (and so, often, a different government).
  if (tick - store.lastEvolveTick >= cfg.evolutionIntervalDays * cfg.ticksPerDay) {
    store.lastEvolveTick = tick;
    for (const id of Object.keys(store.byId)) {            // snapshot — daughters aren't re-checked
      const org = store.byId[id];
      if (org.extinct) continue;
      const mem = members.get(id);
      if (!mem || mem.length < cfg.minSchismMembers) continue;
      if (rng() >= cfg.schismChancePerEra * (1 - org.cohesion)) continue;
      const name = tribeName(world, store, cultureLangOf(world, mem[0]), `schism-${store.created}`);
      const daughter = forkOrg(store, id, name, tick, cfg.schismValueNudge, rng);
      const sorted = [...mem].sort((a, b) => a - b);
      const half = Math.ceil(sorted.length / 2);
      for (const e of sorted.slice(half)) world.getComponent<Agent>(e, C_AGENT)!.orgId = daughter;
      store.byId[daughter].leader = eldest(world, sorted.slice(half));
      store.byId[id].leader = eldest(world, sorted.slice(0, half));
      emitEvent(world, 'culture', `The ${name} broke away from the ${org.name}.`);
    }

    // ── War (M16 slice 3): end decided/exhausted wars, then maybe start a new one ──
    const eraTicks = cfg.evolutionIntervalDays * cfg.ticksPerDay;
    const sizeOf = (id: string): number => members.get(id)?.length ?? 0;
    for (const war of [...(store.wars ?? [])]) {
      const a = store.byId[war.a], b = store.byId[war.b];
      const aN = sizeOf(war.a), bN = sizeOf(war.b);
      const routed = aN === 0 || bN === 0 || Math.min(aN, bN) < Math.max(aN, bN) * 0.4;
      const exhausted = tick - war.since >= cfg.warDurationEras * eraTicks;
      if (!a || !b || a.extinct || b.extinct || routed || exhausted) {
        endWar(store, war.a, war.b);
        const winnerId = routed ? (aN >= bN ? war.a : war.b) : null;
        if (!store.warLog) store.warLog = [];
        store.warLog.push({ a: war.a, b: war.b, since: war.since, ended: tick, winner: winnerId });
        if (store.warLog.length > 30) store.warLog.shift();
        if (a && b && !a.extinct && !b.extinct) {
          const winner = aN >= bN ? a : b, loser = aN >= bN ? b : a;
          emitEvent(world, 'culture', routed
            ? `The ${winner.name} broke the ${loser.name} in war.`
            : `The ${a.name} and the ${b.name} made peace.`);
        }
      }
    }
    const eligible = Object.keys(store.byId).filter(id => !store.byId[id].extinct && sizeOf(id) >= cfg.minWarMembers);
    const aggressors = eligible.filter(id => store.byId[id].values.martial >= cfg.warMartialThreshold);
    if (aggressors.length > 0 && eligible.length >= 2 && rng() < cfg.warChancePerEra) {
      const a = aggressors[Math.floor(rng() * aggressors.length)];
      const targets = eligible.filter(id => id !== a && !areAtWar(store, a, id));
      if (targets.length > 0) {
        const b = targets[Math.floor(rng() * targets.length)];
        declareWar(store, a, b, tick);
        militarize(world, a, b, members);   // war hardens both cultures toward martial (D26)
        emitEvent(world, 'culture', `The ${store.byId[a].name} declared war on the ${store.byId[b].name}.`);
        const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
        if (ch) chronicleAdd(ch, { tick, importance: 0.8, kind: 'war',
          text: `The ${store.byId[a].name} went to war with the ${store.byId[b].name}.` }, cfg.chronicleImportanceThreshold);
      }
    }
  }

  pruneOrgs(store, cfg.maxLineages);
}
