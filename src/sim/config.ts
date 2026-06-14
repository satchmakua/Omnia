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
}

// Mirrors config/simulation.yaml; the YAML loader wires this in a later milestone.
export const defaultConfig: SimConfig = {
  gridWidth: 64,
  gridHeight: 64,
  initialPopulation: 20,
  seed: 1,
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
};
