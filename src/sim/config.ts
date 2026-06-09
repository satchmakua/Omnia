export interface SimConfig {
  gridWidth: number;
  gridHeight: number;
  initialPopulation: number;
  seed: number;
  ticksPerDay: number;
  hungerDecayPerDay: number;
  energyDecayPerDay: number;
  actionThreshold: number;
  foodSourceCount: number;
  foodRegenPerTick: number;
  sleepRestorePerTick: number;
}

// Mirrors config/simulation.yaml; the YAML loader wires this in M1.
export const defaultConfig: SimConfig = {
  gridWidth: 64,
  gridHeight: 64,
  initialPopulation: 20,
  seed: 1,
  ticksPerDay: 240,
  hungerDecayPerDay: 0.8,
  energyDecayPerDay: 0.7,
  actionThreshold: 0.4,
  foodSourceCount: 25,
  foodRegenPerTick: 0.005,
  sleepRestorePerTick: 0.008,
};
