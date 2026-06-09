// Seeded, deterministic terrain generation. Scatters a handful of biome "seed"
// points (each a weighted-random biome) and assigns every tile the biome of its
// nearest seed (Manhattan distance) — a cheap Voronoi that yields contiguous
// regions rather than per-tile noise. Same RNG state in => identical map.
import { rngInt } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import type { Biome } from '../content/schema.ts';
import type { Registry } from '../content/registry.ts';
import type { TileMapData } from './tilemap.ts';

interface Seed { x: number; y: number; biomeIdx: number; }

function pickWeightedBiomeIdx(rng: RNG, weights: number[], total: number): number {
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1; // float-safety fallback
}

export function generateTileMap(
  rng: RNG,
  width: number,
  height: number,
  biomeRegistry: Registry<Biome>,
  seedCount: number,
): TileMapData {
  const biomes = biomeRegistry.all(); // sorted by id => deterministic indexing
  if (biomes.length === 0) {
    throw new Error('World generation needs at least one biome (content/biomes is empty)');
  }

  const biomeIds = biomes.map(b => b.id);
  const biomeNames = biomes.map(b => b.name);
  const colors = biomes.map(b => b.color);
  const passableByBiome = biomes.map(b => b.passable);
  const genWeights = biomes.map(b => b.genWeight);
  const totalWeight = genWeights.reduce((s, w) => s + w, 0);

  // Place biome seeds.
  const count = Math.max(1, seedCount);
  const seeds: Seed[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: rngInt(rng, 0, width - 1),
      y: rngInt(rng, 0, height - 1),
      biomeIdx: pickWeightedBiomeIdx(rng, genWeights, totalWeight),
    });
  }

  // Assign each tile to the nearest seed.
  const biomeIndex = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = 0;
      let bestDist = Infinity;
      for (const s of seeds) {
        const d = Math.abs(s.x - x) + Math.abs(s.y - y);
        if (d < bestDist) { bestDist = d; best = s.biomeIdx; }
      }
      biomeIndex[y * width + x] = best;
    }
  }

  return { width, height, biomeIndex, biomeIds, biomeNames, colors, passableByBiome };
}
