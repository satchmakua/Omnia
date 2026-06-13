export const C_POSITION  = 'Position';
export const C_NEEDS     = 'Needs';
export const C_WALLET    = 'Wallet';
export const C_AGENT     = 'Agent';     // brain tier: sapient (full)
export const C_SPECIES   = 'Species';
export const C_FLORA     = 'Flora';     // brain tier: none (rule-driven)
export const C_FAUNA     = 'Fauna';     // brain tier: instinct-only (no LLM)
export const C_RESOURCE  = 'Resource';  // brain tier: none (rule-driven)
export const C_CLOCK     = 'Clock';
export const C_TILEMAP   = 'TileMap';   // singleton: the terrain grid (src/world/tilemap.ts)
export const C_CHRONICLE = 'Chronicle'; // singleton: world legend log (src/history/chronicle.ts)

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

// Flora (plants/fungi). No brain — the FloraSystem grows/spreads them by rule.
// Behavioural facts are baked in at spawn (like SpeciesComp) so the hot systems
// and renderer don't need the content registry.
export interface Flora {
  speciesId: string;
  name: string;
  color: string;
  maturity: number;      // 0..1; foragable once >= edibleAt
  growthPerTick: number;
  edibleAt: number;
  foodYield: number;     // hunger restored when foraged at full maturity
  spreadChancePerTick: number;
}

// Fauna (animals). Instinct-only brain (FaunaSystem); never an LLM.
export interface Fauna {
  speciesId: string;
  name: string;
  color: string;
  size: 'small' | 'medium' | 'large';
  hunger: number;        // 0..1
  hungerDecayPerTick: number;
  breedThreshold: number;
  breedCooldownTicks: number;  // counts down to 0, then breeding is allowed again
  ticksAlive: number;
}

// Resource node. No brain — the ResourceSystem regrows renewables by rule.
export interface Resource {
  typeId: string;
  name: string;
  color: string;
  amount: number;        // 0..1
  renewable: boolean;
  regenPerTick: number;
}

export interface Clock {
  tick: number;
  day: number;
  hour: number;   // 0..23 within the current day
  isDay: boolean;
}
