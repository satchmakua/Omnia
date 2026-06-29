// Recreation / fun need + leisure (M28 slice 1). Folk gain a fourth need — fun — that drains slowly
// and is met by a new 'relax' action (and, passively, by taverns and festivals). These tests pin the
// decay, the leisure action selection (incl. hysteresis + survival pre-emption), the restore paths,
// the fun→mood coupling, and the milestone-style "bored vs content behave differently" shift.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_CIVIC, C_CLOCK,
} from '../src/sim/components.ts';
import type { Agent, Needs, Civic, Clock, Position } from '../src/sim/components.ts';
import { runHungerSystem } from '../src/sim/systems/HungerSystem.ts';
import { runActionSystem } from '../src/sim/systems/ActionSystem.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { runCivicSystem } from '../src/sim/systems/CivicSystem.ts';
import { runMoodSystem } from '../src/sim/systems/MoodSystem.ts';
import { EVENT_EFFECTS } from '../src/event/effects.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();
const ADULT = Math.floor(25 * ticksPerYear(cfg));   // 25y in ticks — well over adultAgeYears (16)

function agent(w: World, needs: Partial<Needs>, action: Agent['action'] = 'wander', mood = 0.6): EntityId {
  const e = w.createEntity();
  w.addComponent<Position>(e, C_POSITION, { x: 5, y: 5 });
  w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 1, fun: 1, ...needs });
  w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action, ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood });
  return e;
}

describe('the fun need (M28)', () => {
  it('fun drains over time (no death from it)', () => {
    const w = new World();
    const e = agent(w, { fun: 1 });
    const needs = w.getComponent<Needs>(e, C_NEEDS)!;
    for (let t = 0; t < cfg.ticksPerDay; t++) runHungerSystem(w, cfg);
    expect(needs.fun!).toBeLessThan(1);
    expect(needs.fun!).toBeCloseTo(1 - cfg.funDecayPerDay, 5);   // ~a day's decay
    expect(w.hasComponent(e, C_AGENT)).toBe(true);               // boredom isn't fatal
  });

  it('a fixture with no fun field reads as fully entertained (back-compat)', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 1 });   // no fun
    w.addComponent<Agent>(e, C_AGENT, { name: 'Old', action: 'wander', ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).not.toBe('relax');   // fun ?? 1 → not bored
  });
});

describe('leisure action selection (M28)', () => {
  it('a bored but otherwise comfortable soul takes leisure', () => {
    const w = new World();
    const e = agent(w, { fun: 0.2 });                 // bored; everything else met
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).toBe('relax');
  });

  it('a content soul does not relax', () => {
    const w = new World();
    const e = agent(w, { fun: 1 });
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).not.toBe('relax');
  });

  it('survival pre-empts leisure (a hungry relaxer goes to eat)', () => {
    const w = new World();
    const e = agent(w, { fun: 0.5, hunger: 0.2 }, 'relax');   // mid-leisure but now hungry
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).toBe('seek_food');
  });

  it('leisure holds until refreshed (hysteresis, no relax↔work jitter)', () => {
    const w = new World();
    const e = agent(w, { fun: 0.6 }, 'relax');   // above the 0.4 threshold but below REFRESHED (0.85)
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).toBe('relax');   // keeps relaxing, doesn't flip back
  });
});

describe('leisure restores fun (M28)', () => {
  it('the relax action recovers fun', () => {
    const w = new World();
    const rng = createRNG(1);
    const e = agent(w, { fun: 0.4 }, 'relax');
    const needs = w.getComponent<Needs>(e, C_NEEDS)!;
    runMovementSystem(w, cfg, rng, content);
    expect(needs.fun!).toBeGreaterThan(0.4);
    expect(needs.fun!).toBeCloseTo(0.4 + cfg.funRestorePerTick, 5);
  });

  it('a tavern (cheer) tops up the fun of folk nearby', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const tav = w.createEntity();
    w.addComponent<Position>(tav, C_POSITION, { x: 5, y: 5 });
    w.addComponent<Civic>(tav, C_CIVIC, { kind: 'tavern', name: 'The Rest', effect: 'cheer', radius: 5, magnitude: 0.15 });
    const e = agent(w, { fun: 0.5, social: 0.5 });
    const needs = w.getComponent<Needs>(e, C_NEEDS)!;
    runCivicSystem(w, cfg);
    expect(needs.fun!).toBeCloseTo(0.65, 5);   // +magnitude
  });

  it('a festival entertains the town (fun spike)', () => {
    const w = new World();
    const e = agent(w, { fun: 0.4 }, 'wander', 0.5);
    const needs = w.getComponent<Needs>(e, C_NEEDS)!;
    EVENT_EFFECTS.festival({ world: w, cfg, rng: createRNG(1), tick: 0 });
    expect(needs.fun!).toBeCloseTo(0.7, 5);   // +0.3
  });
});

describe('fun is causal on mood (M28, D26)', () => {
  it('chronic boredom drags mood lower than contentment', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const bored   = agent(w, { fun: 0.1 }, 'wander', 0.6);
    const content2 = agent(w, { fun: 1.0 }, 'wander', 0.6);
    runMoodSystem(w, cfg);
    const mb = w.getComponent<Agent>(bored, C_AGENT)!.mood!;
    const mc = w.getComponent<Agent>(content2, C_AGENT)!.mood!;
    expect(mb).toBeLessThan(mc);   // the bored soul ends the day less content
  });
});

describe('DoD — bored vs content folk behave measurably differently (M28)', () => {
  it('the action distribution shifts: bored folk relax, content folk do not', () => {
    const w = new World();
    const bored: EntityId[] = [], content2: EntityId[] = [];
    for (let i = 0; i < 20; i++) bored.push(agent(w, { fun: 0.1 }));
    for (let i = 0; i < 20; i++) content2.push(agent(w, { fun: 1.0 }));
    runActionSystem(w, cfg);
    const relaxing = (ids: EntityId[]) => ids.filter(e => w.getComponent<Agent>(e, C_AGENT)!.action === 'relax').length;
    expect(relaxing(bored)).toBe(20);      // all the bored take leisure
    expect(relaxing(content2)).toBe(0);    // none of the content do
  });
});
