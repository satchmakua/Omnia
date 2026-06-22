export interface SimConfig {
  gridWidth: number;
  gridHeight: number;
  initialPopulation: number;
  seed: number;
  ticksPerDay: number;
  hungerDecayPerDay: number;
  energyDecayPerDay: number;
  actionThreshold: number;
  sleepRestorePerTick: number;
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
  dailyUpkeep: number;       // cost of living deducted from each agent per day
  wealthGoalMin: number;     // agents roll a personal gold target in [min, max];
  wealthGoalMax: number;     //   they work while below it, so wealth stays bounded
  businessStartBalance: number;        // employer starting funds
  businessRevenueMargin: number;       // revenue per worker = wage × (1 + margin)
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
  // Schism / divergence (M7 slice 4):
  schismChancePerEra: number;          // per-era chance a culture fractures (damped by cohesion)
  minSchismMembers: number;            // a culture needs at least this many living members to schism
  schismValueNudge: number;            // how strongly a daughter culture's values jump from the parent
  maxLineages: number;                 // cap on stored cultures / tongues; oldest dead branches prune (slice 5)
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

// Authoritative simulation config. docs/simulation.yaml mirrors these as readable
// reference but is NOT loaded yet — wiring a YAML config loader is on the roadmap.
export const defaultConfig: SimConfig = {
  gridWidth: 64,
  gridHeight: 64,
  initialPopulation: 20,
  seed: 2,          // a town that happens to include one mage (magic is rare)
  ticksPerDay: 240,
  hungerDecayPerDay: 0.8,
  energyDecayPerDay: 0.7,
  actionThreshold: 0.4,
  sleepRestorePerTick: 0.008,
  simSpeedTicksPerSecond: 6,   // gentle default; adjust live with the speed slider
  biomeSeedCount: 14,
  floraDensity: 0.06,
  faunaDensity: 0.012,
  resourceDensity: 0.01,
  maxFlora: 500,
  maxFauna: 120,            // area-scaled fauna carrying capacity (M8); predators thin + chase the herds
  faunaBreedChancePerDay: 0.6,  // grazers breed back fast, so bounded predation thins but never wipes them
  businessCount: 8,
  dailyUpkeep: 3,
  wealthGoalMin: 30,
  wealthGoalMax: 110,
  businessStartBalance: 300,
  businessRevenueMargin: 0.25,
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
  schismChancePerEra: 0.7,        // ×(1−cohesion); self-limited by minSchismMembers → ~1–2 over a deep run (M7 DoD)
  minSchismMembers: 8,            // small cultures don't fracture
  schismValueNudge: 0.2,          // the daughter starts noticeably apart from the parent
  maxLineages: 24,                // a handful of living lineages + their ancestry; dead branches prune
  aiConcurrency: 2,               // at most 2 live model calls in flight
  aiTimeoutMs: 8000,              // fall back to the stub after 8s so a slow model never stalls
};
