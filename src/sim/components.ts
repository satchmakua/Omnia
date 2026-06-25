export const C_POSITION  = 'Position';
export const C_NEEDS     = 'Needs';
export const C_WALLET    = 'Wallet';
export const C_AGENT     = 'Agent';     // brain tier: sapient (full)
export const C_SPECIES   = 'Species';
export const C_MAGIC     = 'Magic';     // present only on the rare agents with magic aptitude
export const C_JOB       = 'Job';       // an agent's current occupation
export const C_BUSINESS  = 'Business';  // an employer / organization entity
export const C_HOME      = 'Home';      // a dwelling an agent built and owns (M11)
export const C_CIVIC     = 'Civic';     // a shared civic building — hall / well / shrine (M11 slice 3)
export const C_FLORA     = 'Flora';     // brain tier: none (rule-driven)
export const C_FAUNA     = 'Fauna';     // brain tier: instinct-only (no LLM)
export const C_RESOURCE  = 'Resource';  // brain tier: none (rule-driven)
export const C_HEALTH        = 'Health';        // condition + mortality (M4)
export const C_RELATIONSHIPS = 'Relationships'; // social graph edges (M4)
export const C_LINEAGE       = 'Lineage';       // partner / parents / children (M4)
export const C_TOMBSTONE     = 'Tombstone';     // a dead agent's compact record (M4)
export const C_MEMORY        = 'Memory';        // memory stream + beliefs (M5)
export const C_BODY          = 'Body';          // ability scores + heritable physical traits (M13)
export const C_ALIGNMENT     = 'Alignment';     // dynamic 9-alignment (good/law axes) (M13)
export const C_PERSONALITY   = 'Personality';   // an archetype trait, heritable + trauma-shifted (M13)
export const C_AIRECORD      = 'AIRecord';      // singleton: recorded LLM responses for replay (M5)
export const C_AIRUNNER      = 'AIRunner';      // singleton: async live-model queue + pending jobs (M7.5)
export const C_CLOCK     = 'Clock';
export const C_TILEMAP   = 'TileMap';   // singleton: the terrain grid (src/world/tilemap.ts)
export const C_CHRONICLE = 'Chronicle'; // singleton: world legend log (src/history/chronicle.ts)
export const C_EVENTLOG  = 'EventLog';  // singleton: live activity feed (src/history/eventlog.ts)
export const C_WORLDSTATS = 'WorldStats'; // singleton: statistical strata (src/history/stats.ts)
export const C_CULTURESTORE = 'CultureStore'; // singleton: live cultures (src/culture/cultureStore.ts)
export const C_LANGUAGESTORE = 'LanguageStore'; // singleton: live languages (src/lang/languageStore.ts)

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
  name: string;         // full display name, "Given Surname" (M7: language-derived)
  action: AgentAction;
  ticksAlive: number;   // also the agent's age, in ticks
  wealthGoal: number;   // gold level the agent works toward; bounds wealth, varies by agent
  sex: Sex;
  lifespanTicks: number; // rolled from species lifespan; mortality ramps as age nears it
  surname?: string;     // family name, inherited down a lineage (M7)
  cultureId?: string;   // the culture they belong to (M7); its values bias behaviour (D26)
                        // (their displayed tongue is derived live from this culture's language)
  fluency?: Record<string, number>;  // languageId → 0..1 command of each tongue (M10 slice 4).
                        // Natively fluent (1) in their culture's language; others are LEARNED
                        // through contact. Gates cross-tongue friendship warmth (D26). See src/lang/fluency.ts.
  mood?: number;        // 0..1 well-being / contentment (M11 slice 2). Drifts toward a target set
                        // by circumstance — a home, family, solvency, health lift it; debt,
                        // homelessness, illness lower it. Warms friendship (D26). See MoodSystem.
  rentsFrom?: number;   // EntityId of the landlord a homeless adult rents shelter from (M11 s2);
                        // a rented roof spares the homeless mood penalty. See RentSystem.
}

// Body & heredity (M13): six D&D-style ability scores (3..18) plus heritable physical
// traits. Founders roll these; children get the parental mean + a little variation (the one
// Heredity system, see src/sim/heredity.ts) — so traits visibly run in families. Eye/hair
// are 0..1 shades (dark↔light) mapped to colour names for display; build is slight↔stocky.
export interface Body {
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  heightCm: number;
  build: number;   // 0..1
  eye: number;     // 0..1 dark↔light
  hair: number;    // 0..1 dark↔light
}

// Dynamic 9-alignment (M13): two axes, each −1..+1, mapping to the classic grid (Lawful
// Good … Chaotic Evil). Baseline neutral-leaning-good; a heritable lean at birth, then it
// **shifts with the life lived** (bonds & resilience → good; loss & withdrawal → harder).
// `good` already biases cooperation (D26); the full evil→crime/violence expression is M16.
export interface Alignment {
  good: number;   // −1 evil … +1 good
  law: number;    // −1 chaotic … +1 lawful
}

// Personality (M13): one archetype trait that colours behaviour — `ambitious`/`greedy`
// strive harder, `content`/`generous` less; others (loyal, brave, curious, gentle…) are
// flavour now with homes in later milestones. Heritable (children often take after a
// parent) and shifted by mid-life trauma (deep loss → `hardened`). See src/sim/heredity.ts.
export interface Personality {
  trait: string;
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

// A dwelling an agent built and owns (M11). Homes are static (no brain) — they mark
// the town's growth and who has put down roots. `owner` points at an Agent (it may
// later resolve to a Tombstone); a home whose owner is no longer living falls to ruin.
export interface Home {
  owner: number;       // EntityId of the owning agent
  builtTick: number;   // when it was raised
}

// A shared civic building (M11 slice 3) — a town landmark folk hold in common (a hall,
// a well, a shrine). Static, no brain; a legible hook for later institutions (M14) and
// religion (M15). The town's third building kind alongside workplaces and homes.
export interface Civic {
  kind: string;   // 'hall' | 'well' | 'shrine'
  name: string;   // display name
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
  diet: 'grazer' | 'predator';  // grazers eat flora; predators hunt grazers (M8 slice 5)
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
  grave?: boolean;  // was this a *grave* illness? (gates the "survived" life event, M10 slice 3)
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

// The agent's inner life (M5). A bounded stream of salient memories plus the
// durable beliefs that reflection distils from them.
export interface MemoryEntry {
  tick: number;
  text: string;
  importance: number;  // 0..1; mundane low, life-changing high
}

export interface Belief {
  tick: number;
  text: string;
}

// A generated line of inner/outer life (M5 part 2): a spoken line ('say'), a dream
// ('dream'), or a resolution at a turning point ('decide'). Pure flavour — recorded
// for replay, never fed back into the simulation's mechanical trajectory.
export type UtteranceKind = 'say' | 'dream' | 'decide';
export interface Utterance {
  tick: number;
  kind: UtteranceKind;
  text: string;
}

// An episodic summary (M6, SIMULATION_MODEL Mechanism 1): a mid-term digest that
// older raw events are rolled up into on a schedule. High-importance events stay
// vivid (named in `text`); trivia dissolves into a count. The raw events are then
// discarded — so a long life stores a thread of summaries, not every day.
export interface EpisodicSummary {
  fromTick: number;
  toTick: number;
  text: string;
  importance: number;  // max importance folded in (keeps notable eras sharp through merges)
  count: number;       // raw events this digest stands for
}

export interface Memory {
  events: MemoryEntry[];          // working memory: recent raw events (high fidelity)
  summaries: EpisodicSummary[];   // mid-term: rolled-up digests of older events (bounded)
  beliefs: Belief[];              // long-term: durable reflections
  lastReflectTick: number;
  lastRollupTick: number;         // schedules the multi-resolution rollup pass
  utterances: Utterance[];   // recent dialogue / dreams / resolutions (bounded)
  lastSpokeTick: number;     // throttles dialogue + decisions for this agent
  lastDreamTick: number;     // throttles dreams for this agent
  // The CAUSAL distillate of the life so far (M10 slice 3, D26): a `purpose` drive in
  // ~[-0.4, 0.4] (positive = striving to provide/achieve, negative = grief/withdrawal)
  // computed procedurally from memories at reflection time, plus the `vow` it names.
  // The drive biases behaviour (ActionSystem); the LLM beliefs above stay pure flavour.
  purpose?: number;
  vow?: string;
}

// Singleton: every LLM response recorded so a replay reproduces a run exactly
// even though live generation varies (ARCHITECTURE determinism rule).
export interface AIRecordEntry { tick: number; key: number; response: string; }
export interface AIRecord { entries: AIRecordEntry[]; }

export interface Clock {
  tick: number;
  day: number;
  hour: number;   // 0..23 within the current day
  isDay: boolean;
}
