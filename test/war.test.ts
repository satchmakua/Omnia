// Conflict (M16 slice 3): war between tribes — declaration & peace on the era cadence
// (OrgSystem), and battles between adjacent enemies (CombatSystem).
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_ORGSTORE, C_BODY, C_HEALTH, C_POSITION } from '../src/sim/components.ts';
import type { Agent, Clock, Body, Health } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import {
  createOrgStore, createOrg, areAtWar, declareWar, endWar,
} from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';
import { runOrgSystem } from '../src/sim/systems/OrgSystem.ts';
import { runCombatSystem } from '../src/sim/systems/CombatSystem.ts';

const cfg = defaultConfig;
const VALUES = { communal: 0.5, martial: 0.8, traditional: 0.5, open: 0.5 };

describe('war helpers (M16 slice 3)', () => {
  it('declareWar / areAtWar / endWar are symmetric', () => {
    const s = createOrgStore();
    expect(areAtWar(s, 'a', 'b')).toBe(false);
    declareWar(s, 'a', 'b', 0);
    expect(areAtWar(s, 'a', 'b')).toBe(true);
    expect(areAtWar(s, 'b', 'a')).toBe(true);   // symmetric
    declareWar(s, 'a', 'b', 0);                 // idempotent
    expect(s.wars.length).toBe(1);
    endWar(s, 'b', 'a');
    expect(areAtWar(s, 'a', 'b')).toBe(false);
  });
});

// ── OrgSystem: declaration & peace ──────────────────────────────────────────────────
function orgWorld(tick: number): { w: World; store: OrgStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  const store = createOrgStore();
  w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE, store);
  return { w, store };
}
function members(w: World, orgId: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, {
      name: `M${e}`, action: 'wander', ticksAlive: Math.floor(25 * ticksPerYear(cfg)),
      wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, orgId,
    });
  }
}
// No schism, forced war.
const warCfg = { ...cfg, schismChancePerEra: 0, minSchismMembers: 1000, warChancePerEra: 1, warMartialThreshold: 0.5, minWarMembers: 5 };
const era = cfg.evolutionIntervalDays * cfg.ticksPerDay;

describe('OrgSystem war (M16 slice 3)', () => {
  it('two martial tribes go to war on the era cadence', () => {
    const { w, store } = orgWorld(era);
    const a = createOrg(store, 'Korvu', VALUES, 0.6, 0);
    const b = createOrg(store, 'Drass', VALUES, 0.6, 0);
    members(w, a, 6); members(w, b, 6);
    runOrgSystem(w, warCfg, createRNG(1));
    expect(areAtWar(store, a, b)).toBe(true);
    expect(store.wars.length).toBe(1);
  });

  it('a war ends in peace once it is exhausted', () => {
    const { w, store } = orgWorld(0);
    const a = createOrg(store, 'Korvu', VALUES, 0.6, 0);
    const b = createOrg(store, 'Drass', VALUES, 0.6, 0);
    members(w, a, 6); members(w, b, 6);
    declareWar(store, a, b, 0);
    // advance to an era boundary past the war's lifespan, with no new war declared
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    clock.tick = (cfg.warDurationEras + 1) * era;
    runOrgSystem(w, { ...warCfg, warChancePerEra: 0 }, createRNG(1));
    expect(areAtWar(store, a, b)).toBe(false);
  });

  it('a small, peaceful pair never goes to war', () => {
    const { w, store } = orgWorld(era);
    const a = createOrg(store, 'Meek', { ...VALUES, martial: 0.2 }, 0.6, 0);
    const b = createOrg(store, 'Mild', { ...VALUES, martial: 0.2 }, 0.6, 0);
    members(w, a, 6); members(w, b, 6);
    runOrgSystem(w, warCfg, createRNG(1));
    expect(store.wars.length).toBe(0);   // neither is martial enough to start one
  });
});

// ── CombatSystem: battles ───────────────────────────────────────────────────────────
function battleWorld(): { w: World; store: OrgStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 1000, day: 1, hour: 0, isDay: true });
  const store = createOrgStore();
  w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE, store);
  return { w, store };
}
function warrior(w: World, x: number, y: number, orgId: string, over: Partial<Body> = {}, health = 1): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `W${e}`, action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId });
  w.addComponent<Body>(e, C_BODY, { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10, heightCm: 175, build: 0.5, eye: 0.5, hair: 0.5, ...over });
  w.addComponent<Health>(e, C_HEALTH, { value: health, ill: false });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}
const always = () => 0;

describe('CombatSystem battles (M16 slice 3)', () => {
  it('adjacent enemies of warring tribes wound each other', () => {
    const { w, store } = battleWorld();
    declareWar(store, 'A', 'B', 0);
    const ka = warrior(w, 5, 5, 'A');
    const kb = warrior(w, 6, 5, 'B');
    runCombatSystem(w, { ...cfg, battleChancePerTick: 1 }, always);
    const ha = w.getComponent<Health>(ka, C_HEALTH)!.value;
    const hb = w.getComponent<Health>(kb, C_HEALTH)!.value;
    expect(Math.min(ha, hb)).toBeLessThan(1);   // at least one took a wound
  });

  it('kin of the same tribe do not fight', () => {
    const { w, store } = battleWorld();
    declareWar(store, 'A', 'B', 0);
    const x = warrior(w, 5, 5, 'A');
    const y = warrior(w, 6, 5, 'A');   // same tribe
    runCombatSystem(w, { ...cfg, battleChancePerTick: 1 }, always);
    expect(w.getComponent<Health>(x, C_HEALTH)!.value).toBe(1);
    expect(w.getComponent<Health>(y, C_HEALTH)!.value).toBe(1);
  });

  it('tribes not at war do not fight', () => {
    const { w } = battleWorld();   // no war declared
    const x = warrior(w, 5, 5, 'A');
    const y = warrior(w, 6, 5, 'B');
    runCombatSystem(w, { ...cfg, battleChancePerTick: 1 }, always);
    expect(w.getComponent<Health>(x, C_HEALTH)!.value).toBe(1);
    expect(w.getComponent<Health>(y, C_HEALTH)!.value).toBe(1);
  });
});
