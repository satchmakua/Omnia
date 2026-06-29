// Seeded, deterministic terrain generation. Two passes: (1) a cheap Voronoi over the LAND biomes
// gives each tile a contiguous land type (ashen plains, fungal forest, …); (2) a fractal-noise
// **heightmap** sinks the low ground into sea — so the map has natural coastlines, real bodies of
// water, and **islands** (land cut off from the mainland by the sea), rather than a hand-placed
// square. The perimeter is faded into ocean so the world reads as a continent in a sea, with
// offshore isles in the surf. Same RNG state in ⇒ identical map.
import { rngInt } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import type { Biome } from '../content/schema.ts';
import type { Registry } from '../content/registry.ts';
import type { TileMapData } from './tilemap.ts';
import { fractalHeight } from './noise.ts';

interface Seed { x: number; y: number; biomeIdx: number; }

const SEA_FRACTION = 0.36;   // share of the map that becomes water — a real ocean, not a moat
const OCEAN_PULL = 0.9;      // how hard the heightmap is sunk toward the deep-ocean corner

const smooth = (t: number): number => t * t * (3 - 2 * t);

function pickWeightedIdx(rng: RNG, choices: number[], weights: number[], total: number): number {
  let r = rng() * total;
  for (let i = 0; i < choices.length; i++) {
    r -= weights[i];
    if (r < 0) return choices[i];
  }
  return choices[choices.length - 1]; // float-safety fallback
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

  // Split biomes into land (passable) and water (impassable). The Voronoi places only LAND types;
  // the sea is painted afterwards by the heightmap, using the first water biome.
  const landIdxs = biomes.map((_, i) => i).filter(i => passableByBiome[i]);
  const waterIdx = passableByBiome.findIndex(p => !p);   // -1 if the content has no water biome
  if (landIdxs.length === 0) {
    throw new Error('World generation needs at least one passable (land) biome');
  }
  const landWeights = landIdxs.map(i => genWeights[i]);
  const landTotal = landWeights.reduce((s, w) => s + w, 0);

  // Pass 1 — Voronoi land types: scatter seeds, each tile takes its nearest seed's biome.
  const count = Math.max(1, seedCount);
  const seeds: Seed[] = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: rngInt(rng, 0, width - 1),
      y: rngInt(rng, 0, height - 1),
      biomeIdx: pickWeightedIdx(rng, landIdxs, landWeights, landTotal),
    });
  }
  const biomeIndex = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = landIdxs[0];
      let bestDist = Infinity;
      for (const s of seeds) {
        const d = Math.abs(s.x - x) + Math.abs(s.y - y);
        if (d < bestDist) { bestDist = d; best = s.biomeIdx; }
      }
      biomeIndex[y * width + x] = best;
    }
  }

  // Pass 2 — the sea: a fractal heightmap sunk toward one **deep-ocean corner**, so a real body of
  // water opens up on one side of the map while the continent holds the other. The lowest
  // SEA_FRACTION of that terrain floods to water — and because the ocean lowers the *base* while the
  // noise still throws up peaks, the surf naturally throws off **islands** (land cut off by the sea).
  if (waterIdx >= 0 && SEA_FRACTION > 0) {
    const elev = fractalHeight(rng, width, height, 5, 9, 0.55);
    const ocx = rngInt(rng, 0, 1) ? width - 1 : 0;     // which corner the ocean deepens toward
    const ocy = rngInt(rng, 0, 1) ? height - 1 : 0;
    const maxd = Math.hypot(width, height);
    const adj = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dn = Math.hypot(x - ocx, y - ocy) / maxd;       // 0 at the ocean corner … ~1 far inland
        adj[y * width + x] = elev[y * width + x] - OCEAN_PULL * (1 - smooth(dn));
      }
    }
    // Sea level = the SEA_FRACTION quantile of the sunk terrain (so the sea share is consistent).
    const sorted = Float32Array.from(adj).sort();
    const seaLevel = sorted[Math.floor(SEA_FRACTION * sorted.length)];
    for (let i = 0; i < adj.length; i++) {
      if (adj[i] <= seaLevel) biomeIndex[i] = waterIdx;
    }
  }

  return { width, height, biomeIndex, biomeIds, biomeNames, colors, passableByBiome };
}
