import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/sim/world.ts';
import { tick } from '../src/sim/loop.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_TILEMAP } from '../src/sim/components.ts';
import type { Needs, Position, Agent } from '../src/sim/components.ts';
import { isPassable, isWater } from '../src/world/tilemap.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { getOrgStore } from '../src/org/orgStore.ts';
import { testContent } from './helpers.ts';

describe('Soak: 10,000-tick headless run', () => {
  it('completes without crash and holds all invariants', { timeout: 30_000 }, () => {
    const cfg = { ...defaultConfig, seed: 42 };
    const content = testContent();
    const { world, rng, clockEntity } = createSimulation(cfg, content);
    const map = world.getComponent<TileMapData>(world.query(C_TILEMAP)[0], C_TILEMAP)!;

    for (let t = 0; t < 10_000; t++) {
      tick(world, rng, cfg, clockEntity, content);
    }

    // Every surviving agent must be in a valid state.
    const orgStore = getOrgStore(world);
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

      // Folk stay on passable land — unless seafaring (a boat on the water, M24).
      const orgId = world.getComponent<Agent>(e, C_AGENT)!.orgId;
      const seafarer = !!(orgId && orgStore && (orgStore.byId[orgId]?.effects?.seafaring ?? 0) > 0);
      expect(isPassable(map, p.x, p.y) || (seafarer && isWater(map, p.x, p.y)), `entity ${e} on impassable tile`).toBe(true);
    }
  });
});
