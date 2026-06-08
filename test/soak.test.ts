import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/sim/world.ts';
import { tick } from '../src/sim/loop.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_NEEDS, C_POSITION } from '../src/sim/components.ts';
import type { Needs, Position } from '../src/sim/components.ts';

describe('Soak: 10,000-tick headless run', () => {
  it('completes without crash and holds all invariants', { timeout: 30_000 }, () => {
    const cfg = { ...defaultConfig, seed: 42 };
    const { world, rng, clockEntity } = createSimulation(cfg);

    for (let t = 0; t < 10_000; t++) {
      tick(world, rng, cfg, clockEntity);
    }

    // Every surviving agent must be in a valid state.
    const agents = world.query(C_AGENT, C_NEEDS, C_POSITION);
    for (const e of agents) {
      const n = world.getComponent<Needs>(e, C_NEEDS)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;

      expect(n.hunger, `entity ${e} hunger out of range`).toBeGreaterThanOrEqual(0);
      expect(n.hunger, `entity ${e} hunger out of range`).toBeLessThanOrEqual(1);
      expect(n.energy, `entity ${e} energy out of range`).toBeGreaterThanOrEqual(0);
      expect(n.energy, `entity ${e} energy out of range`).toBeLessThanOrEqual(1);

      expect(p.x, `entity ${e} x out of bounds`).toBeGreaterThanOrEqual(0);
      expect(p.x, `entity ${e} x out of bounds`).toBeLessThan(cfg.gridWidth);
      expect(p.y, `entity ${e} y out of bounds`).toBeGreaterThanOrEqual(0);
      expect(p.y, `entity ${e} y out of bounds`).toBeLessThan(cfg.gridHeight);
    }
  });
});
