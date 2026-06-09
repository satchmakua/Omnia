export const C_POSITION = 'Position';
export const C_NEEDS    = 'Needs';
export const C_WALLET   = 'Wallet';
export const C_AGENT    = 'Agent';
export const C_SPECIES  = 'Species';
export const C_FOOD     = 'Food';
export const C_CLOCK    = 'Clock';

export interface Position {
  x: number;
  y: number;
}

export interface Needs {
  hunger: number;  // 0..1; 1 = full, 0 = starving
  energy: number;  // 0..1; 1 = rested, 0 = exhausted
}

export interface Wallet {
  gold: number;
}

export type AgentAction = 'wander' | 'seek_food' | 'sleep';

export interface Agent {
  name: string;
  action: AgentAction;
  ticksAlive: number;
}

// Resolved, per-agent species facts baked in at spawn so hot systems don't
// need the content registry every tick. Sourced from a Species archetype.
export interface SpeciesComp {
  id: string;          // e.g. "human", "dwarf"
  name: string;        // display name, e.g. "Human"
  color: string;       // #rrggbb, for the renderer
  size: 'small' | 'medium' | 'large';
  hungerMult: number;  // multiplier on base hunger decay
  energyMult: number;  // multiplier on base energy decay
}

export interface Food {
  amount: number;       // 0..1
  regenPerTick: number;
}

export interface Clock {
  tick: number;
  day: number;
  hour: number;   // 0..23 within the current day
  isDay: boolean;
}
