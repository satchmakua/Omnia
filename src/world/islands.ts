// Islands (M24 s4; naturalised) — with the heightmap painting real seas (worldgen.ts), an island is
// simply **a body of land cut off from the mainland by water**, found by flood-filling the passable
// tiles into connected components: the biggest is the mainland, any other (sea-locked) component is
// an island. A non-seafaring folk can't reach one (water blocks 4-dir steps); only a Seafaring tribe
// sails across. The largest island sometimes holds its own settlement (a foreign people), seeded by
// world.ts. Pure read of the generated map — draws no RNG.
import { rngInt } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import { isPassable, isWater, tileIdx } from './tilemap.ts';
import type { TileMapData } from './tilemap.ts';

export interface IslandRegion {
  tiles: Set<number>;   // tile indices (y*width + x) of the island's land
  w: number;            // map width, so membership is index-checkable without the map
  cx: number; cy: number;   // centroid, for camera/labels
  size: number;             // tile count
}

const MIN_ISLAND = 6;   // ignore tiny specks of land; an island worth the name is at least this big

// Flood-fill the passable tiles into 4-connected components (4-dir = how folk walk). The largest is
// the mainland; the largest *other* component is "the island". Returns both (island null if none).
export function detectIslands(map: TileMapData): { mainland: Set<number>; island: IslandRegion | null } {
  const { width, height } = map;
  const visited = new Uint8Array(width * height);
  const components: number[][] = [];

  for (let start = 0; start < width * height; start++) {
    if (visited[start] || !map.passableByBiome[map.biomeIndex[start]]) continue;
    const comp: number[] = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      comp.push(t);
      const x = t % width, y = (t - x) / width;
      const neigh = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neigh) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (!visited[n] && map.passableByBiome[map.biomeIndex[n]]) { visited[n] = 1; stack.push(n); }
      }
    }
    components.push(comp);
  }

  if (components.length === 0) return { mainland: new Set(), island: null };
  components.sort((a, b) => b.length - a.length);
  const mainland = new Set(components[0]);

  const islandComp = components.slice(1).find(c => c.length >= MIN_ISLAND) ?? null;
  let island: IslandRegion | null = null;
  if (islandComp) {
    let sx = 0, sy = 0;
    for (const t of islandComp) { sx += t % width; sy += Math.floor(t / width); }
    island = { tiles: new Set(islandComp), w: width, cx: Math.round(sx / islandComp.length), cy: Math.round(sy / islandComp.length), size: islandComp.length };
  }
  return { mainland, island };
}

// Is (x,y) part of this island?
export function inIsland(island: IslandRegion, x: number, y: number): boolean {
  return island.tiles.has(y * island.w + x);
}

// A random tile in a given land set (the mainland, typically). Falls back to a deterministic scan.
function tileInSet(rng: RNG, map: TileMapData, set: Set<number>): { x: number; y: number } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = rngInt(rng, 0, map.width - 1), y = rngInt(rng, 0, map.height - 1);
    if (set.has(tileIdx(map, x, y))) return { x, y };
  }
  for (const t of set) return { x: t % map.width, y: Math.floor(t / map.width) };
  throw new Error('World generation produced no land in the requested region');
}

// A random passable tile on the MAINLAND. `mainland` is the set from detectIslands.
export function findMainlandTile(rng: RNG, map: TileMapData, mainland: Set<number>): { x: number; y: number } {
  return tileInSet(rng, map, mainland);
}

// A random passable tile ON the island, or null if there is none.
export function findIslandTile(rng: RNG, map: TileMapData, island: IslandRegion | null): { x: number; y: number } | null {
  if (!island || island.tiles.size === 0) return null;
  return tileInSet(rng, map, island.tiles);
}

// A mainland tile bordering water — a coastal spot for a fishery/dock (M24). Null if none.
export function findMainlandCoastalTile(rng: RNG, map: TileMapData, mainland: Set<number>): { x: number; y: number } | null {
  const borders = (x: number, y: number) => isWater(map, x + 1, y) || isWater(map, x - 1, y) || isWater(map, x, y + 1) || isWater(map, x, y - 1);
  for (let attempt = 0; attempt < 300; attempt++) {
    const x = rngInt(rng, 0, map.width - 1), y = rngInt(rng, 0, map.height - 1);
    if (mainland.has(tileIdx(map, x, y)) && borders(x, y)) return { x, y };
  }
  for (const t of mainland) { const x = t % map.width, y = Math.floor(t / map.width); if (isPassable(map, x, y) && borders(x, y)) return { x, y }; }
  return null;
}
