import { World } from './ecs.ts';
import { createRNG, rngInt, rngFloat } from './rng.ts';
import {
  C_POSITION, C_NEEDS, C_WALLET, C_AGENT, C_SPECIES, C_FOOD, C_CLOCK,
} from './components.ts';
import type { Position, Needs, Wallet, Agent, SpeciesComp, Food, Clock } from './components.ts';
import type { SimConfig } from './config.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { Content } from '../content/loader.ts';
import type { Species } from '../content/schema.ts';
import { generateName } from '../content/names.ts';

export interface Simulation {
  world: World;
  rng: RNG;
  clockEntity: EntityId;
  content: Content;
}

// Weighted pick of a species archetype using the seeded RNG.
function rollSpecies(rng: RNG, species: Species[], totalWeight: number): Species {
  let r = rng() * totalWeight;
  for (const s of species) {
    r -= s.spawnWeight;
    if (r < 0) return s;
  }
  return species[species.length - 1]; // float-safety fallback
}

export function createSimulation(cfg: SimConfig, content: Content): Simulation {
  const world = new World();
  const rng = createRNG(cfg.seed);

  // Singleton clock entity
  const clockEntity = world.createEntity();
  const clock: Clock = { tick: 0, day: 0, hour: 0, isDay: true };
  world.addComponent(clockEntity, C_CLOCK, clock);

  // Scatter food sources
  for (let i = 0; i < cfg.foodSourceCount; i++) {
    const e = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, {
      x: rngInt(rng, 0, cfg.gridWidth - 1),
      y: rngInt(rng, 0, cfg.gridHeight - 1),
    });
    world.addComponent<Food>(e, C_FOOD, {
      amount: rngFloat(rng, 0.5, 1.0),
      regenPerTick: cfg.foodRegenPerTick,
    });
  }

  // Spawn agents from species archetypes (weighted), with rolled values.
  const speciesList = content.species.all();             // deterministic (sorted by id)
  const totalWeight = speciesList.reduce((sum, s) => sum + s.spawnWeight, 0);

  for (let i = 0; i < cfg.initialPopulation; i++) {
    const species = rollSpecies(rng, speciesList, totalWeight);
    const name = generateName(rng, species);

    const e = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, {
      x: rngInt(rng, 0, cfg.gridWidth - 1),
      y: rngInt(rng, 0, cfg.gridHeight - 1),
    });
    world.addComponent<Needs>(e, C_NEEDS, {
      hunger: rngFloat(rng, 0.5, 1.0),
      energy: rngFloat(rng, 0.5, 1.0),
    });
    world.addComponent<Wallet>(e, C_WALLET, {
      gold: rngFloat(rng, 10, 50),
    });
    world.addComponent<SpeciesComp>(e, C_SPECIES, {
      id: species.id,
      name: species.name,
      color: species.color,
      size: species.size,
      hungerMult: species.needs.hunger,
      energyMult: species.needs.energy,
    });
    world.addComponent<Agent>(e, C_AGENT, {
      name,
      action: 'wander',
      ticksAlive: 0,
    });
  }

  return { world, rng, clockEntity, content };
}
