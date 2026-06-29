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

// A 24×24 map: the left half is passable land, the right half (x ≥ 12) is water — big enough that the
// thinner density + the richness field produce meaningful, non-uniform shoals.
const DENSITY = 0.12;   // mirrors FISH_DENSITY in FishSystem
function pondWorld(): { w: World; map: TileMapData; waterTiles: number } {
  const W = 24, H = 24;
  const biomeIndex = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) biomeIndex[y * W + x] = x >= 12 ? 1 : 0;
  const map: TileMapData = {
    width: W, height: H, biomeIndex,
    biomeIds: ['ground', 'sea'], biomeNames: ['Ground', 'Sea'], colors: ['#333', '#258'],
    passableByBiome: [true, false],
  };
  const w = new World();
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, map);
  return { w, map, waterTiles: W * H / 2 };
}
const fishCount = (w: World) => w.query(C_FISH, C_POSITION).length;
const allInWater = (w: World, map: TileMapData) =>
  w.query(C_FISH, C_POSITION).every(e => { const p = w.getComponent<Position>(e, C_POSITION)!; return isWater(map, p.x, p.y); });

describe('seedFish (M24)', () => {
  it('stocks only water tiles, sparingly (a thin sea, ≤ half carrying capacity)', () => {
    const { w, map, waterTiles } = pondWorld();
    seedFish(w, cfg, map, createRNG(1));
    expect(fishCount(w)).toBeGreaterThan(0);
    expect(fishCount(w)).toBeLessThanOrEqual(Math.floor(waterTiles * DENSITY * 0.5));   // richness-weighted → at or under target
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
    const { w, map, waterTiles } = pondWorld();
    seedFish(w, cfg, map, createRNG(3));
    const start = fishCount(w);
    const rng = createRNG(3);
    for (let t = 0; t < 6000; t++) runFishSystem(w, cfg, rng);
    const end = fishCount(w);
    expect(end).toBeGreaterThan(start);                                  // they multiplied
    expect(end).toBeLessThanOrEqual(Math.floor(waterTiles * DENSITY));   // never past the cap
    expect(allInWater(w, map)).toBe(true);
  });

  it('the shoals are NON-uniform — rich grounds teem while other waters lie near-empty', () => {
    const { w, map } = pondWorld();
    seedFish(w, cfg, map, createRNG(5));
    const rng = createRNG(5);
    for (let t = 0; t < 6000; t++) runFishSystem(w, cfg, rng);
    // tally fish per water tile
    const perTile = new Map<number, number>();
    for (const e of w.query(C_FISH, C_POSITION)) {
      const p = w.getComponent<Position>(e, C_POSITION)!;
      perTile.set(p.y * map.width + p.x, (perTile.get(p.y * map.width + p.x) ?? 0) + 1);
    }
    let waterTiles = 0;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (isWater(map, x, y)) waterTiles++;
    const occupied = perTile.size;
    const busiest = Math.max(...perTile.values());
    // most of the sea is empty (the fish cluster), and the best ground is well above the average density.
    expect(occupied).toBeLessThan(waterTiles * 0.6);                 // not spread across the whole sea
    expect(busiest).toBeGreaterThan(fishCount(w) / occupied);        // a real hotspot, above the mean
  });

  it('does nothing when there are no fish to begin with', () => {
    const { w } = pondWorld();
    runFishSystem(w, cfg, createRNG(4));
    expect(fishCount(w)).toBe(0);
  });
});
