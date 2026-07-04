// Religion (M18 slice 1): the faith store + the ReligionSystem (extinction + schism into
// sects), faith inheritance, and the co-religionist social-warmth coupling.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_RELIGIONSTORE, C_POSITION, C_HEALTH, C_WARD, C_CURSE, C_SPECIAL, C_TILEMAP, C_LINEAGE } from '../src/sim/components.ts';
import type { Agent, Clock, Health, Ward, Special, Lineage } from '../src/sim/components.ts';
import { killAgent } from '../src/sim/death.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { createRNG } from '../src/sim/rng.ts';
import {
  createReligionStore, createReligion, forkReligion, getReligion, faithFactor, pruneReligions, mythFor, isWrathful,
} from '../src/religion/religionStore.ts';
import type { ReligionStoreData } from '../src/religion/religionStore.ts';
import { runReligionSystem } from '../src/sim/systems/ReligionSystem.ts';
import { runSpecialAgentSystem } from '../src/sim/systems/SpecialAgentSystem.ts';
import { runMoodSystem, MOOD_BASELINE } from '../src/sim/systems/MoodSystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;

describe('religionStore (M18)', () => {
  it('faithFactor: same faith warms (by fervour), different cools, absent is neutral', () => {
    const s = createReligionStore();
    const a = createReligion(s, 'Faith A', 'Aa', ['rite'], 1.0, 0);   // very devout
    const b = createReligion(s, 'Faith B', 'Bb', ['rite'], 0.5, 0);
    expect(faithFactor(s, a, a)).toBeGreaterThan(1);     // shared, devout → warmer
    expect(faithFactor(s, a, b)).toBeLessThan(1);        // different faiths → cooler
    expect(faithFactor(s, undefined, a)).toBe(1);        // an unbeliever → neutral
    expect(faithFactor(undefined, a, a)).toBe(1);        // no store → neutral
  });

  it('mythFor: a deterministic founding myth that names the deity & a tenet (M18 s2)', () => {
    const m1 = mythFor('Khoros', ['the warrior creed', 'ancestor rites']);
    const m2 = mythFor('Khoros', ['the warrior creed', 'ancestor rites']);
    expect(m1).toBe(m2);                         // deterministic — same inputs, same myth (replay-safe)
    expect(m1).toContain('Khoros');              // the god is named
    expect(m1.endsWith('.')).toBe(true);
    expect(/warrior creed|ancestor rites/.test(m1)).toBe(true);   // closes on one of the faith's tenets
    expect(mythFor('Velun', ['the peaceful path'])).not.toBe(m1); // a different faith, a different story
  });

  it('createReligion mints a founding myth (M18 s2)', () => {
    const s = createReligionStore();
    const a = createReligion(s, 'the Faith of Oru', 'Oru', ['communal worship'], 0.7, 0);
    expect(getReligion(s, a)!.myth).toContain('Oru');
  });

  it('forkReligion carries tenets + descent', () => {
    const s = createReligionStore();
    const a = createReligion(s, 'Old Faith', 'Aa', ['ancestor rites'], 0.6, 0);
    const sect = forkReligion(s, a, 'New Sect', 'Bb', 1000, createRNG(1));
    expect(getReligion(s, sect)!.parent).toBe(a);
    expect(getReligion(s, sect)!.tenets).toEqual(['ancestor rites']);
    expect(getReligion(s, a)!.color).not.toBe(getReligion(s, sect)!.color);
  });

  it('prune drops the oldest extinct beyond the cap, never the living', () => {
    const s = createReligionStore();
    for (let i = 0; i < 6; i++) { const id = createReligion(s, `F${i}`, 'x', [], 0.5, i); if (i < 4) { s.byId[id].extinct = true; s.byId[id].diedTick = i; } }
    pruneReligions(s, 3);
    expect(Object.keys(s.byId).length).toBe(3);
    expect(Object.values(s.byId).filter(r => !r.extinct).length).toBe(2);   // both living kept
  });
});

// ── ReligionSystem ──────────────────────────────────────────────────────────────────
function faithWorld(tick: number): { w: World; store: ReligionStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  const store = createReligionStore();
  w.addComponent<ReligionStoreData>(w.createEntity(), C_RELIGIONSTORE, store);
  return { w, store };
}
function follower(w: World, religionId: string): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `F${e}`, action: 'wander', ticksAlive: Math.floor(25 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, religionId });
  return e;
}

describe('ReligionSystem (M18)', () => {
  it('a faith with no followers falls extinct', () => {
    const { w, store } = faithWorld(cfg.ticksPerDay);
    const r = createReligion(store, 'Lone Faith', 'Aa', [], 0.6, 0);
    const only = follower(w, r);
    runReligionSystem(w, cfg, createRNG(1));
    expect(getReligion(store, r)!.extinct).toBeFalsy();
    w.removeComponent(only, C_AGENT);
    runReligionSystem(w, cfg, createRNG(1));
    expect(getReligion(store, r)!.extinct).toBe(true);
  });

  it('a large, loose faith schisms — a sect breaks away with half the faithful', () => {
    const era = cfg.evolutionIntervalDays * cfg.ticksPerDay;
    const { w, store } = faithWorld(era);
    const r = createReligion(store, 'Great Faith', 'Aa', ['rite'], 0.6, 0);
    store.byId[r].cohesion = 0;                       // schism-prone
    for (let i = 0; i < 12; i++) follower(w, r);
    runReligionSystem(w, { ...cfg, religionSchismChancePerEra: 1, minFaithFollowers: 8 }, createRNG(1));
    const sects = Object.values(store.byId).filter(x => x.parent === r);
    expect(sects.length).toBe(1);
    const inParent = w.query(C_AGENT).filter(e => w.getComponent<Agent>(e, C_AGENT)!.religionId === r).length;
    const inSect = w.query(C_AGENT).filter(e => w.getComponent<Agent>(e, C_AGENT)!.religionId === sects[0].id).length;
    expect(inParent).toBeGreaterThan(0);
    expect(inSect).toBeGreaterThan(0);
  });

  // A schism produces a CULT vs a plain sect purely from the parent's fervour (no new RNG) — M18 s3b.
  const schismFrom = (parentFervor: number) => {
    const era = cfg.evolutionIntervalDays * cfg.ticksPerDay;
    const { w, store } = faithWorld(era);
    const r = createReligion(store, 'the Faith', 'Aa', ['rite'], parentFervor, 0);
    store.byId[r].cohesion = 0;                       // schism-prone
    for (let i = 0; i < 12; i++) follower(w, r);
    runReligionSystem(w, { ...cfg, religionSchismChancePerEra: 1, minFaithFollowers: 8 }, createRNG(1));
    return Object.values(store.byId).find(x => x.parent === r)!;
  };

  it('a schism from a very DEVOUT faith births a fanatical, brittle CULT (M18 s3b)', () => {
    const sect = schismFrom(0.85);                    // parent fervour ≥ cultParentFervorMin (zealots want more)
    expect(sect).toBeDefined();
    expect(sect.cult).toBe(true);
    expect(sect.name).toContain('Cult');
    expect(sect.fervor).toBeGreaterThanOrEqual(cfg.cultFervor - 1e-9);   // burns hot
    expect(sect.cohesion).toBe(cfg.cultCohesion);                        // …but brittle
  });

  it('a schism from a moderately-devout faith is a plain sect, not a cult (M18 s3b)', () => {
    const sect = schismFrom(0.5);                     // parent fervour < cultParentFervorMin
    expect(sect.cult).toBeFalsy();
    expect(sect.name).toContain('Order');
  });

  it('a holy day gladdens the faithful — devotion’s payoff (M18 s2)', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'Glad Faith', 'Aa', ['rite'], 1.0, 0);   // very devout → the full lift
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    const fols = [follower(w, r), follower(w, r), follower(w, r)];            // 3 < minFaithFollowers → never schisms
    for (const e of fols) w.getComponent<Agent>(e, C_AGENT)!.mood = 0.6;      // content — below apostasyMoodThreshold they'd doubt & leave (M18 s4)

    // Run one full holy-day interval; the faith's holy day must fall exactly once within it.
    let lifts = 0;
    for (let d = 1; d <= cfg.holyDayIntervalDays + 1; d++) {
      clock.tick = d * cfg.ticksPerDay;
      const before = w.getComponent<Agent>(fols[0], C_AGENT)!.mood!;
      runReligionSystem(w, cfg, createRNG(1));
      if (w.getComponent<Agent>(fols[0], C_AGENT)!.mood! > before) lifts++;
    }
    expect(lifts).toBe(1);                                                    // exactly one holy day in the interval
    for (const e of fols) expect(w.getComponent<Agent>(e, C_AGENT)!.mood!).toBeCloseTo(0.6 + cfg.holyDayMoodLift, 5);
  });

  it('a holy day is deterministic — no simulation RNG, identical under replay (M18 s2)', () => {
    const run = () => {
      const { w, store } = faithWorld(0);
      const r = createReligion(store, 'F', 'Aa', ['rite'], 0.8, 0);
      const e = follower(w, r); w.getComponent<Agent>(e, C_AGENT)!.mood = 0.4;
      const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
      for (let d = 1; d <= cfg.holyDayIntervalDays + 1; d++) { clock.tick = d * cfg.ticksPerDay; runReligionSystem(w, cfg, createRNG(99)); }
      return w.getComponent<Agent>(e, C_AGENT)!.mood!;
    };
    expect(run()).toBe(run());
  });
});

// ── Conversion + faith→mood (M18 slice 2) ─────────────────────────────────────────────
function placedFollower(w: World, x: number, y: number, religionId: string | undefined, mood = MOOD_BASELINE): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `F${e}`, action: 'wander', ticksAlive: Math.floor(25 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, religionId, mood });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}

describe('conversion spreads faith (M18 s2)', () => {
  it('a folk beside a MORE devout faith adopts it', () => {
    const { w, store } = faithWorld(cfg.ticksPerDay);
    const lax = createReligion(store, 'Lax Faith', 'Aa', [], 0.3, 0);
    const devout = createReligion(store, 'Devout Faith', 'Bb', [], 0.9, 0);
    const seeker = placedFollower(w, 5, 5, lax);
    placedFollower(w, 6, 5, devout);   // a devout neighbour
    runReligionSystem(w, { ...cfg, conversionChancePerDay: 1 }, createRNG(1));
    expect(w.getComponent<Agent>(seeker, C_AGENT)!.religionId).toBe(devout);
  });

  it('does NOT convert toward a LESS devout neighbour', () => {
    const { w, store } = faithWorld(cfg.ticksPerDay);
    const lax = createReligion(store, 'Lax Faith', 'Aa', [], 0.3, 0);
    const devout = createReligion(store, 'Devout Faith', 'Bb', [], 0.9, 0);
    const steadfast = placedFollower(w, 5, 5, devout);
    placedFollower(w, 6, 5, lax);   // a less-devout neighbour
    runReligionSystem(w, { ...cfg, conversionChancePerDay: 1 }, createRNG(1));
    expect(w.getComponent<Agent>(steadfast, C_AGENT)!.religionId).toBe(devout);   // holds firm
  });
});

describe('devotion comforts (M18 s2)', () => {
  it('a follower of a devout faith ends in a better mood than the faithless', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const store = createReligionStore();
    w.addComponent<ReligionStoreData>(w.createEntity(), C_RELIGIONSTORE, store);
    const faith = createReligion(store, 'Devout', 'Aa', [], 1.0, 0);
    const faithful = placedFollower(w, 5, 5, faith);
    const faithless = w.createEntity();
    w.addComponent<Agent>(faithless, C_AGENT, { name: 'N', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood: MOOD_BASELINE });
    w.addComponent(faithless, C_POSITION, { x: 20, y: 20 });
    runMoodSystem(w, cfg);
    expect(w.getComponent<Agent>(faithful, C_AGENT)!.mood!).toBeGreaterThan(w.getComponent<Agent>(faithless, C_AGENT)!.mood!);
  });
});

// ── Divine favor & grace-day boons (M18 s2b) ──────────────────────────────────────────
function healthyFollower(w: World, x: number, y: number, religionId: string, opts: { health?: number; mood?: number } = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `F${e}`, action: 'wander', ticksAlive: Math.floor(25 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, religionId, mood: opts.mood ?? 0.7 });
  w.addComponent(e, C_POSITION, { x, y });
  w.addComponent<Health>(e, C_HEALTH, { value: opts.health ?? 1, ill: false });
  return e;
}
// Run one full grace interval (no conversion noise); returns after the faith's single grace day has passed.
const noConvert = (over: Partial<typeof cfg> = {}) => ({ ...cfg, conversionChancePerDay: 0, ...over });
function runGraceInterval(w: World): void {
  const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
  for (let d = 1; d <= cfg.graceIntervalDays + 1; d++) { clock.tick = d * cfg.ticksPerDay; runReligionSystem(w, noConvert(), createRNG(1)); }
}

describe('divine favor & grace-day boons (M18 s2b)', () => {
  it('isWrathful: the warrior creed is wrathful, every other tenet benevolent', () => {
    const s = createReligionStore();
    expect(isWrathful(getReligion(s, createReligion(s, 'War', 'Aa', ['the warrior creed', 'ancestor rites'], 0.8, 0))!)).toBe(true);
    expect(isWrathful(getReligion(s, createReligion(s, 'Peace', 'Bb', ['the peaceful path', 'communal worship'], 0.8, 0))!)).toBe(false);
  });

  it('a benevolent faith heals & shields its neediest follower on a grace day; the hale are untouched', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.9, 0);
    store.byId[r].favor = 1;                                       // brimming with favor
    const wounded = healthyFollower(w, 5, 5, r, { health: 0.4 });
    const hale = healthyFollower(w, 8, 8, r, { health: 1 });
    runGraceInterval(w);
    expect(w.getComponent<Health>(wounded, C_HEALTH)!.value).toBeGreaterThan(0.4);   // healed
    expect(w.hasComponent(wounded, C_WARD)).toBe(true);                             // and shielded
    expect(w.getComponent<Ward>(wounded, C_WARD)!.soak).toBe(cfg.graceWardSoak);    // the grace ward (bounded soak)
    expect(w.getComponent<Health>(hale, C_HEALTH)!.value).toBe(1);                  // the hale follower untouched
    expect(w.hasComponent(hale, C_WARD)).toBe(false);
    expect(store.byId[r].favor!).toBeLessThan(1);                                   // favor was spent
  });

  it('the grace threshold gates the boon — a favor-poor faith grants nothing', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.9, 0);
    store.byId[r].favor = 0.1;                                     // below graceThreshold
    const wounded = healthyFollower(w, 5, 5, r, { health: 0.4 });
    runGraceInterval(w);
    expect(w.getComponent<Health>(wounded, C_HEALTH)!.value).toBe(0.4);   // no heal
    expect(w.hasComponent(wounded, C_WARD)).toBe(false);                  // no ward
  });

  it('a wrathful faith curses a rival’s neighbour — non-lethally (never touches health)', () => {
    const { w, store } = faithWorld(0);
    const war = createReligion(store, 'the War Faith', 'Aa', ['the warrior creed'], 0.9, 0);
    const peace = createReligion(store, 'the Peace Faith', 'Bb', ['the peaceful path'], 0.5, 0);
    store.byId[war].favor = 1;
    const zealot = healthyFollower(w, 5, 5, war, { health: 1 });
    const rival = healthyFollower(w, 6, 5, peace, { health: 1 });    // adjacent, different living faith
    runGraceInterval(w);
    expect(w.hasComponent(rival, C_CURSE)).toBe(true);              // hexed
    expect(w.getComponent<Health>(rival, C_HEALTH)!.value).toBe(1); // …but unharmed — weaken-only
    expect(w.isAlive(rival)).toBe(true);
    expect(w.hasComponent(zealot, C_CURSE)).toBe(false);           // its own faithful are never cursed
  });

  it('a grace-day boon is deterministic — identical under different seeds (no sim RNG)', () => {
    const run = (seed: number) => {
      const { w, store } = faithWorld(0);
      const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.9, 0);
      store.byId[r].favor = 1;
      const f = healthyFollower(w, 5, 5, r, { health: 0.4 });
      const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
      // Suppress the era schism/drift (which legitimately draws seeded RNG) so the WHOLE outcome — favor
      // included — is seed-independent, proving the favor+boon path itself consumes no RNG.
      for (let d = 1; d <= cfg.graceIntervalDays + 1; d++) { clock.tick = d * cfg.ticksPerDay; runReligionSystem(w, noConvert({ evolutionIntervalDays: 100000 }), createRNG(seed)); }
      return `${w.getComponent<Health>(f, C_HEALTH)!.value}|${w.hasComponent(f, C_WARD)}|${store.byId[r].favor}`;
    };
    expect(run(1)).toBe(run(9999));   // the favor + boon path draws no rng → the outcome is seed-independent
  });

  it('divine favor accrues from devotion and stays bounded in [0,1]', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 1.0, 0);
    for (let i = 0; i < 10; i++) healthyFollower(w, i, 0, r);
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= 60; d++) { clock.tick = d * cfg.ticksPerDay; runReligionSystem(w, noConvert({ graceThreshold: 2 }), createRNG(1)); }   // threshold high → favor never spent, pure accrual
    const favor = store.byId[r].favor!;
    expect(favor).toBeGreaterThan(0.3);          // devotion built real favor
    expect(favor).toBeLessThanOrEqual(1);        // …but it can't run away
  });
});

describe('living gods — avatars (M18 s3)', () => {
  const avatarsIn = (w: World) => w.query(C_SPECIAL).filter(e => w.getComponent<Special>(e, C_SPECIAL)!.behavior === 'avatar');

  it('a faith at the peak of favor manifests its god — exactly one avatar, tied to the faith', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.9, 0);
    const r2 = createReligion(store, 'the Faith of Bb', 'Bb', ['the peaceful path'], 0.9, 0);
    store.byId[r].favor = 1; store.byId[r2].favor = 1;                 // BOTH at the peak
    for (let i = 0; i < cfg.minFaithFollowers; i++) healthyFollower(w, i % 8, 0, r);
    for (let i = 0; i < cfg.minFaithFollowers; i++) healthyFollower(w, i % 8, 3, r2);
    runGraceInterval(w);   // no SpecialAgentSystem here, so a spawned avatar persists to the end
    const avatars = avatarsIn(w);
    expect(avatars.length).toBe(1);                                   // singular — one god at a time
    expect(w.getComponent<Special>(avatars[0], C_SPECIAL)!.faith === r || w.getComponent<Special>(avatars[0], C_SPECIAL)!.faith === r2).toBe(true);
    const manifested = w.getComponent<Special>(avatars[0], C_SPECIAL)!.faith!;
    expect(store.byId[manifested].favor!).toBeLessThan(cfg.avatarFavorThreshold);   // nearly all its favor was spent
  });

  it('a favor-poor faith does NOT manifest a god', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.9, 0);
    store.byId[r].favor = 0.5;                                        // above the boon threshold, below the avatar threshold
    for (let i = 0; i < cfg.minFaithFollowers; i++) healthyFollower(w, i % 8, 0, r);
    // Hold accrual off so favor stays below the avatar threshold across the interval (it grants boons, not a god).
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= cfg.graceIntervalDays + 1; d++) { clock.tick = d * cfg.ticksPerDay; runReligionSystem(w, noConvert({ favorGainPerDay: 0 }), createRNG(1)); }
    expect(avatarsIn(w).length).toBe(0);
  });

  it('a manifest god gladdens nearby faithful, awes rivals, and fades after its time', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 500, day: 2, hour: 0, isDay: true });
    const map: TileMapData = { width: 8, height: 8, biomeIndex: new Uint16Array(64), biomeIds: ['g'], biomeNames: ['G'], colors: ['#333'], passableByBiome: [true] };
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, map);
    const av = w.createEntity();
    w.addComponent(av, C_POSITION, { x: 4, y: 4 });
    w.addComponent<Health>(av, C_HEALTH, { value: 1, ill: false });
    w.addComponent<Special>(av, C_SPECIAL, { kind: 'avatar', name: 'aa made flesh', icon: 'avatar', behavior: 'avatar', faith: 'faith.0', str: 14, dex: 14, con: 14, ferocity: 1, spawnTick: 240, despawnTick: 240 + 2 * cfg.ticksPerDay });
    const faithful = healthyFollower(w, 4, 5, 'faith.0', { mood: 0.5 });   // adjacent, same faith
    const rival = healthyFollower(w, 3, 4, 'faith.9', { mood: 0.7 });      // adjacent, a different faith

    runSpecialAgentSystem(w, cfg, createRNG(1), testContent());
    expect(w.getComponent<Agent>(faithful, C_AGENT)!.mood!).toBeGreaterThan(0.5);   // the faithful rejoiced
    expect(w.getComponent<Agent>(rival, C_AGENT)!.mood!).toBeLessThan(0.7);         // the rival felt its awe
    expect(w.isAlive(av)).toBe(true);                                              // still walking

    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    clock.tick = 240 + 2 * cfg.ticksPerDay + 1;                                     // past its time
    runSpecialAgentSystem(w, cfg, createRNG(1), testContent());
    expect(w.isAlive(av)).toBe(false);                                             // the god withdrew
  });
});

// ── Apostasy & redemption (M18 s4) ────────────────────────────────────────────────────
describe('apostasy & redemption (M18 s4)', () => {
  // Run the daily religion tick for `days` days (no conversion noise, era schism suppressed).
  function runDays(w: World, days: number, from = 1): void {
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = from; d < from + days; d++) {
      clock.tick = d * cfg.ticksPerDay;
      runReligionSystem(w, noConvert({ evolutionIntervalDays: 100000 }), createRNG(1));
    }
  }

  it('chronic misery breaks faith — a wretched follower forsakes it after the doubt matures', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.6, 0);
    const wretch = placedFollower(w, 5, 5, r, 0.1);                    // far below apostasyMoodThreshold
    runDays(w, cfg.apostasyDoubtDays + 1);
    const a = w.getComponent<Agent>(wretch, C_AGENT)!;
    expect(a.religionId).toBeUndefined();                              // faith broke
    expect(a.mood!).toBeLessThan(0.35);                                // and the loss wounded further
    expect(store.byId[r].apostates).toBe(1);                           // the faith counts its lost
  });

  it('a content follower never doubts; better days drain doubt, so broken misery never matures', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.6, 0);
    const content = placedFollower(w, 2, 2, r, 0.7);
    const waverer = placedFollower(w, 8, 8, r, 0.1);
    // Two despairing days, two better days, repeated — doubt saws 1,2,1,0,… and never matures.
    const wa = w.getComponent<Agent>(waverer, C_AGENT)!;
    for (let d = 1; d <= 12; d++) {
      wa.mood = d % 4 === 1 || d % 4 === 2 ? 0.1 : 0.7;
      runDays(w, 1, d);
    }
    expect(w.getComponent<Agent>(content, C_AGENT)!.religionId).toBe(r);
    expect(w.getComponent<Agent>(content, C_AGENT)!.doubt ?? 0).toBe(0);
    expect(wa.religionId).toBe(r);                                     // interrupted doubt never matured
    expect(store.byId[r].apostates ?? 0).toBe(0);
  });

  it('grief shakes faith — two children lost within days break a parent, even a contented one', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.8, 0);
    const mother = placedFollower(w, 5, 5, r, 0.9);                    // thriving — grief alone must be able to break
    const c1 = placedFollower(w, 6, 5, r, 0.9);
    const c2 = placedFollower(w, 7, 5, r, 0.9);
    for (const c of [c1, c2]) w.addComponent<Lineage>(c, C_LINEAGE, { partner: null, parents: [mother], children: [], reproCooldownTicks: 0 });
    const tpy = ticksPerYear(cfg);
    killAgent(w, c1, 10, 'illness', tpy);                              // an untimely death — doubt planted
    const ma = w.getComponent<Agent>(mother, C_AGENT)!;
    expect(ma.doubt).toBe(3);                                          // outliving your child, the heaviest grief
    killAgent(w, c2, 20, 'slain by a wolf', tpy);                      // a second loss, days later
    expect(ma.doubt).toBe(6);
    runDays(w, 1);                                                     // the next daily reckoning
    expect(ma.religionId).toBeUndefined();                             // her faith broke
    expect(store.byId[r].apostates).toBe(1);
  });

  it('a death of old age is the natural order — it shakes no faith', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.8, 0);
    const child = placedFollower(w, 5, 5, r, 0.9);
    const elder = placedFollower(w, 6, 5, r, 0.9);
    w.addComponent<Lineage>(elder, C_LINEAGE, { partner: null, parents: [], children: [child], reproCooldownTicks: 0 });
    killAgent(w, elder, 10, 'old age', ticksPerYear(cfg));
    expect(w.getComponent<Agent>(child, C_AGENT)!.doubt ?? 0).toBe(0); // mourned, but faith unshaken
    expect(store.byId[r]).toBeDefined();
  });

  it('a holy-day festival redeems a MENDED faithless neighbour — the miserable are not won', () => {
    const { w, store } = faithWorld(0);
    const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.8, 0);
    placedFollower(w, 5, 5, r, 0.7);                                   // the celebrant
    const mended = placedFollower(w, 6, 5, undefined, 0.7);            // faithless, spirits mended
    const broken = placedFollower(w, 4, 5, undefined, 0.2);            // faithless, still wretched
    runDays(w, cfg.holyDayIntervalDays + 1);                           // exactly one holy day falls inside
    expect(w.getComponent<Agent>(mended, C_AGENT)!.religionId).toBe(r);            // drawn into the faith
    expect(w.getComponent<Agent>(broken, C_AGENT)!.religionId).toBeUndefined();    // despair keeps them out
    expect(store.byId[r].redeemed).toBe(1);
  });

  it('apostasy & redemption are deterministic — identical under different seeds (no sim RNG)', () => {
    const run = (seed: number) => {
      const { w, store } = faithWorld(0);
      const r = createReligion(store, 'the Faith of Aa', 'Aa', ['the peaceful path'], 0.8, 0);
      placedFollower(w, 5, 5, r, 0.7);
      const wretch = placedFollower(w, 8, 8, r, 0.1);
      const lost = placedFollower(w, 6, 5, undefined, 0.7);
      const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
      for (let d = 1; d <= cfg.holyDayIntervalDays + 1; d++) {
        clock.tick = d * cfg.ticksPerDay;
        runReligionSystem(w, noConvert({ evolutionIntervalDays: 100000 }), createRNG(seed));
      }
      const wa = w.getComponent<Agent>(wretch, C_AGENT)!;
      const la = w.getComponent<Agent>(lost, C_AGENT)!;
      return `${wa.religionId}|${wa.mood}|${la.religionId}|${la.mood}|${store.byId[r].apostates}|${store.byId[r].redeemed}`;
    };
    expect(run(1)).toBe(run(9999));
  });
});

describe('faith through world-gen (M18)', () => {
  it('founders follow a faith born of their culture; children inherit the mother’s', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 8 }, testContent());
    const store = sim.world.getComponent<ReligionStoreData>(sim.world.query(C_RELIGIONSTORE)[0], C_RELIGIONSTORE)!;
    expect(Object.keys(store.byId).length).toBeGreaterThan(0);
    const faithful = sim.world.query(C_AGENT).filter(e => sim.world.getComponent<Agent>(e, C_AGENT)!.religionId !== undefined);
    expect(faithful.length).toBeGreaterThan(0);
  });
});
