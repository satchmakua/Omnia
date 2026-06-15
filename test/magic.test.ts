import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_MAGIC, C_JOB, C_BUSINESS, C_POSITION,
} from '../src/sim/components.ts';
import type { Needs, Magic, Agent, Wallet, Business, Job } from '../src/sim/components.ts';
import { runCapabilitySystem } from '../src/sim/systems/CapabilitySystem.ts';
import { runEconomySystem } from '../src/sim/systems/EconomySystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

function addMage(w: World, needs: Needs, mana: number): { e: number; magic: Magic; needs: Needs } {
  const e = w.createEntity();
  const magic: Magic = { mana, maxMana: 100, manaRegenPerTick: 0.5 };
  w.addComponent<Magic>(e, C_MAGIC, magic);
  w.addComponent<Needs>(e, C_NEEDS, needs);
  return { e, magic, needs };
}

// ── CapabilitySystem ──────────────────────────────────────────────────────────

describe('CapabilitySystem', () => {
  it('regenerates mana toward the cap', () => {
    const w = new World();
    const { magic } = addMage(w, { hunger: 0.9, energy: 0.9, social: 1 }, 50); // comfortable → no cast
    runCapabilitySystem(w, cfg, content);
    expect(magic.mana).toBeCloseTo(50.5);
  });

  it('does not overfill mana past the cap', () => {
    const w = new World();
    const { magic } = addMage(w, { hunger: 0.9, energy: 0.9, social: 1 }, 100);
    runCapabilitySystem(w, cfg, content);
    expect(magic.mana).toBe(100);
  });

  it('a hungry mage conjures a meal — hunger up, mana spent', () => {
    const w = new World();
    const { magic, needs } = addMage(w, { hunger: 0.1, energy: 0.9, social: 1 }, 100);
    runCapabilitySystem(w, cfg, content);
    expect(needs.hunger).toBeGreaterThan(0.1);   // conjured food
    expect(magic.mana).toBeLessThan(100);        // paid mana
  });

  it('a tired mage mends its vigour when not hungry', () => {
    const w = new World();
    const { magic, needs } = addMage(w, { hunger: 0.9, energy: 0.1, social: 1 }, 100);
    runCapabilitySystem(w, cfg, content);
    expect(needs.energy).toBeGreaterThan(0.1);
    expect(magic.mana).toBeLessThan(100);
  });

  it('a mage out of mana cannot cast (falls back to mundane survival)', () => {
    const w = new World();
    const { needs, magic } = addMage(w, { hunger: 0.1, energy: 0.9, social: 1 }, 1);
    runCapabilitySystem(w, cfg, content);
    // 1 + 0.5 regen = 1.5 mana, far below conjure cost → no cast, hunger unchanged.
    expect(needs.hunger).toBe(0.1);
    expect(magic.mana).toBeCloseTo(1.5);
  });
});

// ── Aptitude: rare but present, deterministic ─────────────────────────────────

describe('magic aptitude', () => {
  it('is rare across the population (well under 10%) yet appears', () => {
    const big = { ...defaultConfig, seed: 7, initialPopulation: 300 };
    const { world } = createSimulation(big, content);
    const folk = world.query(C_AGENT).length;
    const mages = world.query(C_AGENT, C_MAGIC).length;
    expect(folk).toBe(300);
    expect(mages).toBeGreaterThan(0);
    expect(mages / folk).toBeLessThan(0.1);
  });

  it('is deterministic: same seed → same number of mages', () => {
    const make = () => {
      const { world } = createSimulation({ ...defaultConfig, seed: 7, initialPopulation: 300 }, content);
      return world.query(C_AGENT, C_MAGIC).length;
    };
    expect(make()).toBe(make());
  });
});

// ── Magical professions hire only the gifted ──────────────────────────────────

describe('magical-profession hiring', () => {
  function biz(w: World, requiresAptitude: boolean) {
    const e = w.createEntity();
    w.addComponent<Business>(e, C_BUSINESS, {
      professionId: requiresAptitude ? 'hedge_witch' : 'laborer',
      professionName: requiresAptitude ? 'Hedge-Witch' : 'Laborer',
      color: '#fff', balance: 100, maxEmployees: 2, wagePerTick: 0.5,
      revenuePerWorkerPerTick: 0.6, requiresAptitude, gathers: null,
    });
    w.addComponent(e, C_POSITION, { x: 0, y: 0 });
    return e;
  }
  function person(w: World, apt: boolean) {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'female', lifespanTicks: 1_000_000_000 });
    w.addComponent<Wallet>(e, C_WALLET, { gold: 0, debt: 0 });
    w.addComponent(e, C_POSITION, { x: 1, y: 1 });
    if (apt) w.addComponent<Magic>(e, C_MAGIC, { mana: 100, maxMana: 100, manaRegenPerTick: 0.04 });
    return e;
  }

  it('only aptitude-gifted agents are hired into magical businesses', () => {
    const w = new World();
    const witchHouse = biz(w, true);
    const plainAgent = person(w, false);
    runEconomySystem(w, cfg);
    // The non-apt agent must NOT have taken the magical job (no other business exists).
    expect(w.hasComponent(plainAgent, C_JOB)).toBe(false);
  });

  it('a gifted agent prefers the magical employer over a plain one', () => {
    const w = new World();
    const witchHouse = biz(w, true);   // created first
    biz(w, false);
    const mageAgent = person(w, true);
    runEconomySystem(w, cfg);
    const job = w.getComponent<Job>(mageAgent, C_JOB);
    expect(job?.employer).toBe(witchHouse);
  });
});
