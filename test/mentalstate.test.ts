// Mental states / breaks (M28 slice 2) — mood made causal. When mood bottoms out a soul cracks into
// a despair (withdraws) or, if aggressive, anger (lashes out — even an honest one); a peak may bring
// elation (celebrates). These tests pin the triggers (+ the despair/anger split by disposition), the
// behaviour override (and that survival still pre-empts it), the anger→crime path, and recovery.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_PERSONALITY, C_ALIGNMENT, C_WALLET, C_HEALTH, C_CLOCK,
} from '../src/sim/components.ts';
import type { Agent, Needs, Personality, Alignment, Wallet, Health, Clock, Position, MentalState } from '../src/sim/components.ts';
import { runMentalStateSystem } from '../src/sim/systems/MentalStateSystem.ts';
import { runActionSystem } from '../src/sim/systems/ActionSystem.ts';
import { runCrimeSystem } from '../src/sim/systems/CrimeSystem.ts';
import { createRNG } from '../src/sim/rng.ts';

const cfg = defaultConfig;
const ADULT = Math.floor(25 * ticksPerYear(cfg));

function dayWorld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  return w;
}
function soul(w: World, mood: number, opts: { trait?: string; law?: number; state?: MentalState; until?: number; needs?: Partial<Needs> } = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Position>(e, C_POSITION, { x: 5, y: 5 });
  w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 1, fun: 1, ...opts.needs });
  w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood, mentalState: opts.state, mentalUntil: opts.until });
  if (opts.trait) w.addComponent<Personality>(e, C_PERSONALITY, { trait: opts.trait });
  if (opts.law !== undefined) w.addComponent<Alignment>(e, C_ALIGNMENT, { good: 0.8, law: opts.law });
  return e;
}
const stateOf = (w: World, e: EntityId) => w.getComponent<Agent>(e, C_AGENT)!.mentalState;
const actionOf = (w: World, e: EntityId) => w.getComponent<Agent>(e, C_AGENT)!.action;

describe('mental breaks trigger on mood extremes (M28 s2)', () => {
  it('the miserable break into despair (the gentle withdraw)', () => {
    const w = dayWorld();
    const ids = Array.from({ length: 60 }, () => soul(w, 0.1, { law: 0.2 }));   // not aggressive
    runMentalStateSystem(w, cfg);
    const broke = ids.filter(e => stateOf(w, e) === 'despair').length;
    expect(broke).toBeGreaterThan(0);                                // some cracked (rolled break)
    expect(ids.some(e => stateOf(w, e) === 'anger')).toBe(false);    // none of the gentle raged
  });

  it('the aggressive rage instead of moping', () => {
    const w = dayWorld();
    const ids = Array.from({ length: 60 }, () => soul(w, 0.1, { trait: 'brave' }));
    runMentalStateSystem(w, cfg);
    expect(ids.some(e => stateOf(w, e) === 'anger')).toBe(true);
    expect(ids.some(e => stateOf(w, e) === 'despair')).toBe(false);
  });

  it('the joyful may overflow into elation', () => {
    const w = dayWorld();
    const ids = Array.from({ length: 80 }, () => soul(w, 0.98));
    runMentalStateSystem(w, cfg);
    expect(ids.some(e => stateOf(w, e) === 'elation')).toBe(true);
  });

  it('the merely content never break', () => {
    const w = dayWorld();
    const ids = Array.from({ length: 50 }, () => soul(w, 0.6));
    runMentalStateSystem(w, cfg);
    expect(ids.every(e => stateOf(w, e) === undefined)).toBe(true);
  });

  it('a break passes after its time, with a little catharsis', () => {
    const w = dayWorld();
    const e = soul(w, 0.3, { state: 'despair', until: cfg.ticksPerDay - 1 });   // already due to end
    runMentalStateSystem(w, cfg);
    expect(stateOf(w, e)).toBeUndefined();
    expect(w.getComponent<Agent>(e, C_AGENT)!.mood!).toBeCloseTo(0.45, 5);       // +catharsis
  });
});

describe('a break overrides ordinary life — but never survival (M28 s2)', () => {
  it('despair withdraws (wander), elation celebrates (relax)', () => {
    const w = new World();
    const d = soul(w, 0.1, { state: 'despair' });
    const j = soul(w, 0.98, { state: 'elation' });
    runActionSystem(w, cfg);
    expect(actionOf(w, d)).toBe('wander');
    expect(actionOf(w, j)).toBe('relax');
  });

  it('a hungry despairing soul still goes to eat (survival pre-empts the break)', () => {
    const w = new World();
    const e = soul(w, 0.1, { state: 'despair', needs: { hunger: 0.2 } });
    runActionSystem(w, cfg);
    expect(actionOf(w, e)).toBe('seek_food');
  });
});

describe('anger loosens the hand to crime (M28 s2)', () => {
  const forceCrime = { ...cfg, crimeChancePerDay: 1 };   // make the offend roll certain to isolate the mechanic
  function pair(w: World, attackerState?: MentalState): { attacker: EntityId; victim: EntityId } {
    const mk = (x: number, state?: MentalState): EntityId => {
      const e = w.createEntity();
      w.addComponent<Position>(e, C_POSITION, { x, y: 5 });
      w.addComponent<Agent>(e, C_AGENT, { name: `C${e}`, action: 'wander', ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood: 0.5, mentalState: state });
      w.addComponent<Alignment>(e, C_ALIGNMENT, { good: 0.8, law: 0 });   // peaceable & honest
      w.addComponent<Wallet>(e, C_WALLET, { gold: 20, debt: 0 });
      w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
      return e;
    };
    return { attacker: mk(5, attackerState), victim: mk(6) };
  }

  it('a peaceable soul in a rage lashes out at a neighbour', () => {
    const w = dayWorld();
    const { attacker, victim } = pair(w, 'anger');
    const vh = w.getComponent<Health>(victim, C_HEALTH)!;
    runCrimeSystem(w, forceCrime, createRNG(2));
    expect(vh.value).toBeLessThan(1);   // the honest soul struck out — only because enraged
  });

  it('the same soul, calm, harms no one (the gate holds)', () => {
    const w = dayWorld();
    const { victim } = pair(w, undefined);   // no rage; good & solvent → never offends
    const vh = w.getComponent<Health>(victim, C_HEALTH)!;
    runCrimeSystem(w, forceCrime, createRNG(2));
    expect(vh.value).toBe(1);
  });
});
