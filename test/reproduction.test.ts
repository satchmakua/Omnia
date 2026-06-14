import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_HEALTH, C_SPECIES, C_LINEAGE, C_POSITION, C_CLOCK, C_TOMBSTONE,
} from '../src/sim/components.ts';
import type { Agent, Needs, Health, SpeciesComp, Lineage, Tombstone, Sex } from '../src/sim/components.ts';
import { runReproductionSystem } from '../src/sim/systems/ReproductionSystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { tick } from '../src/sim/loop.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();
const tpy = ticksPerYear(cfg);

function adult(w: World, sex: Sex): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: sex === 'male' ? 'Pa' : 'Ma', action: 'wander', ticksAlive: 25 * tpy,
    wealthGoal: 50, sex, lifespanTicks: 90 * tpy,
  });
  w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 1 });
  w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
  w.addComponent<SpeciesComp>(e, C_SPECIES, {
    id: 'human', name: 'Human', color: '#e8d8a0', size: 'medium', hungerMult: 1, energyMult: 1,
  });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
  w.addComponent(e, C_POSITION, { x: 0, y: 0 });
  return e;
}

function couple(w: World) {
  const m = adult(w, 'male');
  const f = adult(w, 'female');
  w.getComponent<Lineage>(m, C_LINEAGE)!.partner = f;
  w.getComponent<Lineage>(f, C_LINEAGE)!.partner = m;
  const ce = w.createEntity();
  w.addComponent(ce, C_CLOCK, { tick: 1, day: 0, hour: 0, isDay: true });
  return { m, f };
}

const children = (w: World) =>
  w.query(C_AGENT, C_LINEAGE).filter(e => w.getComponent<Lineage>(e, C_LINEAGE)!.parents.length > 0);

// ── ReproductionSystem ────────────────────────────────────────────────────────

describe('ReproductionSystem', () => {
  it('a fed, married, opposite-sex couple bears a child wired into the lineage', () => {
    const w = new World();
    const { m, f } = couple(w);
    runReproductionSystem(w, cfg, () => 0, content); // rng 0 < birthChance ⇒ conceive

    const kids = children(w);
    expect(kids.length).toBe(1);
    const child = kids[0];
    const cl = w.getComponent<Lineage>(child, C_LINEAGE)!;
    expect(cl.parents).toContain(m);
    expect(cl.parents).toContain(f);
    expect(w.getComponent<Agent>(child, C_AGENT)!.ticksAlive).toBe(0);          // newborn
    expect(w.getComponent<SpeciesComp>(child, C_SPECIES)!.id).toBe('human');     // inherited
    expect(w.getComponent<Lineage>(f, C_LINEAGE)!.children).toContain(child);
    expect(w.getComponent<Lineage>(m, C_LINEAGE)!.children).toContain(child);
    expect(w.getComponent<Lineage>(f, C_LINEAGE)!.reproCooldownTicks).toBeGreaterThan(0);
  });

  it('does not bear a child while the mother is on cooldown', () => {
    const w = new World();
    const { f } = couple(w);
    w.getComponent<Lineage>(f, C_LINEAGE)!.reproCooldownTicks = 500;
    runReproductionSystem(w, cfg, () => 0, content);
    expect(children(w).length).toBe(0);
  });

  it('pauses births at the population cap', () => {
    const w = new World();
    couple(w); // 2 agents
    runReproductionSystem(w, { ...cfg, maxPopulation: 2 }, () => 0, content);
    expect(children(w).length).toBe(0);
  });

  it('starving couples do not breed', () => {
    const w = new World();
    const { f } = couple(w);
    w.getComponent<Needs>(f, C_NEEDS)!.hunger = 0.1;
    runReproductionSystem(w, cfg, () => 0, content);
    expect(children(w).length).toBe(0);
  });
});

// ── Generations: the town sustains itself (the M4 DoD) ────────────────────────

describe('multi-generation stability', () => {
  // The real default balance, run long enough (~42 sim-years) for several
  // generations to turn over — the same balance the soak shows sustaining.
  const longCfg = { ...defaultConfig, seed: 11, initialPopulation: 30 };

  function parentsOf(w: World, e: EntityId): number[] {
    const lin = w.getComponent<Lineage>(e, C_LINEAGE);
    if (lin) return lin.parents;
    const tomb = w.getComponent<Tombstone>(e, C_TOMBSTONE);
    return tomb ? tomb.parents : [];
  }

  it('stays bounded (no collapse, no explosion) over many generations, and a 3rd generation appears', () => {
    const sim = createSimulation(longCfg, content);
    let minPop = Infinity, maxPop = 0;
    for (let t = 0; t < 40_000; t++) {
      tick(sim.world, sim.rng, longCfg, sim.clockEntity, content);
      const pop = sim.world.query(C_AGENT).length;
      minPop = Math.min(minPop, pop);
      maxPop = Math.max(maxPop, pop);
    }
    expect(minPop).toBeGreaterThan(0);                 // never collapsed
    expect(maxPop).toBeLessThanOrEqual(longCfg.maxPopulation); // never exploded past the cap
    expect(sim.world.query(C_TOMBSTONE).length).toBeGreaterThan(0); // deaths happened

    // A grandchild exists: a living agent whose parent itself has a parent
    // (tracing through tombstones for the dead) ⇒ at least three generations.
    const w = sim.world;
    const hasGrandparent = w.query(C_AGENT, C_LINEAGE).some(e =>
      parentsOf(w, e).some(p => parentsOf(w, p).length > 0));
    expect(hasGrandparent).toBe(true);
  }, 30_000);
});
