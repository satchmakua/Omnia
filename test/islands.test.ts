// Islands (M24 slice 4): an offshore island is carved into a corner (a land disc ringed by a
// water moat), and sometimes a foreign people already lives there in their own overseas clan,
// isolated from the mainland until a boat crosses.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_POSITION, C_ORGSTORE } from '../src/sim/components.ts';
import type { Agent, Position } from '../src/sim/components.ts';
import type { Organization } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { isPassable, isWater } from '../src/world/tilemap.ts';
import { carveIsland, inIsland, findMainlandTile, findIslandTile } from '../src/world/islands.ts';
import { createSimulation } from '../src/sim/world.ts';
import { getOrgStore } from '../src/org/orgStore.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

// An all-land map with a water biome available to carve with.
function landMap(w = 48, h = 48): TileMapData {
  return {
    width: w, height: h, biomeIndex: new Uint16Array(w * h),
    biomeIds: ['ground', 'sea'], biomeNames: ['Ground', 'Sea'], colors: ['#333', '#258'],
    passableByBiome: [true, false],
  };
}

describe('carveIsland (M24)', () => {
  it('carves a land disc ringed by a water moat', () => {
    const map = landMap();
    const isle = carveIsland(createRNG(1), map)!;
    expect(isle).not.toBeNull();
    expect(isPassable(map, isle.cx, isle.cy)).toBe(true);          // the island is land
    expect(isWater(map, isle.cx + isle.r + 1, isle.cy)).toBe(true); // ringed by water (the moat)
    // a tile well away from the island is untouched mainland
    const farX = (isle.cx + Math.floor(map.width / 2)) % map.width;
    expect(inIsland(isle, farX, isle.cy)).toBe(false);
  });

  it('the moat fully separates the island (every disc-edge neighbour off-island is water)', () => {
    const map = landMap();
    const isle = carveIsland(createRNG(7), map)!;
    // the ring of tiles just outside the disc must all be water (or off-map)
    for (let y = isle.cy - isle.r - 1; y <= isle.cy + isle.r + 1; y++) {
      for (let x = isle.cx - isle.r - 1; x <= isle.cx + isle.r + 1; x++) {
        const cheby = Math.max(Math.abs(x - isle.cx), Math.abs(y - isle.cy));
        if (cheby === isle.r + 1 && x >= 0 && y >= 0 && x < map.width && y < map.height) {
          expect(isWater(map, x, y), `(${x},${y}) should be moat`).toBe(true);
        }
      }
    }
  });
});

describe('island tile finders (M24)', () => {
  it('findMainlandTile stays off the island; findIslandTile stays on it', () => {
    const map = landMap();
    const isle = carveIsland(createRNG(2), map)!;
    const rng = createRNG(3);
    for (let i = 0; i < 50; i++) {
      const m = findMainlandTile(rng, map, isle);
      expect(inIsland(isle, m.x, m.y)).toBe(false);
      const s = findIslandTile(rng, map, isle)!;
      expect(inIsland(isle, s.x, s.y)).toBe(true);
      expect(isPassable(map, s.x, s.y)).toBe(true);
    }
  });
});

describe('island settlements in a real world (M24)', () => {
  const content = testContent();
  it('a populating seed seeds an overseas clan whose folk cluster on the island', () => {
    // seed 8 populates the island (verified); its overseas folk live tightly together (the isle),
    // apart from the spread-out mainland town.
    const { world } = createSimulation({ ...defaultConfig, seed: 8 }, content);
    const store = getOrgStore(world)!;
    const overseas = Object.values(store.byId).filter((o: Organization) => o.overseas);
    expect(overseas.length).toBeGreaterThan(0);
    const overseasIds = new Set(overseas.map(o => o.id));
    const islanders = world.query(C_AGENT, C_POSITION).filter(e => {
      const id = world.getComponent<Agent>(e, C_AGENT)!.orgId; return id !== undefined && overseasIds.has(id);
    });
    expect(islanders.length).toBeGreaterThan(0);
    const xs = islanders.map(e => world.getComponent<Position>(e, C_POSITION)!.x);
    const ys = islanders.map(e => world.getComponent<Position>(e, C_POSITION)!.y);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    expect(span).toBeLessThanOrEqual(24);   // clustered on a small island, not scattered over the map
  });
});
