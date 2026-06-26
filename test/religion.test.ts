// Religion (M18 slice 1): the faith store + the ReligionSystem (extinction + schism into
// sects), faith inheritance, and the co-religionist social-warmth coupling.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_RELIGIONSTORE, C_POSITION } from '../src/sim/components.ts';
import type { Agent, Clock } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import {
  createReligionStore, createReligion, forkReligion, getReligion, faithFactor, pruneReligions,
} from '../src/religion/religionStore.ts';
import type { ReligionStoreData } from '../src/religion/religionStore.ts';
import { runReligionSystem } from '../src/sim/systems/ReligionSystem.ts';
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
});

// ── Conversion + faith→mood (M18 slice 2) ─────────────────────────────────────────────
function placedFollower(w: World, x: number, y: number, religionId: string, mood = MOOD_BASELINE): EntityId {
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

describe('faith through world-gen (M18)', () => {
  it('founders follow a faith born of their culture; children inherit the mother’s', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 8 }, testContent());
    const store = sim.world.getComponent<ReligionStoreData>(sim.world.query(C_RELIGIONSTORE)[0], C_RELIGIONSTORE)!;
    expect(Object.keys(store.byId).length).toBeGreaterThan(0);
    const faithful = sim.world.query(C_AGENT).filter(e => sim.world.getComponent<Agent>(e, C_AGENT)!.religionId !== undefined);
    expect(faithful.length).toBeGreaterThan(0);
  });
});
