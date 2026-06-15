export const C_POSITION  = 'Position';
export const C_NEEDS     = 'Needs';
export const C_WALLET    = 'Wallet';
export const C_AGENT     = 'Agent';     // brain tier: sapient (full)
export const C_SPECIES   = 'Species';
export const C_MAGIC     = 'Magic';     // present only on the rare agents with magic aptitude
export const C_JOB       = 'Job';       // an agent's current occupation
export const C_BUSINESS  = 'Business';  // an employer / organization entity
export const C_FLORA     = 'Flora';     // brain tier: none (rule-driven)
export const C_FAUNA     = 'Fauna';     // brain tier: instinct-only (no LLM)
export const C_RESOURCE  = 'Resource';  // brain tier: none (rule-driven)
export const C_HEALTH        = 'Health';        // condition + mortality (M4)
export const C_RELATIONSHIPS = 'Relationships'; // social graph edges (M4)
export const C_LINEAGE       = 'Lineage';       // partner / parents / children (M4)
export const C_TOMBSTONE     = 'Tombstone';     // a dead agent's compact record (M4)
export const C_CLOCK     = 'Clock';
export const C_TILEMAP   = 'TileMap';   // singleton: the terrain grid (src/world/tilemap.ts)
export const C_CHRONICLE = 'Chronicle'; // singleton: world legend log (src/history/chronicle.ts)
export const C_EVENTLOG  = 'EventLog';  // singleton: live activity feed (src/history/eventlog.ts)

export interface Position {
  x: number;
  y: number;
}

export interface Needs {
  hunger: number;  // 0..1; 1 = full, 0 = starving
  energy: number;  // 0..1; 1 = rested, 0 = exhausted
  social: number;  // 0..1; 1 = content, 0 = lonely
}

export interface Wallet {
  gold: number;   // >= 0 always
  debt: number;   // >= 0; what the agent owes (no negative gold without a debt record)
}

export type AgentAction = 'wander' | 'seek_food' | 'sleep' | 'work' | 'socialize';

export type Sex = 'male' | 'female';

export interface Agent {
  name: string;
  action: AgentAction;
  ticksAlive: number;   // also the agent's age, in ticks
  wealthGoal: number;   // gold level the agent works toward; bounds wealth, varies by agent
  sex: Sex;
  lifespanTicks: number; // rolled from species lifespan; mortality ramps as age nears it
}

// Innate magic aptitude — present on only the rare agents who rolled it at birth
// (so the LLM/capability systems can find casters cheaply, and most folk simply
// lack this component). Holds the agent's mana pool.
export interface Magic {
  mana: number;
  maxMana: number;
  manaRegenPerTick: number;
}

// An agent's occupation. `employer` points at a Business entity; `wagePerTick`
// is baked from the profession's daily wage so the EconomySystem needs no registry.
export interface Job {
  professionId: string;
  professionName: string;
  employer: number;     // EntityId of the Business
  wagePerTick: number;
  gathers: string | null;  // resource id this job harvests from nodes, or null
}

// An employer/organization entity (D-roadmap "businesses as org entities").
export interface Business {
  professionId: string;
  professionName: string;
  color: string;
  balance: number;        // pays wages from here; revenue replenishes it
  maxEmployees: number;
  wagePerTick: number;
  revenuePerWorkerPerTick: number;
  requiresAptitude: boolean;  // magical employers hire only agents with magic aptitude
  gathers: string | null;     // resource id employees harvest from nodes, or null
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

// Physical condition + mortality inputs (M4). Death is driven by age and health.
export interface Health {
  value: number;  // 0..1; low health raises mortality
  ill: boolean;
}

export type RelationType = 'friend' | 'rival' | 'partner';

export interface RelationEdge {
  type: RelationType;
  sentiment: number;  // -1..1
}

// An agent's social graph: a small map of other agents → how they feel about them.
export interface Relationships {
  edges: Record<number, RelationEdge>;  // keyed by EntityId
}

// Family ties (D-roadmap "Lineage"). partner is the spouse; parents/children are
// EntityIds that may point at living agents or at Tombstones (the dead persist as
// referenceable records).
export interface Lineage {
  partner: number | null;
  parents: number[];
  children: number[];
  reproCooldownTicks: number;  // a mother's recovery period between births (0 = ready)
}

// A dead agent's compact record (SIMULATION_MODEL Mechanism 5). The agent's heavy
// components are stripped on death and replaced by this; the entity id stays valid
// so lineage pointers keep resolving ("your grandmother who founded the guild").
export interface Tombstone {
  name: string;
  speciesName: string;
  sex: Sex;
  bornTick: number;
  diedTick: number;
  ageYears: number;
  role: string | null;     // last profession, if any
  cause: string;           // 'old age' | 'illness' | 'misfortune'
  legacy: string;          // one-line summary
  partner: number | null;
  parents: number[];
  children: number[];
}

export interface Clock {
  tick: number;
  day: number;
  hour: number;   // 0..23 within the current day
  isDay: boolean;
}
