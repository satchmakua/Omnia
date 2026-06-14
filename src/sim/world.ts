import { World } from './ecs.ts';
import { createRNG, rngInt, rngFloat } from './rng.ts';
import {
  C_POSITION, C_NEEDS, C_WALLET, C_AGENT, C_SPECIES, C_MAGIC, C_CLOCK, C_TILEMAP, C_CHRONICLE,
} from './components.ts';
import type { Position, Needs, Wallet, Agent, SpeciesComp, Magic, Clock } from './components.ts';
import type { SimConfig } from './config.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { Content } from '../content/loader.ts';
import type { Species } from '../content/schema.ts';
import { generateName } from '../content/names.ts';
import { generateTileMap } from '../world/worldgen.ts';
import { isPassable } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { populateWorld } from '../world/populate.ts';
import { spawnBusiness } from '../world/spawn.ts';
import { createChronicle, chronicleAdd } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';
import { generateBackstory } from '../history/backstory.ts';

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

// Find a passable tile by rejection sampling, falling back to a deterministic
// scan if the random draws keep landing on water (keeps spawns off impassable tiles).
function findPassableTile(rng: RNG, map: TileMapData): { x: number; y: number } {
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

export function createSimulation(cfg: SimConfig, content: Content): Simulation {
  const world = new World();
  const rng = createRNG(cfg.seed);

  // Singleton clock entity
  const clockEntity = world.createEntity();
  const clock: Clock = { tick: 0, day: 0, hour: 0, isDay: true };
  world.addComponent(clockEntity, C_CLOCK, clock);

  // Generate terrain first (consumes RNG), store as a singleton component.
  const tileMap = generateTileMap(rng, cfg.gridWidth, cfg.gridHeight, content.biomes, cfg.biomeSeedCount);
  const mapEntity = world.createEntity();
  world.addComponent<TileMapData>(mapEntity, C_TILEMAP, tileMap);

  // Invent the post-apocalyptic backstory as the first Chronicle entries.
  const chronicle = createChronicle();
  for (const entry of generateBackstory(rng, tileMap)) chronicleAdd(chronicle, entry);
  const chronicleEntity = world.createEntity();
  world.addComponent<ChronicleData>(chronicleEntity, C_CHRONICLE, chronicle);

  // Populate the world with flora, fauna, and resources from biome spawn tables.
  populateWorld(world, rng, cfg, content, tileMap);

  // Place employer businesses (round-robin over professions for variety).
  const professions = content.professions.all();          // deterministic (sorted by id)
  if (professions.length > 0) {
    for (let i = 0; i < cfg.businessCount; i++) {
      const { x, y } = findPassableTile(rng, tileMap);
      spawnBusiness(world, x, y, professions[i % professions.length], cfg);
    }
  }

  // Spawn agents from species archetypes (weighted), with rolled values.
  const speciesList = content.species.all();             // deterministic (sorted by id)
  const totalWeight = speciesList.reduce((sum, s) => sum + s.spawnWeight, 0);

  for (let i = 0; i < cfg.initialPopulation; i++) {
    const species = rollSpecies(rng, speciesList, totalWeight);
    const name = generateName(rng, species);
    const { x, y } = findPassableTile(rng, tileMap);

    const e = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, { x, y });
    world.addComponent<Needs>(e, C_NEEDS, {
      hunger: rngFloat(rng, 0.5, 1.0),
      energy: rngFloat(rng, 0.5, 1.0),
    });
    world.addComponent<Wallet>(e, C_WALLET, {
      gold: rngFloat(rng, 10, 50),
      debt: 0,
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
      wealthGoal: rngFloat(rng, cfg.wealthGoalMin, cfg.wealthGoalMax),
    });

    // Rare innate magic aptitude, rolled per the species' chance. Most agents
    // get no Magic component at all, so magic stays scarce by construction.
    if (rng() < species.magicAptitudeChance) {
      world.addComponent<Magic>(e, C_MAGIC, {
        mana: cfg.magicManaMax,
        maxMana: cfg.magicManaMax,
        manaRegenPerTick: cfg.manaRegenPerDay / cfg.ticksPerDay,
      });
    }
  }

  return { world, rng, clockEntity, content };
}
