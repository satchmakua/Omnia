import { World } from './ecs.ts';
import { createRNG, rngInt, rngFloat } from './rng.ts';
import {
  C_CLOCK, C_TILEMAP, C_CHRONICLE, C_EVENTLOG, C_AIRECORD, C_AGENT, C_LINEAGE, C_RELATIONSHIPS,
} from './components.ts';
import type { Clock, Agent, Lineage, Relationships, AIRecord } from './components.ts';
import type { SimConfig } from './config.ts';
import { ticksPerYear, ageInYears } from './config.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { Content } from '../content/loader.ts';
import type { Species } from '../content/schema.ts';
import { spawnAgent } from './spawnAgent.ts';
import { generateTileMap } from '../world/worldgen.ts';
import { isPassable } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { populateWorld } from '../world/populate.ts';
import { spawnBusiness } from '../world/spawn.ts';
import { createChronicle, chronicleAdd } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';
import { generateBackstory } from '../history/backstory.ts';
import { createEventLog } from '../history/eventlog.ts';
import type { EventLogData } from '../history/eventlog.ts';

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

// Marry up adult opposite-sex founders so households exist from day one.
function pairFounders(world: World, cfg: SimConfig): void {
  const males: EntityId[] = [];
  const females: EntityId[] = [];
  for (const e of world.query(C_AGENT, C_LINEAGE)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;
    (agent.sex === 'male' ? males : females).push(e);
  }
  const pairs = Math.min(males.length, females.length);
  for (let i = 0; i < pairs; i++) {
    const m = males[i], f = females[i];
    world.getComponent<Lineage>(m, C_LINEAGE)!.partner = f;
    world.getComponent<Lineage>(f, C_LINEAGE)!.partner = m;
    world.getComponent<Relationships>(m, C_RELATIONSHIPS)!.edges[f] = { type: 'partner', sentiment: 0.8 };
    world.getComponent<Relationships>(f, C_RELATIONSHIPS)!.edges[m] = { type: 'partner', sentiment: 0.8 };
  }
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

  // Live activity feed (the day-to-day ticker, distinct from the Chronicle).
  const eventEntity = world.createEntity();
  world.addComponent<EventLogData>(eventEntity, C_EVENTLOG, createEventLog());

  // Recorded LLM responses, for deterministic replay of a live-model run.
  const recordEntity = world.createEntity();
  world.addComponent<AIRecord>(recordEntity, C_AIRECORD, { entries: [] });

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

  const tpy = ticksPerYear(cfg);
  for (let i = 0; i < cfg.initialPopulation; i++) {
    const species = rollSpecies(rng, speciesList, totalWeight);
    const { x, y } = findPassableTile(rng, tileMap);
    // Founders have a spread of ages so the town starts with a real generation mix.
    const ageTicks = Math.floor(rngFloat(rng, cfg.initialAgeMinYears, cfg.initialAgeMaxYears) * tpy);
    spawnAgent(world, cfg, rng, species, { x, y, ageTicks });
  }

  // Pre-pair adult founders into couples so the first generation can start
  // families immediately (a founding town arrives with households), rather than
  // spending years courting while the elders die off.
  pairFounders(world, cfg);

  return { world, rng, clockEntity, content };
}
