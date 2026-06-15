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
  workingMemorySize: number;           // raw memories kept per agent before rollup
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
}

export function ticksPerYear(cfg: SimConfig): number {
  return cfg.ticksPerDay * cfg.daysPerYear;
}

export function ageInYears(ticksAlive: number, cfg: SimConfig): number {
  return ticksAlive / ticksPerYear(cfg);
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
  faunaDensity: 0.006,
  resourceDensity: 0.01,
  maxFlora: 500,
  maxFauna: 150,
  faunaBreedChancePerDay: 0.5,
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
};
