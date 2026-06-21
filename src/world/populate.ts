// Scatter flora, fauna, and resource nodes across the generated terrain, gated
// by each tile's biome spawn table. Deterministic (seeded). Densities and caps
// come from config so the world starts lively but bounded.
import type { World } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import { scaledMaxFlora, scaledMaxFauna } from '../sim/config.ts';
import type { RNG } from '../sim/rng.ts';
import type { Content } from '../content/loader.ts';
import type { SpawnTableEntry } from '../content/schema.ts';
import { isPassable, biomeIndexAt } from './tilemap.ts';
import type { TileMapData } from './tilemap.ts';
import { spawnFlora, spawnFauna, spawnResource } from './spawn.ts';

function pickWeighted(rng: RNG, entries: SpawnTableEntry[]): SpawnTableEntry {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e;
  }
  return entries[entries.length - 1];
}

export interface PopulateResult { flora: number; fauna: number; resources: number; }

export function populateWorld(
  world: World, rng: RNG, cfg: SimConfig, content: Content, map: TileMapData,
): PopulateResult {
  // Resolve each biome index once.
  const biomeByIndex = map.biomeIds.map(id => content.biomes.require(id));
  const maxFlora = scaledMaxFlora(cfg), maxFauna = scaledMaxFauna(cfg);
  let flora = 0, fauna = 0, resources = 0;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isPassable(map, x, y)) continue;
      const biome = biomeByIndex[biomeIndexAt(map, x, y)];

      // Roll order is fixed (flora, fauna, resource) for determinism.
      if (flora < maxFlora && biome.flora.length > 0 && rng() < cfg.floraDensity) {
        spawnFlora(world, x, y, content.flora.require(pickWeighted(rng, biome.flora).id), cfg, rng);
        flora++;
      }
      if (fauna < maxFauna && biome.fauna.length > 0 && rng() < cfg.faunaDensity) {
        spawnFauna(world, x, y, content.fauna.require(pickWeighted(rng, biome.fauna).id), cfg, rng);
        fauna++;
      }
      if (biome.resources.length > 0 && rng() < cfg.resourceDensity) {
        spawnResource(world, x, y, content.resources.require(pickWeighted(rng, biome.resources).id), cfg, rng);
        resources++;
      }
    }
  }

  return { flora, fauna, resources };
}
