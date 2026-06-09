// Property-based tests (fast-check). These assert invariants over many
// generated inputs rather than a handful of fixed cases — well-suited to
// the determinism and bounds guarantees Omnia must never break.
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createRNG, rngInt, rngFloat } from '../src/sim/rng.ts';
import { World } from '../src/sim/ecs.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_NEEDS, C_POSITION } from '../src/sim/components.ts';
import type { Needs, Position } from '../src/sim/components.ts';
import { testContent } from './helpers.ts';

const content = testContent();

describe('RNG properties', () => {
  it('any seed yields values strictly in [0, 1)', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const rng = createRNG(seed);
      for (let i = 0; i < 50; i++) {
        const v = rng();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }));
  });

  it('any seed replays identically (determinism invariant)', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const a = createRNG(seed);
      const b = createRNG(seed);
      for (let i = 0; i < 30; i++) expect(a()).toBe(b());
    }));
  });

  it('rngInt(min,max) always lands within [min, max]', () => {
    fc.assert(fc.property(
      fc.integer(), fc.integer({ min: -100, max: 100 }), fc.integer({ min: 0, max: 200 }),
      (seed, min, span) => {
        const rng = createRNG(seed);
        const max = min + span;
        for (let i = 0; i < 20; i++) {
          const v = rngInt(rng, min, max);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
          expect(Number.isInteger(v)).toBe(true);
        }
      },
    ));
  });

  it('rngFloat(min,max) always lands within [min, max)', () => {
    fc.assert(fc.property(
      fc.integer(), fc.double({ min: -1e3, max: 1e3, noNaN: true }), fc.double({ min: 0, max: 1e3, noNaN: true }),
      (seed, min, span) => {
        const rng = createRNG(seed);
        const max = min + span;
        for (let i = 0; i < 20; i++) {
          const v = rngFloat(rng, min, max);
          // Closed bound: float rounding means min+span can equal min when span
          // is subnormally small, so the upper bound is <=, not strict <.
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
        }
      },
    ));
  });
});

describe('Simulation properties', () => {
  it('for any seed, agents stay in-bounds and needs stay in [0,1] after 200 ticks', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
      const cfg = { ...defaultConfig, seed, initialPopulation: 12 };
      const { world, rng, clockEntity } = createSimulation(cfg, content);
      runTicks(world, rng, cfg, clockEntity, content, 200);

      for (const e of world.query(C_AGENT, C_NEEDS, C_POSITION)) {
        const n = world.getComponent<Needs>(e, C_NEEDS)!;
        const p = world.getComponent<Position>(e, C_POSITION)!;
        expect(n.hunger).toBeGreaterThanOrEqual(0);
        expect(n.hunger).toBeLessThanOrEqual(1);
        expect(n.energy).toBeGreaterThanOrEqual(0);
        expect(n.energy).toBeLessThanOrEqual(1);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(cfg.gridWidth);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(cfg.gridHeight);
      }
    }), { numRuns: 40 });
  });

  it('same seed → identical population trajectory (golden/replay invariant)', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 1_000_000 }), (seed) => {
      const cfg = { ...defaultConfig, seed, initialPopulation: 12 };
      const run = () => {
        const sim = createSimulation(cfg, content);
        runTicks(sim.world, sim.rng, cfg, sim.clockEntity, content, 300);
        return sim.world.query(C_AGENT).length;
      };
      expect(run()).toBe(run());
    }), { numRuns: 25 });
  });
});

describe('ECS properties', () => {
  it('destroyed entities never appear in any query', () => {
    fc.assert(fc.property(
      fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }),
      (destroyFlags) => {
        const w = new World();
        const ids = destroyFlags.map(() => {
          const e = w.createEntity();
          w.addComponent(e, 'Tag', {});
          return e;
        });
        ids.forEach((e, i) => { if (destroyFlags[i]) w.destroyEntity(e); });

        const live = new Set(w.query('Tag'));
        ids.forEach((e, i) => {
          if (destroyFlags[i]) expect(live.has(e)).toBe(false);
          else expect(live.has(e)).toBe(true);
        });
      },
    ));
  });
});
