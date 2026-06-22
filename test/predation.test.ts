import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { createRNG } from '../src/sim/rng.ts';
import { defaultConfig, scaledMaxFauna } from '../src/sim/config.ts';
import { C_FAUNA, C_FLORA, C_POSITION, C_TILEMAP } from '../src/sim/components.ts';
import type { Fauna, Flora, Position } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { runFaunaSystem } from '../src/sim/systems/FaunaSystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;

function openMap(w: number, h: number): TileMapData {
  return { width: w, height: h, biomeIndex: new Uint16Array(w * h),
    biomeIds: ['g'], biomeNames: ['G'], colors: ['#333'], passableByBiome: [true] };
}
function addFauna(world: World, x: number, y: number, o: Partial<Fauna>): number {
  const e = world.createEntity();
  world.addComponent<Position>(e, C_POSITION, { x, y });
  world.addComponent<Fauna>(e, C_FAUNA, {
    speciesId: 't', name: 'T', color: '#888888', size: 'small', diet: 'grazer',
    hunger: 0.8, hungerDecayPerTick: 0.001, breedThreshold: 0.7, breedCooldownTicks: 999, ticksAlive: 0, ...o,
  });
  return e;
}

describe('predators hunt grazers (M8 slice 5)', () => {
  it('a predator catches and eats an adjacent grazer', () => {
    const world = new World();
    world.addComponent<TileMapData>(world.createEntity(), C_TILEMAP, openMap(20, 20));
    // Ripe flora on the grazer's tile so it grazes in place (stays adjacent to the hunter).
    const gf = world.createEntity();
    world.addComponent<Position>(gf, C_POSITION, { x: 6, y: 5 });
    world.addComponent<Flora>(gf, C_FLORA, { speciesId: 'f', name: 'F', color: '#7faa5e',
      maturity: 1, growthPerTick: 0, edibleAt: 0.4, foodYield: 0.3, spreadChancePerTick: 0 });

    const predator = addFauna(world, 5, 5, { diet: 'predator', hunger: 0.3 });
    const grazer = addFauna(world, 6, 5, { diet: 'grazer', hunger: 0.5 });

    runFaunaSystem(world, cfg, createRNG(1));

    expect(world.isAlive(grazer)).toBe(false);                                          // devoured
    expect(world.getComponent<Fauna>(predator, C_FAUNA)!.hunger).toBeGreaterThan(0.3);  // fed
  });

  it('a predator with no prey in sight falls back to grazing (does not starve out)', () => {
    const world = new World();
    world.addComponent<TileMapData>(world.createEntity(), C_TILEMAP, openMap(20, 20));
    const ff = world.createEntity();
    world.addComponent<Position>(ff, C_POSITION, { x: 5, y: 5 });
    world.addComponent<Flora>(ff, C_FLORA, { speciesId: 'f', name: 'F', color: '#7faa5e',
      maturity: 1, growthPerTick: 0, edibleAt: 0.4, foodYield: 0.4, spreadChancePerTick: 0 });
    const predator = addFauna(world, 5, 5, { diet: 'predator', hunger: 0.3 });

    runFaunaSystem(world, cfg, createRNG(1));   // no grazers anywhere → grazes the flora here

    expect(world.getComponent<Fauna>(predator, C_FAUNA)!.hunger).toBeGreaterThan(0.3);
  });
});

describe('fauna self-regulate without a flat cap (M8 slice 5)', () => {
  it('stay bounded — no extinction, no carpet — with predators persisting', () => {
    const content = testContent();
    const c = { ...defaultConfig, seed: 8 };
    const { world, rng, clockEntity } = createSimulation(c, content);
    runTicks(world, rng, c, clockEntity, content, 16000);

    let grazers = 0, predators = 0;
    for (const e of world.query(C_FAUNA)) {
      (world.getComponent<Fauna>(e, C_FAUNA)!.diet === 'predator' ? predators++ : grazers++);
    }
    expect(grazers).toBeGreaterThan(0);                                      // not hunted to extinction
    expect(predators).toBeGreaterThan(0);                                    // predators persist
    expect(grazers + predators).toBeLessThanOrEqual(Math.round(scaledMaxFauna(c) * 1.2)); // no carpet
  }, 40_000);
});
