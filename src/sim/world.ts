import { World } from './ecs.ts';
import { createRNG, rngFloat } from './rng.ts';
import {
  C_CLOCK, C_TILEMAP, C_CHRONICLE, C_EVENTLOG, C_WORLDSTATS, C_CULTURESTORE, C_LANGUAGESTORE,
  C_AIRECORD, C_AGENT, C_LINEAGE, C_RELATIONSHIPS, C_BUSINESS, C_POSITION, C_CIVIC, C_ORGSTORE, C_MARKET, C_ACHIEVEMENTS,
  C_RELIGIONSTORE,
} from './components.ts';
import type { Clock, Agent, Lineage, Relationships, AIRecord, Position, Civic } from './components.ts';
import type { SimConfig } from './config.ts';
import { ticksPerYear, ageInYears, scaledBiomeSeeds, scaledBusinessCount } from './config.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { Content } from '../content/loader.ts';
import type { Species } from '../content/schema.ts';
import { spawnAgent } from './spawnAgent.ts';
import { generateTileMap } from '../world/worldgen.ts';
import { isPassable, inBounds, findPassableTile } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { populateWorld } from '../world/populate.ts';
import { spawnBusiness } from '../world/spawn.ts';
import { createChronicle, chronicleAdd } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';
import { generateBackstory } from '../history/backstory.ts';
import { createEventLog } from '../history/eventlog.ts';
import type { EventLogData } from '../history/eventlog.ts';
import { createWorldStats } from '../history/stats.ts';
import type { WorldStatsData } from '../history/stats.ts';
import { createCultureStore, getCultureStore, getCulture } from '../culture/cultureStore.ts';
import type { CultureStoreData } from '../culture/cultureStore.ts';
import { createLanguageStore, getLanguageStore, getLanguage } from '../lang/languageStore.ts';
import type { LanguageStoreData } from '../lang/languageStore.ts';
import { createOrgStore, createOrg, getOrgStore } from '../org/orgStore.ts';
import { createReligionStore, createReligion, getReligionStore } from '../religion/religionStore.ts';
import { createMarket } from './market.ts';
import { createAchievements } from './systems/AchievementSystem.ts';
import { word } from '../lang/language.ts';

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
// The town's shared civic landmarks (M11 slice 3). Placed deterministically AFTER all
// RNG-consuming generation, so they're purely additive — the trajectory is unchanged. They
// have no mechanical role yet: legible hooks for institutions (M14) and religion (M15).
const CIVIC_BUILDINGS: { kind: string; name: string }[] = [
  { kind: 'hall', name: 'Town Hall' },
  { kind: 'well', name: 'Town Well' },
  { kind: 'shrine', name: 'Old Shrine' },
];
function placeCivic(world: World, cfg: SimConfig, map: TileMapData): void {
  const W = cfg.gridWidth;
  const occupied = new Set<number>();
  for (const e of world.query(C_BUSINESS, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    occupied.add(p.y * W + p.x);
  }
  const cx = Math.floor(map.width / 2), cy = Math.floor(map.height / 2);
  const limit = Math.max(map.width, map.height);
  for (const c of CIVIC_BUILDINGS) {
    let placed = false;
    for (let r = 0; r <= limit && !placed; r++) {
      for (let dy = -r; dy <= r && !placed; dy++) {
        for (let dx = -r; dx <= r && !placed; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (!inBounds(map, x, y) || !isPassable(map, x, y) || occupied.has(y * W + x)) continue;
          const e = world.createEntity();
          world.addComponent<Position>(e, C_POSITION, { x, y });
          world.addComponent<Civic>(e, C_CIVIC, { ...c });
          occupied.add(y * W + x);
          placed = true;
        }
      }
    }
  }
}

// Found the town's initial tribes (M14): split the adult founders into a few factions
// (households kept together), each with values seeded from its members' culture — so its
// government emerges from culture — and a hue-spaced colour. Children inherit the mother's tribe.
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
function seedTribes(world: World, cfg: SimConfig, rng: RNG): void {
  const store = getOrgStore(world);
  if (!store) return;
  const cstore = getCultureStore(world);
  const lstore = getLanguageStore(world);
  const founders = world.query(C_AGENT, C_LINEAGE)
    .filter(e => ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg) >= cfg.adultAgeYears);
  if (founders.length === 0) return;

  const baseCid = world.getComponent<Agent>(founders[0], C_AGENT)!.cultureId;
  const baseCulture = baseCid && cstore ? getCulture(cstore, baseCid) : undefined;
  const base = baseCulture ? baseCulture.values : { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 };
  const lang = baseCulture && lstore ? getLanguage(lstore, baseCulture.language) : (lstore ? Object.values(lstore.byId)[0] : undefined);
  const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
  const nudge = (x: number): number => clamp01(x + (rng() * 2 - 1) * 0.25);

  const count = Math.max(1, Math.min(cfg.initialTribes, Math.ceil(founders.length / 3)));
  const tribeIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const values = { communal: nudge(base.communal), martial: nudge(base.martial), traditional: nudge(base.traditional), open: nudge(base.open) };
    const name = `${cap(lang ? word(lang, `tribe-${store.created}`) : `Tribe${i}`)} clan`;
    tribeIds.push(createOrg(store, name, values, rngFloat(rng, 0.5, 0.8), 0));
  }

  let next = 0;
  for (const e of founders) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (agent.orgId) continue;
    const lin = world.getComponent<Lineage>(e, C_LINEAGE)!;
    const partnerOrg = lin.partner != null && world.hasComponent(lin.partner, C_AGENT)
      ? world.getComponent<Agent>(lin.partner, C_AGENT)!.orgId : undefined;
    agent.orgId = partnerOrg ?? tribeIds[(next++) % count];
  }
}

// Found a faith for each seed culture (its tenets & devoutness emerge from the culture's
// values, D18), then assign each founder the faith of their culture (M18).
function seedReligions(world: World, cfg: SimConfig, rng: RNG): void {
  const rstore = getReligionStore(world);
  const cstore = getCultureStore(world);
  const lstore = getLanguageStore(world);
  if (!rstore || !cstore) return;
  const cl = (x: number): number => Math.max(0, Math.min(1, x));
  const byCulture = new Map<string, string>();
  for (const culture of Object.values(cstore.byId)) {
    const lang = lstore ? getLanguage(lstore, culture.language) : undefined;
    const v = culture.values;
    const tenets: string[] = [
      v.communal > 0.55 ? 'communal worship' : 'personal devotion',
      v.martial > 0.55 ? 'the warrior creed' : 'the peaceful path',
    ];
    if (v.traditional > 0.55) tenets.push('ancestor rites');
    const deity = cap(lang ? word(lang, `god-${rstore.created}`) : `God${rstore.created}`);
    const fervor = cl(0.4 + v.traditional * 0.4 + (rng() * 2 - 1) * 0.1);   // traditional cultures are more devout
    byCulture.set(culture.id, createReligion(rstore, `the Faith of ${deity}`, deity, tenets, fervor, 0));
  }
  for (const e of world.query(C_AGENT)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const rid = agent.cultureId ? byCulture.get(agent.cultureId) : undefined;
    if (rid) agent.religionId = rid;
  }
}

export function createSimulation(cfg: SimConfig, content: Content): Simulation {
  const world = new World();
  const rng = createRNG(cfg.seed);

  // Singleton clock entity
  const clockEntity = world.createEntity();
  const clock: Clock = { tick: 0, day: 0, hour: 0, isDay: true };
  world.addComponent(clockEntity, C_CLOCK, clock);

  // Generate terrain first (consumes RNG), store as a singleton component.
  const tileMap = generateTileMap(rng, cfg.gridWidth, cfg.gridHeight, content.biomes, scaledBiomeSeeds(cfg));
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

  // Statistical strata (world-health running aggregates, sampled on a schedule).
  const statsEntity = world.createEntity();
  world.addComponent<WorldStatsData>(statsEntity, C_WORLDSTATS, createWorldStats());

  // Live cultures + languages, seeded from authored content (founders reference these;
  // both drift and diverge later). Created before agents so spawning can read them.
  const cultureEntity = world.createEntity();
  world.addComponent<CultureStoreData>(cultureEntity, C_CULTURESTORE, createCultureStore(content));
  const languageEntity = world.createEntity();
  world.addComponent<LanguageStoreData>(languageEntity, C_LANGUAGESTORE, createLanguageStore(content));
  world.addComponent(world.createEntity(), C_ORGSTORE, createOrgStore());   // tribes/factions (M14)
  world.addComponent(world.createEntity(), C_RELIGIONSTORE, createReligionStore()); // faiths (M18)
  world.addComponent(world.createEntity(), C_MARKET, createMarket(cfg));     // staple-goods market (M15)
  world.addComponent(world.createEntity(), C_ACHIEVEMENTS, createAchievements()); // milestones (M17)

  // Recorded LLM responses, for deterministic replay of a live-model run.
  const recordEntity = world.createEntity();
  world.addComponent<AIRecord>(recordEntity, C_AIRECORD, { entries: [] });

  // Populate the world with flora, fauna, and resources from biome spawn tables.
  populateWorld(world, rng, cfg, content, tileMap);

  // Place employer businesses (round-robin over professions for variety).
  const professions = content.professions.all();          // deterministic (sorted by id)
  if (professions.length > 0) {
    for (let i = 0; i < scaledBusinessCount(cfg); i++) {
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
    spawnAgent(world, cfg, rng, species, content, { x, y, ageTicks });
  }

  // Pre-pair adult founders into couples so the first generation can start
  // families immediately (a founding town arrives with households), rather than
  // spending years courting while the elders die off.
  pairFounders(world, cfg);

  // Civic landmarks (deterministic, additive — no RNG, trajectory unchanged).
  placeCivic(world, cfg, tileMap);

  // Found the initial tribes and assign the founders (M14).
  seedTribes(world, cfg, rng);
  seedReligions(world, cfg, rng);   // faiths, one per founding culture (M18)

  return { world, rng, clockEntity, content };
}
