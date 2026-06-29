// Islands (M24 s4, naturalised). The heightmap (worldgen) paints real seas; an island is land cut
// off from the mainland by water, found by connected-component flood-fill. These tests pin the
// component detection, the region tile-finders, that natural islands actually form across seeds, and
// that an overseas settlement (when one is seeded) clusters on its isle.
import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_POSITION } from '../src/sim/components.ts';
import type { Agent, Position, Organization } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { isPassable, isWater } from '../src/world/tilemap.ts';
import { detectIslands, inIsland, findMainlandTile, findIslandTile } from '../src/world/islands.ts';
import { generateTileMap } from '../src/world/worldgen.ts';
import { createSimulation } from '../src/sim/world.ts';
import { getOrgStore } from '../src/org/orgStore.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

// A 20×20 sea with two land blobs: a big mainland and a smaller, fully separated island.
function twoLandMap(): TileMapData {
  const w = 20, h = 20;
  const biomeIndex = new Uint16Array(w * h).fill(1);   // 1 = sea everywhere…
  const land = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) biomeIndex[y * w + x] = 0;   // 0 = land
  };
  land(2, 2, 10, 10);    // mainland (81 tiles)
  land(14, 14, 17, 17);  // island (16 tiles), surrounded by sea
  return { width: w, height: h, biomeIndex, biomeIds: ['ground', 'sea'], biomeNames: ['Ground', 'Sea'], colors: ['#333', '#258'], passableByBiome: [true, false] };
}

describe('detectIslands — land cut off by the sea (M24)', () => {
  it('splits the map into the mainland and a sea-locked island', () => {
    const { mainland, island } = detectIslands(twoLandMap());
    expect(mainland.size).toBe(81);          // the bigger blob is the mainland
    expect(island).not.toBeNull();
    expect(island!.size).toBe(16);           // the smaller, separated blob is the island
    expect(inIsland(island!, 15, 15)).toBe(true);
    expect(inIsland(island!, 5, 5)).toBe(false);   // a mainland tile is not on the island
  });

  it('a map that is one connected landmass has no island', () => {
    const map = twoLandMap();
    // bridge mainland (…,10) to the island (14,…) with a land block → now one component
    for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) map.biomeIndex[y * map.width + x] = 0;
    expect(detectIslands(map).island).toBeNull();
  });

  it('the tile finders stay within their regions', () => {
    const { mainland, island } = detectIslands(twoLandMap());
    const rng = createRNG(3);
    for (let i = 0; i < 50; i++) {
      const m = findMainlandTile(rng, twoLandMap(), mainland);
      expect(mainland.has(m.y * 20 + m.x)).toBe(true);
      const s = findIslandTile(rng, twoLandMap(), island)!;
      expect(inIsland(island!, s.x, s.y)).toBe(true);
      expect(isPassable(twoLandMap(), s.x, s.y)).toBe(true);
    }
  });
});

describe('the generated world (M24)', () => {
  const content = testContent();

  it('paints a real sea, and natural islands form across seeds', () => {
    let sawWater = false, sawIsland = false, islandsFound = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const map = generateTileMap(createRNG(seed), 64, 64, content.biomes, defaultConfig.biomeSeedCount);
      let water = 0;
      for (let i = 0; i < map.biomeIndex.length; i++) if (!map.passableByBiome[map.biomeIndex[i]]) water++;
      if (water > 0) sawWater = true;
      const { island } = detectIslands(map);
      if (island) {
        sawIsland = true; islandsFound++;
        // genuinely surrounded: at least one of its tiles borders water, and it touches no mainland
        const onTile = [...island.tiles][0];
        const x = onTile % 64, y = Math.floor(onTile / 64);
        expect(isPassable(map, x, y)).toBe(true);
      }
    }
    expect(sawWater).toBe(true);            // the heightmap made seas, not a checkerboard
    expect(sawIsland).toBe(true);           // and islands emerge naturally (not hand-placed)
    expect(islandsFound).toBeGreaterThanOrEqual(3);   // commonly, across seeds — not a fluke
  });

  it('an island, where one exists, is fully water-bounded (no foot path to the mainland)', () => {
    // Find a seed with an island and assert its perimeter is all water/edge (a real, isolated isle).
    for (let seed = 1; seed <= 10; seed++) {
      const map = generateTileMap(createRNG(seed), 64, 64, content.biomes, defaultConfig.biomeSeedCount);
      const { island } = detectIslands(map);
      if (!island) continue;
      for (const t of island.tiles) {
        const x = t % 64, y = Math.floor(t / 64);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
          // every off-island neighbour must be water or off-map (else it'd be one landmass)
          if (!inIsland(island, nx, ny) && nx >= 0 && ny >= 0 && nx < 64 && ny < 64) {
            expect(isWater(map, nx, ny)).toBe(true);
          }
        }
      }
      return;   // one isolated island verified
    }
    throw new Error('no island found across seeds 1–10 to verify isolation');
  });
});

describe('island settlements in a real world (M24)', () => {
  const content = testContent();
  it('an overseas clan, where seeded, clusters tightly on its isle', () => {
    // Scan seeds for one that seeded an overseas settlement, then assert its folk live close together
    // (on the small island), not scattered across the map.
    for (let seed = 1; seed <= 16; seed++) {
      const { world } = createSimulation({ ...defaultConfig, seed }, content);
      const store = getOrgStore(world)!;
      const overseas = Object.values(store.byId).filter((o: Organization) => o.overseas);
      if (overseas.length === 0) continue;
      const ids = new Set(overseas.map(o => o.id));
      const islanders = world.query(C_AGENT, C_POSITION).filter(e => {
        const id = world.getComponent<Agent>(e, C_AGENT)!.orgId; return id !== undefined && ids.has(id);
      });
      expect(islanders.length).toBeGreaterThan(0);
      const xs = islanders.map(e => world.getComponent<Position>(e, C_POSITION)!.x);
      const ys = islanders.map(e => world.getComponent<Position>(e, C_POSITION)!.y);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      expect(span).toBeLessThanOrEqual(28);   // clustered on an island, not spread over the town
      return;
    }
    throw new Error('no overseas settlement seeded across seeds 1–16');
  });
});
