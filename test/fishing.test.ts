// The fishing economy (M24 slice 2): a coastal fishery nets fish from the water for the town's
// table. The catch is capped by the fish actually present, so over-fished waters yield less; the
// caught fish are removed (the stock thins) and the catch (in provisions) becomes market supply.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_BUSINESS, C_AGENT, C_JOB, C_FISH, C_POSITION, C_MARKET, C_TILEMAP, C_CLOCK,
} from '../src/sim/components.ts';
import type { Business, Job, Agent, Fish, Position, Clock } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { coastalTile, isWater } from '../src/world/tilemap.ts';
import { createMarket, measureSupplyDemand } from '../src/sim/market.ts';
import { runFishingSystem } from '../src/sim/systems/FishingSystem.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

// 8×8 map: left half land, right half (x ≥ 4) water.
function pondMap(): TileMapData {
  const W = 8, H = 8;
  const biomeIndex = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) biomeIndex[y * W + x] = x >= 4 ? 1 : 0;
  return { width: W, height: H, biomeIndex, biomeIds: ['g', 's'], biomeNames: ['G', 'S'], colors: ['#333', '#258'], passableByBiome: [true, false] };
}

function fishingWorld(workers: number, fishCount: number): { w: World; market: ReturnType<typeof createMarket> } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, pondMap());
  const market = createMarket(cfg);
  w.addComponent(w.createEntity(), C_MARKET, market);
  // A fishery on the coast at (3,4): land tile bordering water (4,4).
  const fishery = w.createEntity();
  w.addComponent<Position>(fishery, C_POSITION, { x: 3, y: 4 });
  w.addComponent<Business>(fishery, C_BUSINESS, {
    professionId: 'fisher', professionName: 'Fisher', color: '#4f93a8', balance: 50,
    maxEmployees: 4, wagePerTick: 0.04, revenuePerWorkerPerTick: 0.05, requiresAptitude: false,
    gathers: null, producesFood: true, fishery: true,
  });
  for (let i = 0; i < workers; i++) {
    const a = w.createEntity();
    w.addComponent<Agent>(a, C_AGENT, { name: `F${a}`, action: 'work', ticksAlive: 1e6, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Job>(a, C_JOB, { professionId: 'fisher', professionName: 'Fisher', employer: fishery, wagePerTick: 0.04, gathers: null });
  }
  // Fish strung along the water within the nets' reach of (3,4).
  for (let i = 0; i < fishCount; i++) {
    const e = w.createEntity();
    w.addComponent<Position>(e, C_POSITION, { x: 4 + (i % 4), y: 4 });
    w.addComponent<Fish>(e, C_FISH, { breedCooldownTicks: 0 });
  }
  return { w, market };
}
const fishLeft = (w: World) => w.query(C_FISH, C_POSITION).length;

describe('fisher profession + coast (M24)', () => {
  it('ships a fisher profession that produces food and is a fishery', () => {
    const f = content.professions.require('fisher');
    expect(f.producesFood).toBe(true);
    expect(f.fishery).toBe(true);
  });

  it('coastalTile finds a passable tile that borders water', () => {
    const map = pondMap();
    const spot = coastalTile(createRNG(1), map)!;
    expect(spot).not.toBeNull();
    const bordersWater = isWater(map, spot.x + 1, spot.y) || isWater(map, spot.x - 1, spot.y) || isWater(map, spot.x, spot.y + 1) || isWater(map, spot.x, spot.y - 1);
    expect(isWater(map, spot.x, spot.y)).toBe(false);   // the dock stands on land
    expect(bordersWater).toBe(true);
  });
});

describe('FishingSystem (M24)', () => {
  it('a staffed fishery nets fish (2 per worker), removing them and feeding the market', () => {
    const { w, market } = fishingWorld(2, 20);   // 2 fishers, plenty of fish
    runFishingSystem(w, cfg);
    expect(fishLeft(w)).toBe(16);          // 2 workers × 2 fish = 4 caught
    expect(market.fishCatch).toBe(4);      // 4 fish × 1 provision
  });

  it('over-fished water caps the catch at the fish actually present', () => {
    const { w, market } = fishingWorld(4, 3);    // 4 fishers want 8, but only 3 fish are there
    runFishingSystem(w, cfg);
    expect(fishLeft(w)).toBe(0);           // all 3 taken
    expect(market.fishCatch).toBe(3);      // catch capped by the stock — a poor haul
  });

  it('the catch feeds the market supply (and fishery workers are not double-counted)', () => {
    const { w, market } = fishingWorld(2, 20);
    runFishingSystem(w, cfg);
    const { supply } = measureSupplyDemand(w, cfg);
    // supply = foraged baseline + farm-workers(0) + fishCatch(4)
    expect(supply).toBeCloseTo(cfg.baseForagedProvisions + (market.fishCatch ?? 0), 6);
  });

  it('no fisheries → no catch', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const market = createMarket(cfg);
    w.addComponent(w.createEntity(), C_MARKET, market);
    runFishingSystem(w, cfg);
    expect(market.fishCatch).toBe(0);
  });
});
