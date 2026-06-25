// Conflict (M16 slice 2): crime & vice — theft / assault / murder driven by alignment &
// desperation, with the victim's defence and a good neighbour's rough justice.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_ALIGNMENT, C_WALLET, C_POSITION, C_HEALTH, C_BODY, C_PERSONALITY, C_CLOCK, C_CRIME,
} from '../src/sim/components.ts';
import type {
  Agent, Alignment, Wallet, Health, Body, Personality, Clock, Crime,
} from '../src/sim/components.ts';
import { runCrimeSystem } from '../src/sim/systems/CrimeSystem.ts';

const cfg = defaultConfig;
const always = () => 0;   // forces the daily roll to fire and every blow to land

function world(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  return w;
}
interface Opts { good?: number; trait?: string; str?: number; con?: number; health?: number; gold?: number; debt?: number; age?: number; }
function person(w: World, x: number, y: number, o: Opts = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: `P${e}`, action: 'wander', ticksAlive: Math.floor((o.age ?? 30) * ticksPerYear(cfg)),
    wealthGoal: 50, sex: 'male', lifespanTicks: 1e9,
  });
  w.addComponent<Alignment>(e, C_ALIGNMENT, { good: o.good ?? 0.5, law: 0 });
  w.addComponent<Wallet>(e, C_WALLET, { gold: o.gold ?? 0, debt: o.debt ?? 0 });
  w.addComponent(e, C_POSITION, { x, y });
  w.addComponent<Health>(e, C_HEALTH, { value: o.health ?? 1, ill: false });
  w.addComponent<Body>(e, C_BODY, { str: o.str ?? 10, dex: 10, con: o.con ?? 10, int: 10, wis: 10, cha: 10, heightCm: 170, build: 0.5, eye: 0.5, hair: 0.5 });
  if (o.trait) w.addComponent<Personality>(e, C_PERSONALITY, { trait: o.trait });
  return e;
}
const rap = (w: World, e: EntityId) => w.getComponent<Crime>(e, C_CRIME);

describe('CrimeSystem (M16 slice 2)', () => {
  it('a wicked, desperate thief robs a neighbour of gold', () => {
    const w = world();
    const thief = person(w, 5, 5, { good: -0.2, gold: 0, debt: 5, trait: 'content' });
    const mark = person(w, 6, 5, { gold: 100 });
    runCrimeSystem(w, cfg, always);
    expect(w.getComponent<Wallet>(mark, C_WALLET)!.gold).toBe(100 - cfg.theftAmount);
    expect(w.getComponent<Wallet>(thief, C_WALLET)!.gold).toBeGreaterThan(0);   // loot (paid down debt first / pocketed)
    expect(rap(w, thief)!.thefts).toBe(1);
  });

  it('a wicked, aggressive bully assaults but does not kill a hale neighbour', () => {
    const w = world();
    const bully = person(w, 5, 5, { good: -0.3, str: 10, trait: 'hot-headed' });
    const victim = person(w, 6, 5, { con: 16, health: 1, good: 0.5 });   // tough & good (but won't avenge itself)
    runCrimeSystem(w, cfg, always);
    expect(rap(w, bully)!.assaults).toBe(1);
    expect(w.getComponent<Health>(victim, C_HEALTH)!.value).toBeLessThan(1);   // wounded
    expect(w.hasComponent(victim, C_AGENT)).toBe(true);                        // but alive
  });

  it('a strong, evil killer murders a frail victim (a recorded murder)', () => {
    const w = world();
    const killer = person(w, 5, 5, { good: -0.6, str: 18, trait: 'hot-headed' });
    person(w, 6, 5, { health: 0.2, con: 6, good: -0.5 });   // frail, and too evil to avenge anyone
    runCrimeSystem(w, cfg, always);
    expect(rap(w, killer)!.murders).toBe(1);
    expect(w.query(C_AGENT).length).toBe(1);   // the victim is gone (a tombstone)
  });

  it('a good, solvent agent never offends', () => {
    const w = world();
    const saint = person(w, 5, 5, { good: 0.8, gold: 50, trait: 'gentle' });
    person(w, 6, 5, { gold: 100 });
    runCrimeSystem(w, cfg, always);
    expect(rap(w, saint)).toBeUndefined();
  });

  it('a child does not offend', () => {
    const w = world();
    const kid = person(w, 5, 5, { good: -0.5, trait: 'hot-headed', age: 8 });
    person(w, 6, 5, { gold: 100 });
    runCrimeSystem(w, cfg, always);
    expect(rap(w, kid)).toBeUndefined();
  });

  it('rough justice: a good neighbour can fell a thief on the spot', () => {
    const w = world();
    const thief = person(w, 5, 5, { good: -0.2, debt: 5, trait: 'content', health: 0.1, con: 6 });
    person(w, 6, 5, { gold: 100 });                            // the mark (the nearest neighbour → robbed)
    person(w, 7, 5, { good: 0.9, str: 18, trait: 'brave' });   // an upstanding, mighty neighbour one ring out
    runCrimeSystem(w, cfg, always);
    expect(w.hasComponent(thief, C_AGENT)).toBe(false);   // struck down for the crime
  });
});
