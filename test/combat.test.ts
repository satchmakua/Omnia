// Conflict (M16 slice 1): ability-score-driven combat — the pure math, and the CombatSystem
// where predators threaten folk and folk fight back (wounds, scars, kills, veterans, deaths).
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_BODY, C_HEALTH, C_POSITION, C_FAUNA, C_CLOCK, C_COMBAT,
} from '../src/sim/components.ts';
import type { Agent, Body, Health, Fauna, Clock, Combat } from '../src/sim/components.ts';
import {
  hitChance, hitDamage, rollAttack, combatantOf, beastCombatant, markCombat,
} from '../src/sim/combat.ts';
import { runCombatSystem } from '../src/sim/systems/CombatSystem.ts';

const cfg = defaultConfig;
const avg = { str: 10, dex: 10, con: 10, martial: 0.5, ferocity: 1, prowess: 0 };

// ── Pure combat math ────────────────────────────────────────────────────────────────
describe('combat math (M16)', () => {
  it('hitChance rises with DEX and martiality, and stays in (0.1, 0.95)', () => {
    expect(hitChance({ ...avg, dex: 16 }, avg)).toBeGreaterThan(hitChance(avg, avg));
    expect(hitChance({ ...avg, martial: 1 }, avg)).toBeGreaterThan(hitChance(avg, avg));
    expect(hitChance({ ...avg, dex: 99 }, avg)).toBeLessThanOrEqual(0.95);
    expect(hitChance({ ...avg, dex: 1 }, { ...avg, dex: 99 })).toBeGreaterThanOrEqual(0.1);
  });

  it('hitDamage rises with attacker STR and falls with defender CON', () => {
    expect(hitDamage({ ...avg, str: 16 }, avg)).toBeGreaterThan(hitDamage(avg, avg));
    expect(hitDamage(avg, { ...avg, con: 16 })).toBeLessThan(hitDamage(avg, avg));
  });

  it('rollAttack returns 0 on a miss and damage on a hit (deterministic by rng)', () => {
    expect(rollAttack(avg, avg, () => 0.99)).toBe(0);        // a high roll misses
    expect(rollAttack(avg, avg, () => 0)).toBeGreaterThan(0); // a low roll hits
  });

  it('beastCombatant scales with size; predators are fiercer than grazers', () => {
    expect(beastCombatant('large', true).str).toBeGreaterThan(beastCombatant('small', true).str);
    expect(beastCombatant('medium', true).martial).toBeGreaterThan(beastCombatant('medium', false).martial);
  });
});

// ── combatantOf / markCombat ──────────────────────────────────────────────────────────
function folk(w: World, over: Partial<Body> = {}, health = 1): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: 'F', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Body>(e, C_BODY, { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, heightCm: 170, build: 0.5, eye: 0.5, hair: 0.5, ...over });
  w.addComponent<Health>(e, C_HEALTH, { value: health, ill: false });
  return e;
}

describe('combatantOf / markCombat (M16)', () => {
  it('reads Body scores, defaults to average when unbodied, and counts prowess from a record', () => {
    const w = new World();
    const e = folk(w, { str: 14, dex: 12, con: 13 });
    const c = combatantOf(w, e);
    expect(c.str).toBe(14); expect(c.dex).toBe(12); expect(c.con).toBe(13);
    const bare = w.createEntity();
    w.addComponent<Agent>(bare, C_AGENT, { name: 'B', action: 'wander', ticksAlive: 1, wealthGoal: 0, sex: 'male', lifespanTicks: 1e9 });
    expect(combatantOf(w, bare).str).toBe(10);   // unbodied → average
    markCombat(w, e, 2, 3);
    expect(combatantOf(w, e).prowess).toBe(2 + 3 * 2);
  });

  it('markCombat lazily attaches a Combat record and accumulates', () => {
    const w = new World();
    const e = folk(w);
    expect(w.hasComponent(e, C_COMBAT)).toBe(false);
    markCombat(w, e, 1, 0);
    markCombat(w, e, 0, 2);
    const c = w.getComponent<Combat>(e, C_COMBAT)!;
    expect(c.scars).toBe(1); expect(c.kills).toBe(2);
  });
});

// ── CombatSystem ────────────────────────────────────────────────────────────────────
function combatWorld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 1000, day: 1, hour: 0, isDay: true });
  return w;
}
function beast(w: World, x: number, y: number, diet: 'predator' | 'grazer', size: Fauna['size'] = 'medium'): EntityId {
  const e = w.createEntity();
  w.addComponent<Fauna>(e, C_FAUNA, {
    speciesId: 's', name: 'Stalker', color: '#a00', size, diet,
    hunger: 1, hungerDecayPerTick: 0, breedThreshold: 1, breedCooldownTicks: 0, ticksAlive: 0,
  });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}
const always = () => 0;   // every roll passes (aggression fires, every blow lands)

describe('CombatSystem (M16)', () => {
  it('a predator beside a folk wounds it (health drops)', () => {
    const w = combatWorld();
    const f = folk(w, {}, 1);
    w.addComponent(f, C_POSITION, { x: 5, y: 5 });
    beast(w, 6, 5, 'predator');
    runCombatSystem(w, { ...cfg, predatorAggressionChance: 1 }, always);
    expect(w.getComponent<Health>(f, C_HEALTH)!.value).toBeLessThan(1);
  });

  it('a strong folk slays the attacking beast and earns a kill (a veteran)', () => {
    const w = combatWorld();
    const f = folk(w, { str: 18, dex: 16 }, 1);   // a mighty warrior
    w.addComponent(f, C_POSITION, { x: 5, y: 5 });
    const b = beast(w, 6, 5, 'predator', 'small');
    runCombatSystem(w, { ...cfg, predatorAggressionChance: 1 }, always);
    expect(w.isAlive(b)).toBe(false);                       // beast slain
    expect(w.getComponent<Combat>(f, C_COMBAT)!.kills).toBe(1);
  });

  it('a killing blow on a near-dead folk is lethal (tombstone, not an agent)', () => {
    const w = combatWorld();
    const f = folk(w, { str: 6 }, 0.05);   // frail and already near death
    w.addComponent(f, C_POSITION, { x: 5, y: 5 });
    beast(w, 6, 5, 'predator', 'large');
    runCombatSystem(w, { ...cfg, predatorAggressionChance: 1 }, always);
    expect(w.hasComponent(f, C_AGENT)).toBe(false);   // slain → stripped to a tombstone
  });

  it('a grazer never attacks a neighbouring folk', () => {
    const w = combatWorld();
    const f = folk(w, {}, 1);
    w.addComponent(f, C_POSITION, { x: 5, y: 5 });
    beast(w, 6, 5, 'grazer');
    runCombatSystem(w, { ...cfg, predatorAggressionChance: 1 }, always);
    expect(w.getComponent<Health>(f, C_HEALTH)!.value).toBe(1);
  });
});
