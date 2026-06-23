import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { createRNG } from '../src/sim/rng.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_FLORA, C_CLOCK,
} from '../src/sim/components.ts';
import type { Agent, Needs, Position, Flora, Clock } from '../src/sim/components.ts';
import { runClockSystem }    from '../src/sim/systems/ClockSystem.ts';
import { runHungerSystem }   from '../src/sim/systems/HungerSystem.ts';
import { runActionSystem }   from '../src/sim/systems/ActionSystem.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

// ── ClockSystem ──────────────────────────────────────────────────────────────

describe('ClockSystem', () => {
  function makeClock() {
    const w = new World();
    const clock: Clock = { tick: 0, day: 0, hour: 0, isDay: true };
    const e = w.createEntity();
    w.addComponent(e, C_CLOCK, clock);
    return { w, clock, e };
  }

  it('increments tick each call', () => {
    const { w, clock, e } = makeClock();
    runClockSystem(w, cfg, e);
    expect(clock.tick).toBe(1);
  });

  it('advances day after ticksPerDay ticks', () => {
    const { w, clock, e } = makeClock();
    for (let i = 0; i < cfg.ticksPerDay; i++) runClockSystem(w, cfg, e);
    expect(clock.day).toBe(1);
  });

  it('flips isDay at the midpoint of the day', () => {
    const { w, clock, e } = makeClock();
    for (let i = 0; i < cfg.ticksPerDay / 2; i++) runClockSystem(w, cfg, e);
    expect(clock.isDay).toBe(false);
  });
});

// ── HungerSystem ─────────────────────────────────────────────────────────────

describe('HungerSystem', () => {
  function makeAgent(hunger: number, energy: number) {
    const w = new World();
    const needs: Needs = { hunger, energy, social: 1 };
    const e = w.createEntity();
    w.addComponent(e, C_AGENT, { name: 'T', action: 'wander', ticksAlive: 0, wealthGoal: 50, sex: 'female', lifespanTicks: 1_000_000_000 } satisfies Agent);
    w.addComponent(e, C_NEEDS, needs);
    return { w, needs, e };
  }

  it('decays hunger and energy each tick', () => {
    const { w, needs } = makeAgent(1.0, 1.0);
    runHungerSystem(w, cfg);
    expect(needs.hunger).toBeLessThan(1.0);
    expect(needs.energy).toBeLessThan(1.0);
  });

  it('kills agent when hunger reaches 0', () => {
    const { w, e } = makeAgent(0.0, 1.0);
    runHungerSystem(w, cfg);
    expect(w.isAlive(e)).toBe(false);
  });

  it('does not kill agent with positive hunger', () => {
    const { w, e } = makeAgent(1.0, 1.0);
    runHungerSystem(w, cfg);
    expect(w.isAlive(e)).toBe(true);
  });
});

// ── ActionSystem ──────────────────────────────────────────────────────────────

describe('ActionSystem', () => {
  function makeAgent(hunger: number, energy: number) {
    const w = new World();
    const agent: Agent = { name: 'A', action: 'wander', ticksAlive: 0, wealthGoal: 50, sex: 'female', lifespanTicks: 1_000_000_000 };
    const e = w.createEntity();
    w.addComponent(e, C_AGENT, agent);
    w.addComponent(e, C_NEEDS, { hunger, energy, social: 1 } satisfies Needs);
    return { w, agent };
  }

  it('chooses seek_food when hungry and not tired', () => {
    const { w, agent } = makeAgent(0.1, 0.9);
    runActionSystem(w, cfg);
    expect(agent.action).toBe('seek_food');
  });

  it('chooses sleep when tired and not hungry', () => {
    const { w, agent } = makeAgent(0.9, 0.1);
    runActionSystem(w, cfg);
    expect(agent.action).toBe('sleep');
  });

  it('wanders when all needs are comfortable (both > 0.7)', () => {
    const { w, agent } = makeAgent(0.9, 0.9);
    runActionSystem(w, cfg);
    expect(agent.action).toBe('wander');
  });

  it('keeps sleeping until rested — hysteresis, no flip the instant energy clears the gate', () => {
    const { w, agent } = makeAgent(0.9, 0.6);   // energy past the 0.4 gate but not yet rested
    agent.action = 'sleep';
    runActionSystem(w, cfg);
    expect(agent.action).toBe('sleep');          // stays asleep instead of bouncing to wander
  });

  it('wakes from sleep once rested', () => {
    const { w, agent } = makeAgent(0.9, 0.9);    // energy ≥ rested mark
    agent.action = 'sleep';
    runActionSystem(w, cfg);
    expect(agent.action).toBe('wander');
  });

  it('increments ticksAlive each call', () => {
    const { w, agent } = makeAgent(0.9, 0.9);
    runActionSystem(w, cfg);
    runActionSystem(w, cfg);
    expect(agent.ticksAlive).toBe(2);
  });
});

// ── MovementSystem ────────────────────────────────────────────────────────────

describe('MovementSystem', () => {
  it('wandering agents stay within grid bounds', () => {
    const w   = new World();
    const rng = createRNG(1);
    const small = { ...cfg, gridWidth: 4, gridHeight: 4 };

    for (let i = 0; i < 10; i++) {
      const e = w.createEntity();
      w.addComponent<Position>(e, C_POSITION, { x: 0, y: 0 });
      w.addComponent<Needs>(e, C_NEEDS, { hunger: 0.9, energy: 0.9, social: 1 });
      w.addComponent<Agent>(e, C_AGENT, { name: `A${i}`, action: 'wander', ticksAlive: 0, wealthGoal: 50, sex: 'female', lifespanTicks: 1_000_000_000 });
    }

    for (let t = 0; t < 200; t++) runMovementSystem(w, small, rng, content);

    for (const e of w.query(C_POSITION)) {
      const p = w.getComponent<Position>(e, C_POSITION)!;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(small.gridWidth);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(small.gridHeight);
    }
  });

  it('sleeping agents recover energy', () => {
    const w   = new World();
    const rng = createRNG(1);
    const needs: Needs = { hunger: 0.9, energy: 0.5, social: 1 };
    const e = w.createEntity();
    w.addComponent<Position>(e, C_POSITION, { x: 0, y: 0 });
    w.addComponent<Needs>(e, C_NEEDS, needs);
    w.addComponent<Agent>(e, C_AGENT, { name: 'Napper', action: 'sleep', ticksAlive: 0, wealthGoal: 50, sex: 'female', lifespanTicks: 1_000_000_000 });

    runMovementSystem(w, cfg, rng, content);
    expect(needs.energy).toBeGreaterThan(0.5);
  });

  it('agent seeking food forages ripe flora on the same cell', () => {
    const w   = new World();
    const rng = createRNG(1);
    const needs: Needs = { hunger: 0.3, energy: 0.9, social: 1 };

    // Ripe flora and a hungry agent on the same cell.
    const fe = w.createEntity();
    w.addComponent<Position>(fe, C_POSITION, { x: 5, y: 5 });
    w.addComponent<Flora>(fe, C_FLORA, {
      speciesId: 'ash_grass', name: 'Ash Grass', color: '#9fb86a',
      maturity: 1.0, growthPerTick: 0.01, edibleAt: 0.4, foodYield: 0.35, spreadChancePerTick: 0,
    });

    const ae = w.createEntity();
    w.addComponent<Position>(ae, C_POSITION, { x: 5, y: 5 });
    w.addComponent<Needs>(ae, C_NEEDS, needs);
    w.addComponent<Agent>(ae, C_AGENT, { name: 'Hungry', action: 'seek_food', ticksAlive: 0, wealthGoal: 50, sex: 'female', lifespanTicks: 1_000_000_000 });

    const before = needs.hunger;
    runMovementSystem(w, cfg, rng, content);
    expect(needs.hunger).toBeGreaterThan(before);          // ate
    expect(w.getComponent<Flora>(fe, C_FLORA)!.maturity).toBe(0); // grazed back to a sprout
  });
});
