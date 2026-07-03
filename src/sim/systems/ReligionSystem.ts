// Faiths over time (M18): a religion with no followers left falls extinct (kept as a descent
// record), and on the culture/language/tribe era cadence a large, loosely-held faith may
// **schism** — a sect breaks away with a new deity, a coined name, and a nudged fervour,
// gathering half the faithful. Mirrors the schism machinery of cultures/tongues/tribes. The
// faith's fervour also drifts a touch each era. Runs daily; schism evaluates per era.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_CLOCK, C_CHRONICLE, C_POSITION, C_HEALTH, C_WARD, C_CURSE, C_SPECIAL } from '../components.ts';
import type { Agent, Clock, Position, Health, Ward, Curse, Special } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import { getReligionStore, forkReligion, pruneReligions, mythFor, isWrathful } from '../../religion/religionStore.ts';
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

  // Holy days (M18 s2): a faith celebrates on a recurring day — phased per faith (by a stable hash of
  // its id) so they don't all fall together — and its living faithful are gladdened. This is devotion's
  // payoff: faith finally *does* something for those who keep it, the more so the more devout the faith.
  // Deterministic (a fixed schedule + bounded lift, no RNG → replay/save-safe); the lift is small, so
  // the Storyteller (M32) still owns the drama band. A holy day is a feed line; the very devout, a legend.
  const day = Math.floor(tick / cfg.ticksPerDay);
  const interval = Math.max(1, Math.round(cfg.holyDayIntervalDays));
  const ch0 = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
  for (const [id, list] of followers) {
    const r = store.byId[id];
    if (!r || r.extinct || list.length === 0) continue;
    if (!r.myth) r.myth = mythFor(r.deity, r.tenets);   // backfill an origin story for faiths from older saves
    let off = 0; for (let i = 0; i < id.length; i++) off = (off + id.charCodeAt(i)) % interval;
    if (((day - off) % interval + interval) % interval !== 0) continue;   // not this faith's holy day
    if (r.lastHolyDay === tick) continue;                                 // fire once per occurrence
    r.lastHolyDay = tick;
    const lift = cfg.holyDayMoodLift * (0.6 + 0.4 * r.fervor);
    for (const e of list) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      if (a.mood !== undefined) a.mood = clamp01(a.mood + lift);
    }
    emitEvent(world, 'culture', `${r.name} kept its holy day — the faithful gathered before ${r.deity} and were gladdened.`);
    if (ch0 && r.fervor > 0.7 && list.length >= cfg.minFaithFollowers) {
      chronicleAdd(ch0, { tick, importance: 0.5, kind: 'religion', text: `The devout of ${r.name} kept the holy day of ${r.deity}.` }, cfg.chronicleImportanceThreshold);
    }
  }

  // Conversion (M18 s2): faith spreads by contact — a folk standing beside a *more devout*
  // faith may adopt it. Most keep their faith; the gate (more fervent) means devout faiths
  // win converts and grow (until they schism). One roll per folk per day → bounded RNG.
  const W = cfg.gridWidth;
  const folkAt = new Map<number, EntityId>();
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    folkAt.set(p.y * W + p.x, e);
  }
  const OFF = [-1, 0, 1];

  // Divine favor & grace-day boons (M18 s2b): faith now ACTS on the world. Each living faith accrues a
  // bounded, decaying `favor` from its followers' devotion (fervour × a saturating follower factor), and
  // on a salted, hash-phased "grace day" (rarer than a holy day so favor recharges) a faith with enough
  // favor spends most of it on ONE bounded boon: a BENEVOLENT faith heals, heartens & shields its neediest
  // follower (reusing the M26 Ward); a WRATHFUL warrior-creed faith lays a non-lethal Curse (weaken-only —
  // never Health) on a rival's neighbour. One target per faith → soak cost is O(faiths). ZERO new RNG (this
  // sits before the conversion draw); every write is clamp01/min-capped, and the Ward/Curse expire via the
  // MagicSystem sweep that runs later this same tick, so nothing lingers.
  for (const [id, list] of followers) {
    const r = store.byId[id];
    if (!r || r.extinct || list.length === 0) continue;
    r.favor = clamp01((r.favor ?? 0) * cfg.favorDecay + cfg.favorGainPerDay * r.fervor * (list.length / (list.length + cfg.favorSaturationK)));
  }
  const graceInterval = Math.max(1, Math.round(cfg.graceIntervalDays));
  // At most one manifest god in the world at a time — a living god is momentous and singular (M18 s3).
  let avatarExists = world.query(C_SPECIAL).some(e => world.getComponent<Special>(e, C_SPECIAL)!.behavior === 'avatar');
  for (const [id, list] of followers) {
    const r = store.byId[id];
    if (!r || r.extinct || list.length === 0) continue;
    const gid = 'g' + id;   // salted so a grace day rarely coincides with the faith's holy day
    let goff = 0; for (let i = 0; i < gid.length; i++) goff = (goff + gid.charCodeAt(i)) % graceInterval;
    if (((day - goff) % graceInterval + graceInterval) % graceInterval !== 0) continue;   // not this faith's grace day
    if (r.lastGrace === tick || (r.favor ?? 0) < cfg.graceThreshold) continue;            // once per occurrence; needs favor

    // Living god (M18 s3): at the very PEAK of sustained favor, the deity itself MANIFESTS — a rare avatar
    // (a Special agent, reusing the M21 machinery) walks the land, gladdening the faithful & awing rivals,
    // then fades. Spawned deterministically at the faith's lowest-id follower's tile (NO RNG); at most one
    // in the world; spends nearly all the favor — a once-in-an-age act that supersedes the grace-day boon.
    if ((r.favor ?? 0) >= cfg.avatarFavorThreshold && list.length >= cfg.minFaithFollowers && !avatarExists) {
      let host: EntityId | null = null;
      for (const e of list) if (world.hasComponent(e, C_POSITION) && (host === null || e < host)) host = e;
      if (host !== null) {
        const hp = world.getComponent<Position>(host, C_POSITION)!;
        const g = world.createEntity();
        world.addComponent<Position>(g, C_POSITION, { x: hp.x, y: hp.y });
        world.addComponent<Health>(g, C_HEALTH, { value: 1, ill: false });
        world.addComponent<Special>(g, C_SPECIAL, {
          kind: 'avatar', name: `${r.deity} made flesh`, icon: 'avatar', behavior: 'avatar', faith: id,
          str: 14, dex: 14, con: 14, ferocity: 1,
          spawnTick: tick, despawnTick: tick + Math.round(cfg.avatarDurationDays * cfg.ticksPerDay),
        });
        emitEvent(world, 'culture', `${r.deity} walked among the faithful of ${r.name} — the god made flesh.`);
        if (ch0) chronicleAdd(ch0, { tick, importance: 0.82, kind: 'religion', text: `${r.deity}, god of ${r.name}, manifested among the folk.` }, cfg.chronicleImportanceThreshold);
        r.favor = clamp01((r.favor ?? 0) - cfg.avatarCost);
        r.lastGrace = tick; r.graceGiven = (r.graceGiven ?? 0) + 1;
        avatarExists = true;
        continue;   // the manifestation IS this grace day's act
      }
    }

    let boon = false;
    if (isWrathful(r)) {
      // A wrathful god harries a rival: curse the lowest-id uncursed neighbour (of a different living
      // faith) of any follower. Weaken-only — it saps a foe's blows, it never touches Health (can't kill).
      let victim: EntityId | null = null;
      for (const e of list) {
        const p = world.getComponent<Position>(e, C_POSITION); if (!p) continue;
        for (const dy of OFF) for (const dx of OFF) {
          if (dx === 0 && dy === 0) continue;
          const o = folkAt.get((p.y + dy) * W + (p.x + dx));
          if (o === undefined || world.hasComponent(o, C_CURSE)) continue;
          const fO = world.getComponent<Agent>(o, C_AGENT)!.religionId;
          if (!fO || fO === id || !store.byId[fO] || store.byId[fO].extinct) continue;
          if (victim === null || o < victim) victim = o;
        }
      }
      if (victim !== null) {
        world.addComponent<Curse>(victim, C_CURSE, { weaken: cfg.graceCurseWeaken, expiresTick: tick + cfg.graceCurseDuration });
        emitEvent(world, 'culture', `${r.name} called down ${r.deity}'s wrath on ${world.getComponent<Agent>(victim, C_AGENT)!.name}.`);
        boon = true;
      }
    } else {
      // A benevolent god tends its neediest: the lowest-health follower (ties: lowest mood, then lowest id).
      let target: EntityId | null = null, bh = Infinity, bm = Infinity;
      for (const e of list) {
        const hv = world.getComponent<Health>(e, C_HEALTH)?.value ?? 1;
        const mv = world.getComponent<Agent>(e, C_AGENT)!.mood ?? 1;
        if (target === null || hv < bh || (hv === bh && (mv < bm || (mv === bm && e < target)))) { target = e; bh = hv; bm = mv; }
      }
      if (target !== null) {
        const h = world.getComponent<Health>(target, C_HEALTH);
        if (h) h.value = Math.min(1, h.value + cfg.graceHealAmount);
        const a = world.getComponent<Agent>(target, C_AGENT)!;
        if (a.mood !== undefined) a.mood = clamp01(a.mood + cfg.graceMoodLift);
        if (!world.hasComponent(target, C_WARD)) world.addComponent<Ward>(target, C_WARD, { soak: cfg.graceWardSoak, expiresTick: tick + cfg.graceWardDuration });
        emitEvent(world, 'culture', `${r.name} blessed ${a.name} — ${r.deity} healed and shielded the faithful.`);
        boon = true;
      }
    }
    if (boon) {
      r.favor = clamp01((r.favor ?? 0) - cfg.graceCost);
      r.lastGrace = tick;
      r.graceGiven = (r.graceGiven ?? 0) + 1;
      if (ch0 && list.length >= cfg.minFaithFollowers) {
        chronicleAdd(ch0, { tick, importance: 0.55, kind: 'religion', text: isWrathful(r)
          ? `${r.deity} loosed wrath upon the enemies of ${r.name}.`
          : `${r.deity} blessed the faithful of ${r.name}.` }, cfg.chronicleImportanceThreshold);
      }
    }
  }

  for (const e of world.query(C_AGENT, C_POSITION)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const fA = agent.religionId;
    if (!fA) continue;
    if (rng() >= cfg.conversionChancePerDay) continue;
    const fervA = store.byId[fA]?.fervor ?? 0;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    let converted = false;
    for (const dy of OFF) {
      for (const dx of OFF) {
        if (dx === 0 && dy === 0) continue;
        const o = folkAt.get((p.y + dy) * W + (p.x + dx));
        if (o === undefined) continue;
        const fB = world.getComponent<Agent>(o, C_AGENT)!.religionId;
        if (!fB || fB === fA || !store.byId[fB] || store.byId[fB].extinct) continue;
        if (store.byId[fB].fervor > fervA) {
          agent.religionId = fB;
          emitEvent(world, 'culture', `${agent.name} converted to ${store.byId[fB].name}.`);
          converted = true;
          break;
        }
      }
      if (converted) break;
    }
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
      // Cults (M18 s3b): a schism from a very DEVOUT parent ruptures as a fanatical CULT rather than an
      // orderly sect — zealots who found even the mainstream too tepid, burning hotter and more brittle.
      // (Devout faiths are the ones that grow enough to schism, so this is where cults arise.) A PURE
      // classification (a function of the parent's fervour), so it adds ZERO new rng draws — only the cult's
      // values differ; forkReligion's rng nudge is untouched.
      const cult = r.fervor >= cfg.cultParentFervorMin;
      const name = cult ? `the Cult of ${deity}` : `the Order of ${deity}`;
      const sect = forkReligion(store, id, name, deity, tick, rng);
      if (cult) {
        const sr = store.byId[sect];
        sr.cult = true;
        sr.fervor = clamp01(Math.max(sr.fervor, cfg.cultFervor));   // burns hotter than the fork nudge alone
        sr.cohesion = cfg.cultCohesion;                             // …but brittle — prone to re-splitting
      }
      const sorted = [...f].sort((a, b) => a - b);
      const half = Math.ceil(sorted.length / 2);
      for (const e of sorted.slice(half)) world.getComponent<Agent>(e, C_AGENT)!.religionId = sect;
      emitEvent(world, 'culture', cult
        ? `A fervent cult, ${name}, broke away from ${r.name} — zealots who found even it too tepid.`
        : `${name} broke away from ${r.name}.`);
      if (ch) chronicleAdd(ch, { tick, importance: cult ? 0.7 : 0.66, kind: 'religion', text: cult
        ? `A cult, ${name}, split from the devout ${r.name} — fanatics burning brighter than the faith that bred them.`
        : `A sect, ${name}, split from ${r.name}.` }, cfg.chronicleImportanceThreshold);
    }
  }

  pruneReligions(store, cfg.maxLineages);
}
