// Islands (M24 slice 4): the Voronoi map is one connected landmass, so to give the sea a far
// shore we carve a distinct **island** — a disc of land ringed by a water moat near a corner —
// after terrain generation. A non-seafaring folk cannot reach it (the moat blocks 4-dir steps);
// only a tribe with the Seafaring tech can sail across. The island sometimes holds its own
// settlement (a foreign people), seeded by world.ts. Deterministic (uses the seeded RNG).
import { rngInt } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import { isPassable, isWater } from './tilemap.ts';
import type { TileMapData } from './tilemap.ts';

export interface IslandRegion { cx: number; cy: number; r: number; }

const MOAT = 2;   // width of the water ring (≥1 already blocks foot travel; 2 reads clearly)

// Carve one island into a corner of the map: a land disc (radius r) ringed by a water moat.
// Returns the island region. Needs a passable land biome and a water biome in the content.
export function carveIsland(rng: RNG, map: TileMapData, _seed?: number): IslandRegion | null {
  const landIdx = map.passableByBiome.findIndex(p => p);
  const waterIdx = map.passableByBiome.findIndex(p => !p);
  if (landIdx < 0 || waterIdx < 0) return null;   // need both land and water biomes

  const r = Math.max(3, Math.floor(Math.min(map.width, map.height) * 0.13));
  const inset = r + MOAT + 1;
  // Pick one of the four corners, with a little jitter, so the island sits offshore.
  const corner = rngInt(rng, 0, 3);
  const jx = rngInt(rng, 0, 2), jy = rngInt(rng, 0, 2);
  const cx = (corner & 1) ? map.width - 1 - inset - jx : inset + jx;
  const cy = (corner & 2) ? map.height - 1 - inset - jy : inset + jy;

  for (let y = cy - r - MOAT; y <= cy + r + MOAT; y++) {
    for (let x = cx - r - MOAT; x <= cx + r + MOAT; x++) {
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
      const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));   // Chebyshev → a squarish isle
      if (d <= r) map.biomeIndex[y * map.width + x] = landIdx;          // the island
      else if (d <= r + MOAT) map.biomeIndex[y * map.width + x] = waterIdx;   // the moat
    }
  }
  return { cx, cy, r };
}

// Is (x,y) part of the island's land (within the disc)?
export function inIsland(island: IslandRegion, x: number, y: number): boolean {
  return Math.max(Math.abs(x - island.cx), Math.abs(y - island.cy)) <= island.r;
}

// A random passable tile on the MAINLAND (anywhere off the island + its moat). Falls back to
// any passable tile. When `island` is null, this is just findPassableTile.
export function findMainlandTile(rng: RNG, map: TileMapData, island: IslandRegion | null): { x: number; y: number } {
  const off = (x: number, y: number) => !island || Math.max(Math.abs(x - island.cx), Math.abs(y - island.cy)) > island.r + MOAT;
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = rngInt(rng, 0, map.width - 1), y = rngInt(rng, 0, map.height - 1);
    if (isPassable(map, x, y) && off(x, y)) return { x, y };
  }
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isPassable(map, x, y) && off(x, y)) return { x, y };
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isPassable(map, x, y)) return { x, y };
  throw new Error('World generation produced no passable mainland tile');
}

// A random passable tile ON the island. Returns null if the island has no passable land.
export function findIslandTile(rng: RNG, map: TileMapData, island: IslandRegion): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = rngInt(rng, island.cx - island.r, island.cx + island.r);
    const y = rngInt(rng, island.cy - island.r, island.cy + island.r);
    if (isPassable(map, x, y) && inIsland(island, x, y)) return { x, y };
  }
  for (let y = island.cy - island.r; y <= island.cy + island.r; y++)
    for (let x = island.cx - island.r; x <= island.cx + island.r; x++)
      if (isPassable(map, x, y) && inIsland(island, x, y)) return { x, y };
  return null;
}

// A passable mainland tile bordering water — for a coastal fishery (M24), kept off the island.
export function findMainlandCoastalTile(rng: RNG, map: TileMapData, island: IslandRegion | null): { x: number; y: number } | null {
  const off = (x: number, y: number) => !island || Math.max(Math.abs(x - island.cx), Math.abs(y - island.cy)) > island.r + MOAT;
  const borders = (x: number, y: number) => isWater(map, x + 1, y) || isWater(map, x - 1, y) || isWater(map, x, y + 1) || isWater(map, x, y - 1);
  for (let attempt = 0; attempt < 300; attempt++) {
    const x = rngInt(rng, 0, map.width - 1), y = rngInt(rng, 0, map.height - 1);
    if (isPassable(map, x, y) && off(x, y) && borders(x, y)) return { x, y };
  }
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++)
    if (isPassable(map, x, y) && off(x, y) && borders(x, y)) return { x, y };
  return null;
}
