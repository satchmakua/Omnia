import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_HEALTH, C_RELATIONSHIPS, C_LINEAGE, C_TOMBSTONE, C_CLOCK,
} from '../src/sim/components.ts';
import type {
  Agent, Needs, Health, Relationships, Lineage, Tombstone, Sex,
} from '../src/sim/components.ts';
import { killAgent, tombstoneFor } from '../src/sim/death.ts';
import { runHealthSystem } from '../src/sim/systems/HealthSystem.ts';
import { runSocialSystem } from '../src/sim/systems/SocialSystem.ts';

const cfg = defaultConfig;
const tpy = ticksPerYear(cfg);

function addPerson(
  w: World, over: Partial<Agent> = {}, opts: { x?: number; y?: number; social?: number } = {},
): number {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: 'A', action: 'wander', ticksAlive: 25 * tpy, wealthGoal: 50,
    sex: 'female' as Sex, lifespanTicks: 60 * tpy, ...over,
  });
  w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: opts.social ?? 1 });
  w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
  w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
  w.addComponent(e, C_POSITION, { x: opts.x ?? 0, y: opts.y ?? 0 });
  return e;
}

// ── Death → tombstone ─────────────────────────────────────────────────────────

describe('killAgent / tombstones', () => {
  it('replaces living components with a tombstone but keeps the entity id', () => {
    const w = new World();
    const e = addPerson(w, { name: 'Mara', ticksAlive: 70 * tpy });
    killAgent(w, e, 5000, 'old age', tpy);

    expect(w.isAlive(e)).toBe(true);            // entity persists as a record
    expect(w.hasComponent(e, C_AGENT)).toBe(false);
    expect(w.hasComponent(e, C_NEEDS)).toBe(false);
    expect(w.hasComponent(e, C_POSITION)).toBe(false);
    const tomb = w.getComponent<Tombstone>(e, C_TOMBSTONE)!;
    expect(tomb.name).toBe('Mara');
    expect(tomb.cause).toBe('old age');
    expect(tomb.ageYears).toBe(70);
  });

  it('widows the partner so they can re-partner', () => {
    const w = new World();
    const a = addPerson(w);
    const b = addPerson(w);
    w.getComponent<Lineage>(a, C_LINEAGE)!.partner = b;
    w.getComponent<Lineage>(b, C_LINEAGE)!.partner = a;

    killAgent(w, a, 1000, 'illness', tpy);
    expect(w.getComponent<Lineage>(b, C_LINEAGE)!.partner).toBe(null);
  });

  it('records the dead’s lineage in the tombstone', () => {
    const w = new World();
    const e = addPerson(w, { name: 'Old Pa' });
    w.getComponent<Lineage>(e, C_LINEAGE)!.children = [42, 43];
    const tomb = tombstoneFor(w, e, 2000, 'old age', tpy);
    expect(tomb.children).toEqual([42, 43]);
    expect(tomb.legacy).toContain('Old Pa');
  });
});

// ── HealthSystem: ageing & mortality ──────────────────────────────────────────

describe('HealthSystem', () => {
  it('the very old die (and become tombstones) within a short span', () => {
    const w = new World();
    // Two agents well past their lifespan.
    addPerson(w, { ticksAlive: 80 * tpy, lifespanTicks: 60 * tpy });
    addPerson(w, { ticksAlive: 90 * tpy, lifespanTicks: 60 * tpy });
    let ticks = 0;
    while (w.query(C_AGENT).length > 0 && ticks < 5000) { runHealthSystem(w, cfg, Math.random); ticks++; }
    expect(w.query(C_AGENT).length).toBe(0);
    expect(w.query(C_TOMBSTONE).length).toBe(2);
  });

  it('the young almost never die of age over the same span', () => {
    const w = new World();
    for (let i = 0; i < 10; i++) addPerson(w, { ticksAlive: 20 * tpy, lifespanTicks: 70 * tpy });
    for (let t = 0; t < 2000; t++) runHealthSystem(w, cfg, Math.random);
    // Background/illness mortality is tiny; the cohort should be essentially intact.
    expect(w.query(C_AGENT).length).toBeGreaterThanOrEqual(9);
  });
});

// ── SocialSystem: need, friendship, marriage ──────────────────────────────────

describe('SocialSystem', () => {
  it('decays the social need over time', () => {
    const w = new World();
    const e = addPerson(w, {}, { x: 0, y: 0, social: 1 });
    // Alone (no co-located peer) → social only decays.
    runSocialSystem(w, cfg, Math.random);
    expect(w.getComponent<Needs>(e, C_NEEDS)!.social).toBeLessThan(1);
  });

  it('co-located agents raise each other’s social need and sentiment', () => {
    const w = new World();
    const a = addPerson(w, {}, { x: 3, y: 3, social: 0.2 });
    const b = addPerson(w, {}, { x: 3, y: 3, social: 0.2 });
    runSocialSystem(w, cfg, Math.random);
    // Net of decay, being together leaves them better off than the decay-only case.
    expect(w.getComponent<Needs>(a, C_NEEDS)!.social).toBeGreaterThan(0.2 - cfg.socialDecayPerDay / cfg.ticksPerDay);
    const edge = w.getComponent<Relationships>(a, C_RELATIONSHIPS)!.edges[b];
    expect(edge.sentiment).toBeGreaterThan(0);
  });

  it('fond, unattached adults eventually wed (mutual partner links)', () => {
    const w = new World();
    // A clock + chronicle so marriages can be recorded.
    const ce = w.createEntity();
    w.addComponent(ce, C_CLOCK, { tick: 1, day: 0, hour: 0, isDay: true });
    const a = addPerson(w, { sex: 'female' }, { x: 5, y: 5, social: 1 });
    const b = addPerson(w, { sex: 'male' }, { x: 5, y: 5, social: 1 });

    // Always-marry config so the test is deterministic once sentiment is high.
    const eager = { ...cfg, marryChancePerDay: cfg.ticksPerDay };
    let wed = false;
    for (let t = 0; t < 500 && !wed; t++) {
      runSocialSystem(w, eager, () => 0); // rng()=0 < marryChance once eligible
      wed = w.getComponent<Lineage>(a, C_LINEAGE)!.partner === b;
    }
    expect(wed).toBe(true);
    expect(w.getComponent<Lineage>(b, C_LINEAGE)!.partner).toBe(a);
    expect(w.getComponent<Relationships>(a, C_RELATIONSHIPS)!.edges[b].type).toBe('partner');
  });

  it('children (under age) do not marry', () => {
    const w = new World();
    const a = addPerson(w, { ticksAlive: 5 * tpy }, { x: 1, y: 1, social: 1 });
    const b = addPerson(w, { ticksAlive: 5 * tpy }, { x: 1, y: 1, social: 1 });
    const eager = { ...cfg, marryChancePerDay: cfg.ticksPerDay };
    for (let t = 0; t < 500; t++) runSocialSystem(w, eager, () => 0);
    expect(w.getComponent<Lineage>(a, C_LINEAGE)!.partner).toBe(null);
  });
});
