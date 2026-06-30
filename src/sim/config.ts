export interface SimConfig {
  gridWidth: number;
  gridHeight: number;
  initialPopulation: number;
  seed: number;
  ticksPerDay: number;
  hungerDecayPerDay: number;
  energyDecayPerDay: number;
  funDecayPerDay: number;          // recreation/fun need depletion (M28): boredom creeps in over days
  actionThreshold: number;
  sleepRestorePerTick: number;
  funRestorePerTick: number;       // fun restored per tick of leisure (the 'relax' action) (M28)
  simSpeedTicksPerSecond: number;  // initial real-time playback speed (renderer only; decoupled from sim time)
  biomeSeedCount: number;    // number of Voronoi biome seeds at world generation
  // World population at generation (per passable tile, gated by biome spawn tables):
  floraDensity: number;      // chance a passable tile starts with flora
  faunaDensity: number;      // chance a passable tile starts with fauna
  resourceDensity: number;   // chance a passable tile starts with a resource node
  maxFlora: number;          // hard cap on flora entities (spread is bounded)
  maxFauna: number;          // hard cap on fauna entities (breeding is bounded)
  faunaBreedChancePerDay: number;  // per-day chance a fed, off-cooldown fauna breeds
  // Economy (M3):
  businessCount: number;     // number of employer entities placed at world-gen
  dailyUpkeep: number;       // cost of living deducted from each adult per day (children are exempt — D38)
  subsistencePerDay: number; // odd-jobs/foraging income for JOBLESS adults — a survival floor so the
                             //   unemployed aren't doomed to a bottomless debt spiral (Economy Rebalance)
  maxDebt: number;           // debt is bounded here — poverty, not an ever-growing hole
  debtRecoveryPenalty: number; // the indebted recover from illness this fraction slower (0..1) — poverty bites
  wealthGoalMin: number;     // agents roll a personal gold target in [min, max];
  wealthGoalMax: number;     //   they work while below it, so wealth stays bounded
  businessStartBalance: number;        // employer starting funds
  businessRevenueMargin: number;       // revenue per worker = wage × (1 + margin)
  homeCost: number;                    // gold a settled adult spends to build & own a home (M11)
  rentPerDay: number;                  // a tenant pays this to their landlord each day (M11 slice 2)
  // Staple-goods market (M15): the daily cost of living is a price that floats with supply/demand.
  provisionBasePrice: number;          // price when supply == demand (≈ the old flat upkeep, for balance)
  provisionPriceMin: number;           // price floor (a glut never goes free)
  provisionPriceMax: number;           // price ceiling (a famine never goes infinite — keeps debt bounded)
  priceAdjustRate: number;             // 0..1: how fast the price eases toward the clearing target each day
  provisionPerAdult: number;           // rations an adult consumes per day (demand)
  provisionPerFarmer: number;          // rations one food-worker produces per day (supply)
  baseForagedProvisions: number;       // wild-foraged baseline supply (the commons, independent of farms)
  marketHistoryLength: number;         // bounded price-history kept for the chart
  // Business turnover (M15 slice 2b): farms live on real sales minus a fixed operating cost,
  // so an unneeded/under-patronised farm runs a loss and folds; a new farm opens when food is
  // scarce and the existing farms are full (so the food sector tracks demand).
  farmOperatingCostPerDay: number;     // fixed daily overhead a food business pays (premises/upkeep)
  bankruptcyThreshold: number;         // a business this broke can't make ends meet — it's struggling
  bankruptcyGraceDays: number;         // consecutive struggling days a business survives before it folds
  maxFarms: number;                    // safety cap on food businesses (founding stops here)
  // Conflict (M16): ability-score-driven combat — predators threaten folk; folk fight back.
  predatorAggressionChance: number;    // per-tick chance a predator beside a folk strikes (kept low → a threat, not a cull)
  combatScarThreshold: number;         // a blow this hard (Health 0..1) leaves a permanent scar
  maimGrievousHealth: number;          // surviving a wound that leaves you below this Health may cripple you (M30)
  maimChance: number;                  // fraction of such grievous woundings that leave a permanent injury (M30)
  scarDisabilityChance: number;        // per-day chance a heavily-scarred veteran's old wounds leave a lasting disability (M30 s3)
  combatKillBlow: number;              // a counter-blow this hard slays the attacking beast
  crimeChancePerDay: number;           // daily chance an inclined agent offends against a neighbour
  crimeAlignmentThreshold: number;     // an agent whose `good` is below this is wicked enough to do violence
  theftAmount: number;                 // gold a thief lifts in one theft (capped at the victim's purse)
  warChancePerEra: number;             // chance per era a martial tribe declares war on a neighbour
  warMartialThreshold: number;         // a tribe this martial (or more) may start a war
  minWarMembers: number;               // a tribe needs at least this many to wage / be worth warring
  warDurationEras: number;             // a war lasts at most this many eras before peace
  captiveFraction: number;             // share of a routed clan's folk taken as captives into the victor's clan (M31 s3 conquest)
  battleChancePerTick: number;         // per-tick chance two adjacent enemies actually come to blows
  // Caravans & reputation (M31 s2): friendly clans trade overland; deeds ripple to a clan's standing.
  caravanIntervalDays: number;         // how often (in days) caravan trade is reckoned between clans
  caravanProfit: number;               // base gold each clan's coffers gain from a caravan run
  caravanMaxDistance: number;          // Chebyshev distance (tiles) a land route can span between two seats
  caravanChancePerInterval: number;    // share of intervals a given friendly pair actually runs a caravan (paced, deterministic)
  reputationCrimeHit: number;          // how much a cross-clan crime sours the two clans' standing (M31 s2 reputation)
  wanderIdleChance: number;            // chance an aimlessly-wandering agent simply stays put a tick (calmer motion)
  // Knowledge (M17): tribes accumulate research points and climb the tech ladder.
  researchBasePerDay: number;          // a tribe's baseline research per day
  researchPerMemberPerDay: number;     // extra research per living member per day (bigger tribes advance faster)
  // Religion (M18): faiths schism into sects over the eras, like cultures/tongues/tribes.
  religionSchismChancePerEra: number;  // per-era chance a large, loose faith fractures into a sect
  minFaithFollowers: number;           // a faith needs at least this many followers to spawn a sect
  conversionChancePerDay: number;      // daily chance a folk beside a more-devout faith adopts it (faith spreads)
  holyDayIntervalDays: number;         // M18 s2: how often a faith celebrates a holy day (its followers' mood lifts)
  holyDayMoodLift: number;             // the mood a holy day grants the faithful (scaled by the faith's fervour)
  healerHousePerPop: number;           // M30: healer's houses spawned ≈ this × the starting population (care scales with people, not land)
  healerCarePerWorker: number;         // each working healer multiplies the infirmary's cure potency by +this (capped)
  // Crafted-goods market (M36 s1): each good's price floats around its base value with supply.
  goodsPriceMinMult: number;           // price floor as a fraction of the base value (a glut can't crash it to nothing)
  goodsPriceMaxMult: number;           // price ceiling as a multiple of the base value (scarcity can't run away)
  goodsPriceAdjustRate: number;        // how fast the price eases toward its clearing target each day (0..1)
  goodsSupplyEmaRate: number;          // how fast each good's self-calibrating supply baseline tracks production (0..1)
  // Seasons (M19): a per-season abundance multiplier on plant growth and the foraged
  // commons — spring/summer quicken the land, autumn cools, winter is lean. Tuned to
  // average ~1.0 over the year so the annual food balance is unchanged; within a year
  // the food supply (and so the market price) breathes with the seasons.
  seasonGrowthSpring: number;
  seasonGrowthSummer: number;
  seasonGrowthAutumn: number;
  seasonGrowthWinter: number;
  // Capabilities / magic (M3 part 2):
  magicManaMax: number;                // mana pool size for aptitude-gifted agents
  manaRegenPerDay: number;             // mana regenerated per in-sim day
  // Life cycle (M4):
  daysPerYear: number;                 // sim-days in a "year" (compressed so lives turn over)
  adultAgeYears: number;               // age at which an agent works / courts / reproduces
  initialAgeMinYears: number;          // founders are seeded with ages in this range
  initialAgeMaxYears: number;
  socialDecayPerDay: number;           // social need depletion
  socialGainPerInteract: number;       // social restored per tick spent beside another agent
  sentimentGainPerInteract: number;    // relationship sentiment gained per tick together
  friendSentiment: number;             // sentiment at/above which an edge becomes "friend"
  marrySentiment: number;              // sentiment needed to consider marriage
  marryChancePerDay: number;           // daily chance an eligible, willing pair weds
  illnessChancePerDay: number;         // chance per day of falling ill
  illnessHealthLoss: number;           // health lost when illness strikes
  chronicIllnessChance: number;        // fraction of the old's illnesses that settle into a chronic, treatable condition (M30 s2)
  infirmaryCareRadius: number;         // how far an infirmary's healers make their rounds to tend the afflicted (M30 s2)
  healthRecoveryPerDay: number;        // health regained per day when not newly ill
  baseMortalityPerDay: number;         // flat background death chance
  ageMortalityScale: number;           // age-driven mortality multiplier (ramps near lifespan)
  sickMortalityPerDay: number;         // extra death chance while in poor health
  // Reproduction (M4 part 2):
  maxPopulation: number;               // births pause at this cap (bounds growth)
  birthChancePerDay: number;           // daily chance an eligible couple conceives
  reproCooldownDays: number;           // a mother's recovery between births
  fertilityMaxAgeYears: number;        // upper age for bearing children
  reproMinHunger: number;              // parents must be at least this fed to breed
  reproMinHealth: number;              // ...and at least this healthy
  childMageAptitudeChance: number;     // aptitude chance for a child with a mage parent (heritable)
  // Resource gathering (M4.5):
  gatherPerDay: number;                // how fast one worker depletes a resource node
  // Inventory & crafting (M23):
  inventoryMaxPerItem: number;         // carrying cap per material/good — keeps inventories bounded
  materialYield: number;               // material units banked per unit of node depleted (so a day of
                                       //   gathering yields enough to craft; node depletion is unchanged)
  // The soul / memory (M5):
  workingMemorySize: number;           // raw-memory high-water mark; rollup triggers above this
  reflectionIntervalDays: number;      // min sim-days between an agent's reflections
  maxReflectionsPerTick: number;       // global throttle so the LLM layer stays rare
  minMemoriesToReflect: number;        // an agent needs at least this many memories first
  reflectMemories: number;             // how many top memories feed a reflection
  maxBeliefs: number;                  // beliefs kept per agent
  // Dialogue / dreams / decisions (M5 part 2):
  expressionIntervalDays: number;      // min sim-days between an agent's dialogue/dream/decision
  maxExpressionsPerTick: number;       // global per-tick cap on utterances (keeps the soul rare)
  maxUtterances: number;               // recent utterances kept per agent
  decisionImportance: number;          // a memory at/above this importance is a "turning point"
  // Multi-resolution memory rollup (M6):
  memoryRollupIntervalDays: number;    // how often the scheduled rollup/prune pass runs
  memoryRetainAfterRollup: number;     // raw events kept after a rollup (the rest are digested)
  summaryImportanceThreshold: number;  // events at/above this are named vividly in a digest
  maxSummaries: number;                // episodic summaries per agent; oldest merge when exceeded
  // Tiered Chronicle + statistical strata (M6 item 2):
  chronicleImportanceThreshold: number; // gate: only events this notable enter the Chronicle
  chronicleRecentCap: number;          // recent detailed legends before a compression pass
  chronicleRetainAfterRollup: number;  // detailed legends kept after compression
  chronicleLegendImportance: number;   // entries this notable survive compression as named legends
  chronicleMaxEras: number;            // compressed eras kept; oldest merge when exceeded
  statsSampleIntervalDays: number;     // how often world-health strata are sampled
  maxStatSamples: number;              // bounded length of the strata time-series
  // Culture & language evolution (M7 slice 3):
  evolutionIntervalDays: number;       // an "era" — how often languages/cultures drift
  valueDriftPerEra: number;            // base magnitude of a culture's value random walk (damped by cohesion)
  storytellerTemperament: string;      // the adaptive event director's temperament: measured | calm | harsh | capricious (M32 s2)
  // Schism / divergence (M7 slice 4):
  schismChancePerEra: number;          // per-era chance a culture fractures (damped by cohesion)
  minSchismMembers: number;            // a culture needs at least this many living members to schism
  schismValueNudge: number;            // how strongly a daughter culture's values jump from the parent
  maxLineages: number;                 // cap on stored cultures / tongues / tribes; oldest dead branches prune
  initialTribes: number;               // founding tribes the town starts with (M14)
  // Language as a mechanic (M10 slice 4): tongues causally gate how readily company warms
  // into friendship, and agents learn each other's tongues through contact (D26).
  langLearnPerInteract: number;        // fluency gained in a neighbour's tongue per interaction (bounded growth toward 1)
  langSynergyFloor: number;            // sentiment-warmth multiplier for speakers with NO common tongue (1 = full when shared)
  // Live-model integration (M7.5; only used when an async provider is in play):
  aiConcurrency: number;               // max in-flight model calls
  aiTimeoutMs: number;                 // per-call timeout before falling back to the deterministic stub
}

export function ticksPerYear(cfg: SimConfig): number {
  return cfg.ticksPerDay * cfg.daysPerYear;
}

// World-gen quantities (biome seeds, flora/fauna caps, employer count) are tuned for
// the base 64×64 map; they scale with map AREA so a larger map gets proportionally
// more of each — identity at 64×64, so the default world is byte-unchanged (M8). Folk
// counts (initialPopulation, maxPopulation) are deliberately NOT scaled here; large
// populations wait for the LOD + uncap slices.
const BASE_GRID_AREA = 64 * 64;
export function areaScale(cfg: SimConfig): number {
  return (cfg.gridWidth * cfg.gridHeight) / BASE_GRID_AREA;
}
export function scaledBiomeSeeds(cfg: SimConfig): number {
  return Math.max(1, Math.round(cfg.biomeSeedCount * areaScale(cfg)));
}
export function scaledMaxFlora(cfg: SimConfig): number {
  return Math.round(cfg.maxFlora * areaScale(cfg));
}
export function scaledMaxFauna(cfg: SimConfig): number {
  return Math.round(cfg.maxFauna * areaScale(cfg));
}
export function scaledBusinessCount(cfg: SimConfig): number {
  return Math.max(1, Math.round(cfg.businessCount * areaScale(cfg)));
}
// Folk carrying capacity scales with the land (M8): a bigger map holds more people,
// rather than a flat magic number. Identity at 64×64. (A truly unbounded population
// awaits the economy/housing limits of M11–M12; this is the land-area carrying cap.)
export function scaledMaxPopulation(cfg: SimConfig): number {
  return Math.round(cfg.maxPopulation * areaScale(cfg));
}

export function ageInYears(ticksAlive: number, cfg: SimConfig): number {
  return ticksAlive / ticksPerYear(cfg);
}

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

// The display calendar derived from the tick count. The aging year (`ticksPerYear`)
// is subdivided cosmetically into 4 seasons and 12 months for a legible, resetting
// date — these labels are display-only and affect no simulation rate (rates use
// `ticksPerDay`). `year` matches an agent's age-in-years, so the date and ages agree.
export function calendarOf(tick: number, cfg: SimConfig): { year: number; season: string; month: number } {
  const tpy = ticksPerYear(cfg);
  const within = ((tick % tpy) + tpy) % tpy;
  return {
    year: Math.floor(tick / tpy),
    season: SEASON_NAMES[Math.min(3, Math.floor((within / tpy) * 4))],
    month: Math.min(12, Math.floor((within / tpy) * 12) + 1),
  };
}

// The seasonal abundance multiplier at a given tick (M19): how lush the land is this
// season, applied to plant growth (FloraSystem) and the foraged commons (the market).
// One source of truth so ecology and the food economy breathe together.
export function seasonGrowthFactor(tick: number, cfg: SimConfig): number {
  switch (calendarOf(tick, cfg).season) {
    case 'Spring': return cfg.seasonGrowthSpring;
    case 'Summer': return cfg.seasonGrowthSummer;
    case 'Autumn': return cfg.seasonGrowthAutumn;
    default:       return cfg.seasonGrowthWinter;   // Winter
  }
}

// Typed default tunables — the schema + fallback for the YAML loader (M9). The live
// authoritative config is `config/simulation.yaml` (loaded at startup, merged over
// these); these values are what it ships mirroring, and the fallback for any key it omits.
export const defaultConfig: SimConfig = {
  gridWidth: 64,
  gridHeight: 64,
  initialPopulation: 20,
  seed: 2,          // a town that happens to include one mage (magic is rare)
  ticksPerDay: 240,
  hungerDecayPerDay: 0.8,
  energyDecayPerDay: 0.7,
  funDecayPerDay: 0.3,             // slow burn — folk seek leisure every few days, not constantly
  actionThreshold: 0.4,
  sleepRestorePerTick: 0.008,
  funRestorePerTick: 0.02,         // leisure refreshes briskly, so breaks are short
  simSpeedTicksPerSecond: 6,   // gentle default; adjust live with the speed slider
  biomeSeedCount: 14,
  floraDensity: 0.06,
  faunaDensity: 0.012,
  resourceDensity: 0.01,
  maxFlora: 500,
  maxFauna: 120,            // area-scaled fauna carrying capacity (M8); predators thin + chase the herds
  faunaBreedChancePerDay: 0.6,  // grazers breed back fast, so bounded predation thins but never wipes them
  businessCount: 12,        // more employers so most working-age adults can find work (Economy Rebalance)
  dailyUpkeep: 3,
  subsistencePerDay: 2.5,   // just under upkeep: the jobless scrape by but stay poor (a real underclass)
  maxDebt: 40,              // bounded hardship, not a runaway spiral
  debtRecoveryPenalty: 0.4, // the indebted heal ~40% slower — debt finally has teeth
  wealthGoalMin: 30,
  wealthGoalMax: 110,
  businessStartBalance: 300,
  businessRevenueMargin: 0.25,
  homeCost: 40,             // affordable to most adults over time (a wealth sink that grows the town)
  rentPerDay: 1,            // modest: a landlord's spare home earns a little; a roof spares the mood penalty
  provisionBasePrice: 3,    // equals the old flat upkeep, so a balanced town sits near it
  provisionPriceMin: 1.5,
  provisionPriceMax: 8,     // a famine caps here — cost of living bites but debt stays bounded (≤ maxDebt)
  priceAdjustRate: 0.2,     // price drifts ~a fifth of the gap per day (a legible trend, not a jump)
  provisionPerAdult: 1,
  provisionPerFarmer: 2,
  baseForagedProvisions: 18, // tuned so a typical farmer count sits supply ≈ demand near the base price
  marketHistoryLength: 60,
  farmOperatingCostPerDay: 10, // a farm needs real sales above this + wages to survive
  bankruptcyThreshold: 10,     // basically broke
  bankruptcyGraceDays: 14,     // a couple of weeks of losses before folding
  maxFarms: 8,                 // founding never exceeds this many food businesses
  predatorAggressionChance: 0.012, // rare — an adjacent predator seldom actually strikes
  combatScarThreshold: 0.3,        // only a deep wound leaves a lasting scar
  maimGrievousHealth: 0.4,         // beaten below 40% Health and living — a grave wounding that can cripple
  maimChance: 0.35,                // about a third of those who survive so grievous a wound are left maimed
  scarDisabilityChance: 0.0016,    // an old wound rarely catches up with a veteran on any given day — but over a violent life it tells
  combatKillBlow: 0.18,            // a solid counter-blow drives off / slays the beast
  crimeChancePerDay: 0.03,         // most folk are honest; the wicked/desperate offend now and then
  crimeAlignmentThreshold: 0.05,   // below this on the good axis → capable of violence
  theftAmount: 6,
  warChancePerEra: 0.5,            // martial tribes are quarrelsome, but wars are gated by martiality + size
  warMartialThreshold: 0.55,       // an above-average-martial tribe can start a war
  minWarMembers: 5,
  warDurationEras: 2,              // wars are short, bloody feuds, then peace
  captiveFraction: 0.25,           // a quarter of a broken clan's folk are taken into the victor's — the spoils of conquest
  battleChancePerTick: 0.006,      // adjacent enemies seldom actually clash on a given tick (keeps casualties bounded)
  caravanIntervalDays: 2,          // caravan trade is reckoned every couple of days
  caravanProfit: 4,                // a modest gain — a living trade route, not a gold fountain
  caravanMaxDistance: 44,          // most of a 64-wide map: distant clans can still reach one another overland
  caravanChancePerInterval: 0.4,   // a friendly pair runs a caravan ~⅖ of intervals (paced, so the feed isn't spammy)
  reputationCrimeHit: 0.08,        // a cross-clan crime sours the clans' standing this much
  wanderIdleChance: 0.6,           // a wanderer pauses ~60% of ticks → folk linger rather than pacing endlessly
  researchBasePerDay: 2,           // tuned so tribes reach ~Industrial Age over a soak, sci-fi over deep time
  researchPerMemberPerDay: 1.0,
  religionSchismChancePerEra: 0.4, // faiths fracture into sects now and then over deep time
  minFaithFollowers: 8,
  conversionChancePerDay: 0.05,    // faith spreads by contact — a devout neighbour wins the odd convert
  holyDayIntervalDays: 24,         // a faith's holy day comes ~5×/sim-year; phased per faith so they don't all fall together
  holyDayMoodLift: 0.07,           // small & bounded — devotion gladdens, but the Storyteller still owns the drama band
  healerHousePerPop: 0.035,        // ~1 healer's house per ~30 folk (pop 60 → 2 houses); care scales with people, not map area
  healerCarePerWorker: 0.12,       // each working healer makes the infirmary's cures surer (capped at +0.6, like a strong medicine tech)
  goodsPriceMinMult: 0.45,         // a glutted good still fetches ~half its worth (a floor on crafter income)
  goodsPriceMaxMult: 2.2,          // a scarce good fetches up to ~2.2× — dear, but bounded
  goodsPriceAdjustRate: 0.3,       // prices drift toward the target rather than snapping
  goodsSupplyEmaRate: 0.1,         // a ~10-day memory: the price self-centres on the base value, only deviations move it
  seasonGrowthSpring: 1.3,         // the lush season — plants surge, foraging is easy
  seasonGrowthSummer: 1.2,
  seasonGrowthAutumn: 0.9,
  seasonGrowthWinter: 0.6,         // the lean season — growth stalls, food gets dear (avg of the four ≈ 1.0)
  magicManaMax: 100,
  manaRegenPerDay: 10,
  daysPerYear: 4,
  adultAgeYears: 16,
  initialAgeMinYears: 16,
  initialAgeMaxYears: 55,
  socialDecayPerDay: 0.4,
  socialGainPerInteract: 0.05,
  sentimentGainPerInteract: 0.02,
  friendSentiment: 0.4,
  marrySentiment: 0.5,
  marryChancePerDay: 0.5,
  illnessChancePerDay: 0.03,
  illnessHealthLoss: 0.4,
  chronicIllnessChance: 0.3,      // ~⅓ of an old soul's bouts of sickness linger as a chronic ailment
  infirmaryCareRadius: 18,        // healers tend the afflicted across the settlement, not just inside the walls
  healthRecoveryPerDay: 0.25,
  baseMortalityPerDay: 0.0003,
  ageMortalityScale: 0.5,
  sickMortalityPerDay: 0.01,
  maxPopulation: 60,
  birthChancePerDay: 0.4,
  reproCooldownDays: 4,
  fertilityMaxAgeYears: 50,
  reproMinHunger: 0.5,
  reproMinHealth: 0.5,
  childMageAptitudeChance: 0.25,  // heritable but diluting — magic stays uncommon
  gatherPerDay: 0.3,
  inventoryMaxPerItem: 20,         // a worker carries up to ~20 units of any one material
  materialYield: 12,               // a day on a node banks ~enough to keep a crafter working
  workingMemorySize: 30,
  reflectionIntervalDays: 30,
  maxReflectionsPerTick: 2,
  minMemoriesToReflect: 3,
  reflectMemories: 5,
  maxBeliefs: 6,
  expressionIntervalDays: 6,      // a given agent speaks/dreams/resolves rarely
  maxExpressionsPerTick: 2,       // ...and the town as a whole, at most twice a tick
  maxUtterances: 8,
  decisionImportance: 0.65,       // weddings (0.7), births (0.85), bereavement (0.9) — not mundane work/illness
  memoryRollupIntervalDays: 2,    // tidy the memory thread every couple of sim-days
  memoryRetainAfterRollup: 20,    // ...keeping the 20 most-recent raw events sharp
  summaryImportanceThreshold: 0.6, // births/weddings/bereavement stay named; work/wandering dissolve
  maxSummaries: 6,                // a handful of episodic digests; older ones merge to coarser eras
  chronicleImportanceThreshold: 0.6, // births/weddings/deaths qualify as legends; lesser stuff doesn't
  chronicleRecentCap: 40,         // keep the last ~40 legends sharp before compressing
  chronicleRetainAfterRollup: 24,
  chronicleLegendImportance: 0.85, // the founding cataclysm (1.0) survives compression by name
  chronicleMaxEras: 8,            // a handful of compressed ages; older ones merge
  statsSampleIntervalDays: 4,     // sample world-health once a sim-year (daysPerYear)
  maxStatSamples: 80,             // ~80 years of time-series, then the oldest rolls off
  evolutionIntervalDays: 20,      // an era ≈ 5 sim-years (daysPerYear×5); several eras over a soak
  valueDriftPerEra: 0.05,         // gentle value drift; cohesion damps it further
  storytellerTemperament: 'measured',  // the paced default keel (Cassandra-like); the menu offers calm/harsh/capricious
  schismChancePerEra: 0.7,        // ×(1−cohesion); self-limited by minSchismMembers → ~1–2 over a deep run (M7 DoD)
  minSchismMembers: 8,            // small cultures don't fracture
  schismValueNudge: 0.2,          // the daughter starts noticeably apart from the parent
  maxLineages: 24,                // a handful of living lineages + their ancestry; dead branches prune
  initialTribes: 3,               // the town starts as a few founding tribes (M14)
  langLearnPerInteract: 0.002,    // ~a few days of contact to grow fluent in a neighbour's tongue (gradual)
  langSynergyFloor: 0.4,          // strangers with no shared tongue still bond, at 40% rate, until they learn one
  aiConcurrency: 2,               // at most 2 live model calls in flight
  aiTimeoutMs: 8000,              // fall back to the stub after 8s so a slow model never stalls
};
