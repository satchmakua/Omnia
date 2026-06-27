// The terrain grid as a dense, flat structure (not 4096 ECS entities — terrain
// is static bulk state). Stored as a singleton component; read by movement and
// the renderer. Self-contained: it carries the per-biome colour/passable/name
// look-ups it needs so consumers don't require the content registry.

import { rngInt } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';

export interface TileMapData {
  width: number;
  height: number;
  biomeIndex: Uint16Array;     // length width*height; value indexes the arrays below
  biomeIds: string[];          // biomeIndex value -> biome id (e.g. "ashen_plains")
  biomeNames: string[];        // biomeIndex value -> display name
  colors: string[];            // biomeIndex value -> #rrggbb
  passableByBiome: boolean[];  // biomeIndex value -> can an agent stand here?
}

export function tileIdx(map: TileMapData, x: number, y: number): number {
  return y * map.width + x;
}

export function inBounds(map: TileMapData, x: number, y: number): boolean {
  return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

export function biomeIndexAt(map: TileMapData, x: number, y: number): number {
  return map.biomeIndex[tileIdx(map, x, y)];
}

export function biomeIdAt(map: TileMapData, x: number, y: number): string {
  return map.biomeIds[biomeIndexAt(map, x, y)];
}

export function biomeNameAt(map: TileMapData, x: number, y: number): string {
  return map.biomeNames[biomeIndexAt(map, x, y)];
}

export function colorAt(map: TileMapData, x: number, y: number): string {
  return map.colors[biomeIndexAt(map, x, y)];
}

// Out-of-bounds tiles are impassable by definition.
export function isPassable(map: TileMapData, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  return map.passableByBiome[biomeIndexAt(map, x, y)];
}

// Water = an in-bounds tile folk cannot stand on (the impassable biomes are the water ones).
// Fish swim here (M24), and boats will later cross it; the complement of isPassable, in-bounds.
export function isWater(map: TileMapData, x: number, y: number): boolean {
  return inBounds(map, x, y) && !map.passableByBiome[biomeIndexAt(map, x, y)];
}

// A random passable tile (for placing world-gen entities and re-opened businesses).
// Falls back to a deterministic scan if random sampling keeps missing.
export function findPassableTile(rng: RNG, map: TileMapData): { x: number; y: number } {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = rngInt(rng, 0, map.width - 1);
    const y = rngInt(rng, 0, map.height - 1);
    if (isPassable(map, x, y)) return { x, y };
  }
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isPassable(map, x, y)) return { x, y };
    }
  }
  throw new Error('World generation produced no passable tiles');
}

// A random passable tile that borders water — a coastal spot for a fishery/dock (M24).
// Returns null if the map has no coast (e.g. a water-less map), so the caller can fall back.
export function coastalTile(rng: RNG, map: TileMapData): { x: number; y: number } | null {
  const borders = (x: number, y: number) =>
    isWater(map, x + 1, y) || isWater(map, x - 1, y) || isWater(map, x, y + 1) || isWater(map, x, y - 1);
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = rngInt(rng, 0, map.width - 1);
    const y = rngInt(rng, 0, map.height - 1);
    if (isPassable(map, x, y) && borders(x, y)) return { x, y };
  }
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isPassable(map, x, y) && borders(x, y)) return { x, y };
    }
  }
  return null;
}
