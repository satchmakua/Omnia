import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { defaultConfig, scaledBusinessCount } from '../src/sim/config.ts';
import {
  C_AGENT, C_POSITION, C_FLORA, C_FAUNA, C_RESOURCE, C_BUSINESS, C_TILEMAP,
} from '../src/sim/components.ts';
import type { Position } from '../src/sim/components.ts';
import { isPassable, isWater } from '../src/world/tilemap.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import type { World } from '../src/sim/ecs.ts';
import type { Agent } from '../src/sim/components.ts';
import { getOrgStore } from '../src/org/orgStore.ts';
import { testContent } from './helpers.ts';

const count = (w: World, comp: string) => w.query(comp).length;

describe('big configurable map (M8)', () => {
  it('world-gen scales with area: ~10× the tiles ⇒ proportionally more of everything', () => {
    const content = testContent();
    const baseCfg = { ...defaultConfig, gridWidth: 64, gridHeight: 64, seed: 7 };
    const bigCfg = { ...defaultConfig, gridWidth: 200, gridHeight: 200, seed: 7 }; // ~9.8× area
    const base = createSimulation(baseCfg, content);
    const big = createSimulation(bigCfg, content);

    // The map itself is the requested size.
    const map = big.world.getComponent<TileMapData>(big.world.query(C_TILEMAP)[0], C_TILEMAP)!;
    expect(map.width).toBe(200);
    expect(map.height).toBe(200);

    // Flora / fauna / resources scale up with the area (caps scaled too), not pinned
    // to the base map's absolute counts — assert well above 4× to allow for biome mix.
    expect(count(big.world, C_FLORA)).toBeGreaterThan(count(base.world, C_FLORA) * 4);
    expect(count(big.world, C_FAUNA)).toBeGreaterThan(count(base.world, C_FAUNA) * 4);
    expect(count(big.world, C_RESOURCE)).toBeGreaterThan(count(base.world, C_RESOURCE) * 4);

    // Employers scale with area; the base map keeps its tuned count.
    expect(count(base.world, C_BUSINESS)).toBe(defaultConfig.businessCount);
    expect(count(big.world, C_BUSINESS)).toBe(scaledBusinessCount(bigCfg));
    expect(count(big.world, C_BUSINESS)).toBeGreaterThan(defaultConfig.businessCount);

    // Multiple biomes actually appear across the big map.
    const biomesSeen = new Set(map.biomeIndex);
    expect(biomesSeen.size).toBeGreaterThan(1);
  });

  it('agents spawn on passable, in-bounds tiles and the world stays valid as it runs', () => {
    const content = testContent();
    const cfg = { ...defaultConfig, gridWidth: 200, gridHeight: 200, seed: 7 };
    const sim = createSimulation(cfg, content);
    const map = sim.world.getComponent<TileMapData>(sim.world.query(C_TILEMAP)[0], C_TILEMAP)!;

    const allOnValidTiles = (): boolean => {
      const store = getOrgStore(sim.world);
      for (const e of sim.world.query(C_AGENT, C_POSITION)) {
        const p = sim.world.getComponent<Position>(e, C_POSITION)!;
        if (p.x < 0 || p.x >= cfg.gridWidth || p.y < 0 || p.y >= cfg.gridHeight) return false;
        if (isPassable(map, p.x, p.y)) continue;
        // A seafaring folk (M24) may legitimately be on water (in a boat); anything else may not.
        const orgId = sim.world.getComponent<Agent>(e, C_AGENT)!.orgId;
        const seafarer = !!(orgId && store && (store.byId[orgId]?.effects?.seafaring ?? 0) > 0);
        if (!(seafarer && isWater(map, p.x, p.y))) return false;
      }
      return true;
    };

    // The mainland town founds with initialPopulation; an island settlement (M24) may add a few.
    expect(count(sim.world, C_AGENT)).toBeGreaterThanOrEqual(cfg.initialPopulation);
    expect(allOnValidTiles()).toBe(true);

    runTicks(sim.world, sim.rng, cfg, sim.clockEntity, content, 400);

    expect(count(sim.world, C_AGENT)).toBeGreaterThan(0); // didn't collapse
    expect(allOnValidTiles()).toBe(true);                 // still valid after running
  }, 20_000);
});
