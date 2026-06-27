// Aquatic life (M24 slice 1): fish swim within the water tiles, school (many to a tile, no
// occupancy), and breed up to a cap set by the water area — so the shoals self-regulate like
// the land fauna. No brain, no hunger (plankton is abstracted); they're a standing food source
// the fishing economy (M24 s2) will draw on, and a boat will later cross the water they fill.
// Pure instinct + the single seeded RNG → deterministic.
import type { World, EntityId } from '../ecs.ts';
import { C_FISH, C_POSITION, C_TILEMAP } from '../components.ts';
import type { Fish, Position } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import { isWater } from '../../world/tilemap.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { wanderStep } from './movementUtil.ts';

const FISH_DENSITY = 0.25;            // fish per water tile at carrying capacity
const FISH_BREED_CHANCE_PER_DAY = 0.5;
const IDLE = 0.35;                    // fish often hold station rather than dart every tick

// Water-tile count is fixed after world-gen, so cache it per map (avoid an O(W·H) scan a tick).
const waterCountCache = new WeakMap<TileMapData, number>();
function waterTileCount(map: TileMapData): number {
  let c = waterCountCache.get(map);
  if (c === undefined) {
    c = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isWater(map, x, y)) c++;
    waterCountCache.set(map, c);
  }
  return c;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function runFishSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const mapEnts = world.query(C_TILEMAP);
  if (!mapEnts.length) return;
  const map = world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP)!;
  const fishes = world.query(C_FISH, C_POSITION);
  if (fishes.length === 0) return;   // shoals are seeded at world-gen (seedFish)

  const water = (x: number, y: number) => isWater(map, x, y);
  const cap = Math.floor(waterTileCount(map) * FISH_DENSITY);
  const breedChance = FISH_BREED_CHANCE_PER_DAY / cfg.ticksPerDay;
  let count = fishes.length;
  const births: { x: number; y: number }[] = [];

  for (const e of fishes) {
    const f = world.getComponent<Fish>(e, C_FISH)!;
    const pos = world.getComponent<Position>(e, C_POSITION)!;
    if (f.breedCooldownTicks > 0) f.breedCooldownTicks -= 1;
    wanderStep(pos, rng, water, undefined, IDLE);   // swim to an adjacent water tile (or hold)
    if (f.breedCooldownTicks === 0 && count < cap && rng() < breedChance) {
      const [dx, dy] = DIRS[Math.floor(rng() * DIRS.length)];
      const nx = pos.x + dx, ny = pos.y + dy;
      if (water(nx, ny)) {
        births.push({ x: nx, y: ny });
        count++;
        f.breedCooldownTicks = Math.floor(cfg.ticksPerDay);
      }
    }
  }

  for (const b of births) {
    const e: EntityId = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, { x: b.x, y: b.y });
    world.addComponent<Fish>(e, C_FISH, { breedCooldownTicks: Math.floor(cfg.ticksPerDay) });
  }
}

// Seed the initial shoals at world-gen: scatter fish across a fraction of the water tiles.
// Deterministic (uses the seeded RNG); called once from createSimulation.
export function seedFish(world: World, cfg: SimConfig, map: TileMapData, rng: RNG): void {
  const target = Math.floor(waterTileCount(map) * FISH_DENSITY * 0.5);   // start at half carrying capacity
  let placed = 0, attempts = 0;
  const maxAttempts = target * 20 + 50;
  while (placed < target && attempts < maxAttempts) {
    attempts++;
    const x = Math.floor(rng() * map.width), y = Math.floor(rng() * map.height);
    if (!isWater(map, x, y)) continue;
    const e = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, { x, y });
    world.addComponent<Fish>(e, C_FISH, { breedCooldownTicks: Math.floor(rng() * cfg.ticksPerDay) });
    placed++;
  }
}
