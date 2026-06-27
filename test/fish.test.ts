// Aquatic life (M24 slice 1): fish are seeded into water tiles, swim only within the water,
// breed up to a water-area cap, and never wander onto land. (The fishing economy in slice 2
// will draw them down.)
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_FISH, C_POSITION, C_TILEMAP } from '../src/sim/components.ts';
import type { Position, Fish } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { isWater } from '../src/world/tilemap.ts';
import { runFishSystem, seedFish } from '../src/sim/systems/FishSystem.ts';
import { createRNG } from '../src/sim/rng.ts';

const cfg = defaultConfig;

// An 8×8 map: the left half is passable land, the right half (x ≥ 4) is water.
function pondWorld(): { w: World; map: TileMapData } {
  const W = 8, H = 8;
  const biomeIndex = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) biomeIndex[y * W + x] = x >= 4 ? 1 : 0;
  const map: TileMapData = {
    width: W, height: H, biomeIndex,
    biomeIds: ['ground', 'sea'], biomeNames: ['Ground', 'Sea'], colors: ['#333', '#258'],
    passableByBiome: [true, false],
  };
  const w = new World();
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, map);
  return { w, map };
}
const fishCount = (w: World) => w.query(C_FISH, C_POSITION).length;
const allInWater = (w: World, map: TileMapData) =>
  w.query(C_FISH, C_POSITION).every(e => { const p = w.getComponent<Position>(e, C_POSITION)!; return isWater(map, p.x, p.y); });

describe('seedFish (M24)', () => {
  it('stocks only water tiles, at half carrying capacity', () => {
    const { w, map } = pondWorld();
    seedFish(w, cfg, map, createRNG(1));
    // 32 water tiles × 0.25 density × 0.5 = 4 fish.
    expect(fishCount(w)).toBe(4);
    expect(allInWater(w, map)).toBe(true);
  });
});

describe('FishSystem (M24)', () => {
  it('fish swim but never leave the water', () => {
    const { w, map } = pondWorld();
    seedFish(w, cfg, map, createRNG(2));
    const rng = createRNG(2);
    for (let t = 0; t < 500; t++) runFishSystem(w, cfg, rng);
    expect(allInWater(w, map)).toBe(true);
  });

  it('the shoal breeds up toward the water-area cap, and never past it', () => {
    const { w, map } = pondWorld();
    seedFish(w, cfg, map, createRNG(3));
    const start = fishCount(w);
    const rng = createRNG(3);
    for (let t = 0; t < 4000; t++) runFishSystem(w, cfg, rng);
    const end = fishCount(w);
    expect(end).toBeGreaterThan(start);   // they multiplied
    expect(end).toBeLessThanOrEqual(8);   // cap = 32 water tiles × 0.25
    expect(allInWater(w, map)).toBe(true);
  });

  it('does nothing when there are no fish to begin with', () => {
    const { w } = pondWorld();
    runFishSystem(w, cfg, createRNG(4));
    expect(fishCount(w)).toBe(0);
  });
});
