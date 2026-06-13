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
};
