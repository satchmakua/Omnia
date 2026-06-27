import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_MAGIC, C_JOB, C_BUSINESS, C_POSITION, C_FAUNA, C_HEALTH, C_CLOCK, C_COMBAT,
} from '../src/sim/components.ts';
import type { Needs, Magic, Agent, Wallet, Business, Job, Fauna, Health, Clock, Combat } from '../src/sim/components.ts';
import { runCapabilitySystem } from '../src/sim/systems/CapabilitySystem.ts';
import { runEconomySystem } from '../src/sim/systems/EconomySystem.ts';
import { runMagicSystem } from '../src/sim/systems/MagicSystem.ts';
import { schoolOf, knownSpells, topSpell, schoolIds } from '../src/magic/schools.ts';
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

// ── The magic tree + MagicSystem (M17 slice 3) ────────────────────────────────────────
describe('magic schools (M17 s3)', () => {
  it('there are four schools and mastery gates spells', () => {
    expect(schoolIds()).toContain('elementalism');
    expect(schoolIds().length).toBe(4);
    expect(knownSpells('elementalism', 1).length).toBe(1);   // only Spark at mastery 1
    expect(knownSpells('elementalism', 5).length).toBe(3);   // all three by mastery 5
    expect(topSpell('elementalism', 5)!.name).toBe('Storm Wrath');
    expect(schoolOf('restoration')!.signature).toBe('heal');
  });
});

const noRng = () => 0;
function mageWorld(tick = 100): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  return w;
}
function castMage(w: World, x: number, y: number, school: string, mastery: number, mana = 80): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: 'Mage', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
  w.addComponent<Magic>(e, C_MAGIC, { mana, maxMana: 100, manaRegenPerTick: 0, school, mastery });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}
function predator(w: World, x: number, y: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Fauna>(e, C_FAUNA, { speciesId: 's', name: 'Stalker', color: '#a00', size: 'medium', diet: 'predator', hunger: 1, hungerDecayPerTick: 0, breedThreshold: 1, breedCooldownTicks: 0, ticksAlive: 0 });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}

describe('MagicSystem (M17 s3)', () => {
  it('an elementalist blasts an adjacent beast and earns the kill', () => {
    const w = mageWorld();
    const m = castMage(w, 5, 5, 'elementalism', 3);
    const b = predator(w, 6, 5);
    runMagicSystem(w, cfg, noRng);
    expect(w.isAlive(b)).toBe(false);
    expect(w.getComponent<Combat>(m, C_COMBAT)!.kills).toBe(1);
    expect(w.getComponent<Magic>(m, C_MAGIC)!.mana).toBeLessThan(80);
  });

  it('a restorer mends a wounded neighbour', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'restoration', 2);
    const hurt = w.createEntity();
    w.addComponent<Agent>(hurt, C_AGENT, { name: 'Hurt', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Health>(hurt, C_HEALTH, { value: 0.4, ill: false });
    w.addComponent(hurt, C_POSITION, { x: 6, y: 5 });
    runMagicSystem(w, cfg, noRng);
    expect(w.getComponent<Health>(hurt, C_HEALTH)!.value).toBeGreaterThan(0.4);
  });

  it('a mage with too little mana cannot cast', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'elementalism', 3, 5);
    const b = predator(w, 6, 5);
    runMagicSystem(w, cfg, noRng);
    expect(w.isAlive(b)).toBe(true);
  });

  it('mastery grows on a day boundary', () => {
    const w = mageWorld(cfg.ticksPerDay);
    const m = castMage(w, 5, 5, 'divination', 2);
    runMagicSystem(w, cfg, noRng);
    expect(w.getComponent<Magic>(m, C_MAGIC)!.mastery!).toBeGreaterThan(2);
  });

  it('aptitude-gifted folk are given a school and mastery at world-gen', () => {
    // A larger founding town so the rare magic aptitude is near-certain to appear in someone
    // (otherwise this is sensitive to which species the seed spawns — M21 added races with low
    // aptitude, which shifted the per-seed mage count at the default population).
    const { world } = createSimulation({ ...defaultConfig, seed: 8, initialPopulation: 80 }, content);
    const mages = world.query(C_MAGIC, C_AGENT);
    expect(mages.length).toBeGreaterThan(0);
    for (const e of mages) {
      const magic = world.getComponent<Magic>(e, C_MAGIC)!;
      expect(schoolIds()).toContain(magic.school);
      expect(magic.mastery).toBeGreaterThanOrEqual(1);
    }
  });
});
