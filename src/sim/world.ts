import { World } from './ecs.ts';
import { createRNG, rngFloat } from './rng.ts';
import {
  C_CLOCK, C_TILEMAP, C_CHRONICLE, C_EVENTLOG, C_WORLDSTATS, C_CULTURESTORE, C_LANGUAGESTORE,
  C_AIRECORD, C_AGENT, C_LINEAGE, C_RELATIONSHIPS, C_BUSINESS, C_POSITION, C_ORGSTORE, C_MARKET, C_ACHIEVEMENTS,
  C_RELIGIONSTORE, C_FIGURES, C_ARTIFACTS, C_WONDERS, C_INTERVENTIONS,
} from './components.ts';
import type { Clock, Agent, Lineage, Relationships, AIRecord, Position } from './components.ts';
import type { SimConfig } from './config.ts';
import { ticksPerYear, ageInYears, scaledBiomeSeeds, scaledBusinessCount } from './config.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { Content } from '../content/loader.ts';
import type { Species } from '../content/schema.ts';
import { spawnAgent, renameToClan } from './spawnAgent.ts';
import { raiseCivic } from './civicBuild.ts';
import { seedFish } from './systems/FishSystem.ts';
import { detectIslands, findMainlandTile, findMainlandCoastalTile, findIslandTile } from '../world/islands.ts';
import { generateTileMap } from '../world/worldgen.ts';
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
import { createCultureStore, getCultureStore, getCulture, cultureForLanguage } from '../culture/cultureStore.ts';
import type { CultureStoreData } from '../culture/cultureStore.ts';
import { createLanguageStore, getLanguageStore, getLanguage } from '../lang/languageStore.ts';
import type { LanguageStoreData } from '../lang/languageStore.ts';
import { createOrgStore, createOrg, getOrgStore } from '../org/orgStore.ts';
import { createReligionStore, createReligion, getReligionStore } from '../religion/religionStore.ts';
import { createMarket } from './market.ts';
import { createAchievements } from './systems/AchievementSystem.ts';
import { createFigures } from '../history/figures.ts';
import { createArtifacts } from '../history/artifacts.ts';
import { createWonders } from './systems/WonderSystem.ts';
import { createInterventions } from './interventions.ts';
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
// The town's shared civic buildings (M11 s3; functions M21). Content-driven
// (content/buildings/*.yaml): some are mere landmarks (hall/well/shrine), others
// radiate a real function over nearby folk. At founding, the town raises every building
// its starting size already warrants (landmarks have minPopulation 0; a market/tavern come
// with a modest town); the rest are raised later, as it grows, by the CivicBuildSystem.
// Placed deterministically AFTER all RNG-consuming generation, so placement is purely additive
// to the RNG stream (the *effects* perturb the trajectory, like any system).
function placeCivic(world: World, cfg: SimConfig, map: TileMapData, content: Content): void {
  const occupied = new Set<number>();
  for (const e of world.query(C_BUSINESS, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    occupied.add(p.y * cfg.gridWidth + p.x);
  }
  const pop = world.query(C_AGENT).length;
  for (const b of content.buildings.all()) {
    if (b.minPopulation <= pop) raiseCivic(world, cfg, map, b, occupied);
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
    // A clan IS the family line (M20): the member carries the clan's word as their surname.
    renameToClan(agent, store.byId[agent.orgId].surname);
  }
}

// A foreign settlement on the island (M24 s4): sometimes the far shore is already home to its
// own people — one species, in their own overseas clan, isolated until a boat bridges the sea.
const ISLAND_POPULATE_CHANCE = 0.6;
const ISLAND_FOUNDERS = 5;
function seedIslandSettlement(
  world: World, cfg: SimConfig, rng: RNG, content: Content, map: TileMapData,
  island: ReturnType<typeof detectIslands>['island'],
): void {
  if (!island) return;
  if (rng() >= ISLAND_POPULATE_CHANCE) return;   // the isle is sometimes uninhabited
  const store = getOrgStore(world);
  const cstore = getCultureStore(world);
  const lstore = getLanguageStore(world);
  if (!store) return;

  // One species for the whole settlement — a coherent foreign people (e.g. "the elves across the sea").
  const speciesList = content.species.all();
  const species = speciesList[Math.floor(rng() * speciesList.length)];
  const cid = cstore ? cultureForLanguage(cstore, species.language) : undefined;
  const culture = cid && cstore ? getCulture(cstore, cid) : undefined;
  const values = culture ? { ...culture.values } : { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 };
  const lang = culture && lstore ? getLanguage(lstore, culture.language) : undefined;
  const coined = cap(lang ? word(lang, `isle-${store.created}`) : 'Isle');
  const orgId = createOrg(store, `${coined} folk`, values, rngFloat(rng, 0.5, 0.8), 0);
  const org = store.byId[orgId];
  org.surname = coined;        // a clean kin-name (clanWordOf would leave "folk" attached)
  org.overseas = true;
  org.discovered = false;

  const tpy = ticksPerYear(cfg);
  const founders: EntityId[] = [];
  for (let i = 0; i < ISLAND_FOUNDERS; i++) {
    const spot = findIslandTile(rng, map, island);
    if (!spot) break;
    const ageTicks = Math.floor(rngFloat(rng, cfg.initialAgeMinYears, cfg.initialAgeMaxYears) * tpy);
    const e = spawnAgent(world, cfg, rng, species, content, { x: spot.x, y: spot.y, ageTicks, orgId });
    renameToClan(world.getComponent<Agent>(e, C_AGENT)!, store.byId[orgId].surname);
    founders.push(e);
  }
  if (founders.length === 0) return;
  store.byId[orgId].leader = founders[0];

  // Pre-pair the island founders among themselves (never across the sea) so the colony can breed.
  const males = founders.filter(e => world.getComponent<Agent>(e, C_AGENT)!.sex === 'male');
  const females = founders.filter(e => world.getComponent<Agent>(e, C_AGENT)!.sex === 'female');
  for (let i = 0; i < Math.min(males.length, females.length); i++) {
    const m = males[i], f = females[i];
    const lm = world.getComponent<Lineage>(m, C_LINEAGE), lf = world.getComponent<Lineage>(f, C_LINEAGE);
    if (lm) lm.partner = f;
    if (lf) lf.partner = m;
    const rm = world.getComponent<Relationships>(m, C_RELATIONSHIPS), rf = world.getComponent<Relationships>(f, C_RELATIONSHIPS);
    if (rm) rm.edges[f] = { type: 'partner', sentiment: 0.8 };
    if (rf) rf.edges[m] = { type: 'partner', sentiment: 0.8 };
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
    const fervor = cl(0.35 + v.traditional * 0.5 + (rng() * 2 - 1) * 0.18);   // traditional cultures are more devout; real spread of devotion
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

  // Generate terrain first (consumes RNG), store as a singleton component. The heightmap paints
  // natural seas; the mainland + any sea-locked island fall out as connected land components (M24).
  const tileMap = generateTileMap(rng, cfg.gridWidth, cfg.gridHeight, content.biomes, scaledBiomeSeeds(cfg));
  const { mainland, island } = detectIslands(tileMap);
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
  world.addComponent(world.createEntity(), C_FIGURES, createFigures());     // historical figures (M20)
  world.addComponent(world.createEntity(), C_ARTIFACTS, createArtifacts()); // legendary artifacts (M20 s2)
  world.addComponent(world.createEntity(), C_WONDERS, createWonders());     // town-scale wonders (M20 s3b)
  world.addComponent(world.createEntity(), C_INTERVENTIONS, createInterventions()); // god-mode acts, recorded (M27)

  // Recorded LLM responses, for deterministic replay of a live-model run.
  const recordEntity = world.createEntity();
  world.addComponent<AIRecord>(recordEntity, C_AIRECORD, { entries: [] });

  // Populate the world with flora, fauna, and resources from biome spawn tables.
  populateWorld(world, rng, cfg, content, tileMap);

  // Place employer businesses (round-robin over professions for variety). A fishery is built
  // on the coast (a passable tile bordering water) so it can net the fish; if the map has no
  // coast it falls back to dry land (a degenerate, catchless fishery — rare).
  const professions = content.professions.all();          // deterministic (sorted by id)
  if (professions.length > 0) {
    for (let i = 0; i < scaledBusinessCount(cfg); i++) {
      const prof = professions[i % professions.length];
      const spot = (prof.fishery ? findMainlandCoastalTile(rng, tileMap, mainland) : null) ?? findMainlandTile(rng, tileMap, mainland);
      spawnBusiness(world, spot.x, spot.y, prof, cfg);
    }
  }

  // Spawn agents from species archetypes (weighted), with rolled values.
  const speciesList = content.species.all();             // deterministic (sorted by id)
  const totalWeight = speciesList.reduce((sum, s) => sum + s.spawnWeight, 0);

  const tpy = ticksPerYear(cfg);
  for (let i = 0; i < cfg.initialPopulation; i++) {
    const species = rollSpecies(rng, speciesList, totalWeight);
    const { x, y } = findMainlandTile(rng, tileMap, mainland);   // the town founds on the mainland
    // Founders have a spread of ages so the town starts with a real generation mix.
    const ageTicks = Math.floor(rngFloat(rng, cfg.initialAgeMinYears, cfg.initialAgeMaxYears) * tpy);
    spawnAgent(world, cfg, rng, species, content, { x, y, ageTicks });
  }

  // Pre-pair adult founders into couples so the first generation can start
  // families immediately (a founding town arrives with households), rather than
  // spending years courting while the elders die off.
  pairFounders(world, cfg);

  // Civic buildings (deterministic placement; their functions act via the CivicSystem).
  placeCivic(world, cfg, tileMap, content);

  // Found the initial tribes and assign the founders (M14).
  seedTribes(world, cfg, rng);
  seedReligions(world, cfg, rng);   // faiths, one per founding culture (M18)

  // Sometimes a foreign people already lives on the island, across the sea (M24 s4).
  seedIslandSettlement(world, cfg, rng, content, tileMap, island);

  // Stock the waters with fish (M24). Last, so it doesn't perturb prior gen RNG.
  seedFish(world, cfg, tileMap, rng);

  return { world, rng, clockEntity, content };
}
