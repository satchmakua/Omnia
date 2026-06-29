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
export const C_COMBAT        = 'Combat';        // combat record: scars + kills (attached on first fight) (M16)
export const C_CRIME         = 'Crime';         // rap sheet: thefts + assaults + murders (attached on first crime) (M16)
export const C_INVENTORY     = 'Inventory';     // carried materials & goods (attached on first gather) (M23)
export const C_CRAFTING      = 'Crafting';      // a crafter's accumulated skill (attached on first craft) (M23)
export const C_AFFLICTIONS   = 'Afflictions';   // specific injuries / chronic conditions a body carries (M30)
export const C_EQUIPMENT     = 'Equipment';     // denormalised best carried weapon/armour bonus, for combat (M23 s3)
export const C_AIRECORD      = 'AIRecord';      // singleton: recorded LLM responses for replay (M5)
export const C_AIRUNNER      = 'AIRunner';      // singleton: async live-model queue + pending jobs (M7.5)
export const C_INTERVENTIONS = 'Interventions'; // singleton: recorded god-mode player acts, for deterministic replay (M27)
export const C_CLOCK     = 'Clock';
export const C_TILEMAP   = 'TileMap';   // singleton: the terrain grid (src/world/tilemap.ts)
export const C_CHRONICLE = 'Chronicle'; // singleton: world legend log (src/history/chronicle.ts)
export const C_EVENTLOG  = 'EventLog';  // singleton: live activity feed (src/history/eventlog.ts)
export const C_CONVOLOG  = 'ConvoLog';  // singleton: recent back-and-forth conversations (src/history/conversation.ts)
export const C_WORLDSTATS = 'WorldStats'; // singleton: statistical strata (src/history/stats.ts)
export const C_CULTURESTORE = 'CultureStore'; // singleton: live cultures (src/culture/cultureStore.ts)
export const C_ORGSTORE   = 'OrgStore';   // singleton: live organizations / tribes (src/org/orgStore.ts) (M14)
export const C_LANGUAGESTORE = 'LanguageStore'; // singleton: live languages (src/lang/languageStore.ts)
export const C_RELIGIONSTORE = 'ReligionStore'; // singleton: live religions / faiths (src/religion/religionStore.ts) (M18)
export const C_MARKET     = 'Market';     // singleton: the staple-goods market — price floats with supply/demand (M15)
export const C_ACHIEVEMENTS = 'Achievements'; // singleton: civ + agent milestones that have fired (M17 s4)
export const C_FIGURES      = 'Figures';      // singleton: historical figures enshrined by their deeds (M20)
export const C_ARTIFACTS    = 'Artifacts';    // singleton: named legendary items with histories (M20 s2)
export const C_RUIN         = 'Ruin';         // a discoverable site of the past — a fallen clan / lost relic (M20 s2b)
export const C_QUEST        = 'Quest';        // a procedural goal an agent has taken up (M20 s3)
export const C_WONDERS      = 'Wonders';      // singleton: town-scale mega-project progress (M20 s3b)
export const C_WONDERSITE   = 'WonderSite';   // a completed wonder, a landmark on the map (M20 s3b)
export const C_SPECIAL      = 'Special';      // a special agent — a monster / uncanny visitor that roams the map (M21)
export const C_FISH         = 'Fish';         // aquatic life — swims in water tiles, breeds, fished for food (M24)
export const C_VOYAGE       = 'Voyage';       // a seafaring merchant on a trade voyage to an overseas settlement (M25 s3)
export const C_WARD         = 'Ward';         // a protective enchantment on a folk — temporary combat soak (M26 s2)
export const C_CURSE        = 'Curse';        // a debilitating hex on a foe — temporary combat weakening (M26 s2)
export const C_ENCHANTMENT  = 'Enchantment';  // a lasting magic imbued into a folk's equipped gear — a magic item (M26 s3)

export interface Position {
  x: number;
  y: number;
}

export interface Needs {
  hunger: number;  // 0..1; 1 = full, 0 = starving
  energy: number;  // 0..1; 1 = rested, 0 = exhausted
  social: number;  // 0..1; 1 = content, 0 = lonely
  fun?: number;    // 0..1; 1 = entertained, 0 = restless/bored (M28). Optional: absent reads as full,
                   // so pre-M28 saves & test fixtures behave unchanged; spawnAgent seeds it for live folk.
}

export interface Wallet {
  gold: number;   // >= 0 always
  debt: number;   // >= 0; what the agent owes (no negative gold without a debt record)
}

// Carried materials & goods (M23): an id → quantity bag. Gatherers fill it with raw
// materials (timber/ore/crystal); crafters consume materials into goods (M23 slice 2).
// Bounded per item by `inventoryMaxPerItem`, so it stays tenable. See src/sim/inventory.ts.
export interface Inventory {
  items: Record<string, number>;
}

// A crafter's skill (M23 slice 2): grows by practice (learn-by-doing), gating the recipes
// they can attempt. Lazy — attached the first time an agent crafts. See CraftSystem.
export interface Crafting {
  skill: number;
}

// Denormalised equipment bonus (M23 slice 3): the power of the best weapon & armour an agent
// carries, recomputed daily (EquipSystem) from their inventory + the goods content, so the
// hot combat path reads cheap numbers (like a tribe's `arms`). Carrying = wielding.
export interface Equipment {
  weapon: number;   // best carried weapon power → attack
  armour: number;   // best carried armour power → soak
}

export type AgentAction = 'wander' | 'seek_food' | 'sleep' | 'work' | 'socialize' | 'relax';

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
  orgId?: string;       // the tribe/faction this agent belongs to (M14); inherited from the mother.
  religionId?: string;  // the faith this agent follows (M18); inherited from the mother.
  standing?: number;    // 0..1 social standing / reputation (M14 thread): esteem in the community,
                        // derived daily from deeds & means — leadership, landholding, valour, and
                        // wealth lift it; crime and debt sink it. Drives social class + warms how
                        // readily others seek one's company (D26). See StatusSystem / society.ts.
  mentalState?: MentalState;  // a RimWorld-style break when mood bottoms out / peaks (M28 s2): despair
                        // → withdraws, anger → lashes out, elation → celebrates. Overrides ordinary
                        // behaviour (but never survival) while it lasts. See MentalStateSystem.
  mentalUntil?: number; // the tick the current mental state passes (then it clears with a little catharsis).
}

// A procedural mental break (M28 s2), triggered by mood reaching an extreme. Deterministic, never
// the LLM. Despair/anger come from misery (split by disposition); elation from joy.
export type MentalState = 'despair' | 'anger' | 'elation';

// A social structure — a tribe/faction (M14, D33). Like cultures, organizations are a few
// shared objects agents reference by `orgId`, kept in a singleton store; they hold a leader,
// values (→ a government), a hue-spaced colour (never red), and descend/schism over the eras.
export interface Organization {
  id: string;
  name: string;          // language-derived (a coined word from the founders' tongue), e.g. "Rkkharur clan"
  surname: string;       // the bare clan word — members carry it as their SURNAME (M20: clan = kin-line). So
                         //   "House Rkkharur" and "Rkkharur clan" are one thing; a clan is both bloodline and faction.
  color: string;         // an hsl() string — hue-spaced around the wheel, never red
  government: string;    // derived from the values (chiefdom / council / theocracy / gerontocracy)
  values: { communal: number; martial: number; traditional: number; open: number };
  leader: number | null; // EntityId of the current head
  cohesion: number;      // resistance to schism (0..1)
  founded: number;       // tick it formed
  parent?: string;       // the tribe it split from (schism descent)
  extinct?: boolean;     // no living members — a fallen tribe, kept for the family tree
  diedTick?: number;
  ruined?: boolean;      // a ruin has been placed for this fallen clan (M20 s2b) — so it's placed once
  research?: number;     // accumulated research points toward the next tech (M17)
  techs?: string[];      // tech ids this tribe has unlocked, in discovery order (M17)
  tier?: number;         // highest tech tier reached (1 tribal … 7 sci-fi) — denormalized for display (M17)
  effects?: Record<string, number>;  // tech effect tags → how many unlocked (e.g. arms 3, medicine 1) — confers tribe-wide bonuses (M17 s2)
  overseas?: boolean;    // an island settlement across the sea (M24 s4) — isolated until contact
  discovered?: boolean;  // first contact with the rest of the world has been made (M24 s4)
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

// Personality (M13; multi-trait M28 s3): a small SET of archetype traits that colour behaviour.
// `trait` is the DOMINANT one (drives the wealth-goal & crime couplings); `traits` is the full
// 2–3 set, whose members shape the newer reactions — friendship (who they befriend), mood (what
// lifts/sours it), and hardship (how readily they break). Heritable (children draw from their
// parents' pooled traits). Absent `traits` reads as just `[trait]`. See src/sim/heredity.ts.
export interface Personality {
  trait: string;
  traits?: string[];
}

// Combat record (M16) — attached the first time an agent fights, so the peaceful majority
// stay lean. Scars are permanent marks of survived violence; kills count foes slain. Either
// makes an agent a "veteran" (legible in the inspector); both harden a fighter's prowess.
export interface Combat {
  scars: number;
  kills: number;
}

// A rap sheet (M16 slice 2) — attached the first time an agent offends. Crime is driven by
// evil alignment (and desperation for theft); a record of it makes an agent an "outlaw"
// (legible) and a murderer notorious (a Chronicle legend).
export interface Crime {
  thefts: number;
  assaults: number;
  murders: number;
}

// Innate magic aptitude — present on only the rare agents who rolled it at birth
// (so the LLM/capability systems can find casters cheaply, and most folk simply
// lack this component). Holds the agent's mana pool.
export interface Magic {
  mana: number;
  maxMana: number;
  manaRegenPerTick: number;
  school?: string;    // the mage's discipline (elementalism / restoration / divination / conjuration) (M17 s3)
  mastery?: number;   // skill in that school (grows with practice; unlocks stronger spells)
}

// Battle magic (M26 s2): two short-lived enchantments read by the combat path (combat.ts).
// A **ward** (cast by an abjurer on an endangered ally) adds temporary armour-soak; a **curse**
// (cast by a maleficent mage on a marauding beast) saps its blows. Both carry an `expiresTick`;
// the MagicSystem sweeps expired ones each tick. Lazily attached only to enchanted entities.
export interface Ward {
  soak: number;        // bonus armour while warded (added to Equipment armour in combatantOf)
  expiresTick: number; // tick at which the ward fades
}
export interface Curse {
  weaken: number;      // 0..1 fraction by which the hexed foe's attacks are sapped
  expiresTick: number; // tick at which the hex lifts
}

// A magic item (M26 s3): a lasting enchantment an artificer-mage imbues into a folk's equipped
// weapon or armour — a permanent combat bonus read by the combat path, and named as a legendary
// magic artifact by the ArtifactSystem (ties M20 artifacts + M23 equipment).
export interface Enchantment {
  kind: 'weapon' | 'armour';  // which equipped item is enchanted
  bonus: number;              // power added to that item (only applies while the item is borne)
  school: string;             // the enchanter's discipline (for flavour/legend)
  by: string;                 // the enchanting mage's name
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
  producesFood?: boolean;     // a food producer (farm) — its workforce supplies the staple market (M15)
  fishery?: boolean;          // a coastal fishing house (M24) — its food is the fish it catches, not its headcount
  lowFundsDays?: number;      // consecutive days struggling — folds past the grace (M15 slice 2b)
}

// A faith the folk follow (M18) — mirrors the Organization model; agents reference one by
// `religionId`. Emerges from a culture's values, schisms into sects, and warms bonds among
// the faithful (D26).
export interface Religion {
  id: string;
  name: string;        // language-coined ("the Faith of …")
  deity: string;       // the god's coined name
  color: string;       // an hsl() string (violet-based, distinct from tribe colours)
  tenets: string[];    // a few practices/virtues (value-derived flavour)
  fervor: number;      // 0..1 devoutness — drives the bond bonus and drifts over the eras
  cohesion: number;    // resistance to schism
  founded: number;
  parent?: string;     // the faith it split from (schism descent)
  extinct?: boolean;
  diedTick?: number;
}

// A milestone the town has reached (M17 s4) — fires once, kept forever, shown in Legends.
export interface Achievement {
  id: string;
  name: string;
  tick: number;
  detail?: string;   // who/what earned it (a tribe or agent name)
}
export interface AchievementsData {
  unlocked: Achievement[];
}

// A historical figure (M20): a soul enshrined in memory for a notable deed — a slayer, a
// tyrant, an archmage, a venerable elder. Enshrined once while living and kept after death
// (resolve the living via the entity id; the dead via their Tombstone). Bounded.
export interface HistoricalFigure {
  id: number;            // the agent's entity id (alive ⇒ Agent; dead ⇒ Tombstone)
  name: string;
  epithet: string;       // "the Slayer", "the Cruel", "the Archmage", "the Elder", …
  basis: string;         // a short why ("slew 11 foes")
  bornTick: number;
  enshrinedTick: number;
}
export interface FiguresData {
  figures: HistoricalFigure[];
}

// A legendary artifact (M20 s2): a master smith's masterwork (a crafted weapon or armour),
// named and remembered with its forging history. Borne by its maker until death, then lost to
// history as a relic (discoverable by archaeology, later). Bounded; the oldest lost ones prune.
export interface Artifact {
  id: string;
  name: string;          // a coined name from the maker's tongue
  kind: 'weapon' | 'armour';
  power: number;
  bearer: number | null; // entity id of the current bearer, or null once lost
  forgedBy: string;      // the maker's name
  forgedTick: number;
  deeds: string;         // a one-line history ("a master smith's blade · 9 foes slain")
  lost?: boolean;
  lostTick?: number;
  ruined?: boolean;        // a cairn has been placed for this lost relic (M20 s2b) — placed once
  rediscoveredTick?: number; // a folk unearthed it again (archaeology)
  enchanted?: string;      // the enchanter's name if this is a magic item (M26 s3)
}
export interface ArtifactsData {
  artifacts: Artifact[];
}

// A ruin (M20 s2b): a static map site marking a vanished thing — the seat of a fallen clan, or
// a cairn where a relic was lost. Undiscovered until a wandering folk stumbles on it; then it
// enters the histories (and a relic-cairn yields its relic, rediscovered). Bounded; placed on a
// free tile. A pure marker — no behaviour, so it never perturbs the sim.
export interface Ruin {
  what: string;          // "the ruins of the Drass clan" / "a cairn where Robtu was lost"
  discovered: boolean;
  sinceTick: number;     // when the ruin appeared
  discoveredTick?: number;
  relicName?: string;    // the lost relic this cairn holds (rediscovered on discovery)
}

// A procedural quest (M20 s3): a goal a folk has taken up — to hunt a great beast, avenge a
// wrong, or seek out the old ruins. The quest is a narrative goal that the agent's own deeds
// fulfil (a kill, a ruin uncovered); fulfilment is a remembered turning point + a legend. Lazy,
// attached on assignment and removed on fulfilment / abandonment. See QuestSystem.
export interface Quest {
  kind: 'hunt' | 'avenge' | 'explore';
  text: string;          // the narrative ("hunt the great beasts that stalk the wilds")
  sinceTick: number;
  baseKills?: number;    // hunt/avenge: the agent's kill count when they vowed (fulfil when it rises)
  tx?: number;           // explore: the target ruin's tile
  ty?: number;
}

// A special agent (M21): a monster or uncanny visitor that roams the map for a while, then
// despawns. Unlike folk it has no Agent brain, job, needs, or lineage — it is Position + Health
// + Special. Two behaviours: a `predator` hunts the nearest folk and trades blows (a slain
// predator makes a hero of its killer + a legend); a `haunt` only unsettles the folk it drifts
// past (a mood dip + an eerie memory), drawing no blood. See SpecialAgentSystem.
export interface Special {
  kind: string;          // the monster's content id (e.g. "dragon", "vampire")
  name: string;          // display name ("a dragon")
  icon: string;          // which creature glyph to draw
  behavior: 'predator' | 'haunt' | 'guardian';  // guardian: a friendly summon that smites beasts (M26 s2b)
  aquatic?: boolean;     // a sea-beast (M24): lives in the water, menacing the coast
  owner?: number;        // a guardian's summoner (EntityId) — for the one-per-mage cap & flavour (M26 s2b)
  str: number;
  dex: number;
  con: number;
  ferocity: number;      // damage multiplier when it lands a blow
  spawnTick: number;     // when it appeared
  despawnTick: number;   // when it leaves of its own accord (if not slain first)
  lastHauntTick?: number; // haunt throttle — when it last unsettled the folk
}

// Town-scale mega-projects (M20 s3b). One wonder is built at a time, gated by tech, raised by
// the town's collective effort over years; completion places a `WonderSite` landmark + a
// monumental legend. A singleton store. See WonderSystem.
export interface WondersData {
  current?: string;                  // the wonder under construction (its content id)
  progress: Record<string, number>;  // wonder id → effort accumulated
  built: Record<string, number>;     // wonder id → tick it was completed
}
// A completed wonder standing on the map (a static landmark — no behaviour).
export interface WonderSite {
  wonderId: string;
  name: string;
  builtTick: number;
}

// The town's staple-goods market (M15): a single price that floats with supply (what the
// town's farms + foraging produce) and demand (the adult mouths to feed). The daily cost
// of living IS this price, so a lean year of farming makes provisions dear and a glut makes
// them cheap. A singleton, updated once a day; pure arithmetic, no RNG.
export interface Market {
  price: number;        // current price of a day's provisions, in gold
  supply: number;       // provisions produced per day (last computed)
  demand: number;       // provisions demanded per day (last computed)
  history: number[];    // bounded recent daily prices, for the chart
  fishCatch?: number;   // provisions from yesterday's fish catch (M24) — fed into supply; fish-limited
}

// A dwelling an agent built and owns (M11). Homes are static (no brain) — they mark
// the town's growth and who has put down roots. `owner` points at an Agent (it may
// later resolve to a Tombstone); a home whose owner is no longer living falls to ruin.
export interface Home {
  owner: number;       // EntityId of the owning agent
  builtTick: number;   // when it was raised
}

// A shared civic building (M11 slice 3; functions M21) — a town landmark folk hold in common.
// Some are mere landmarks (a hall, a well, a shrine); others carry a real **function** that
// radiates to the folk nearby — an infirmary heals, a tavern cheers, a watch-house keeps the
// peace. Content-driven (content/buildings/*.yaml); the CivicSystem applies the effects.
export interface Civic {
  kind: string;     // 'hall' | 'well' | 'shrine' | 'infirmary' | 'tavern' | 'watch'
  name: string;     // display name
  icon?: string;    // which glyph to draw (defaults to the civic hall icon)
  effect?: 'heal' | 'cheer' | 'ward' | 'trade' | 'hone';   // the function it radiates (absent = a plain landmark)
  radius?: number;  // how many tiles its presence reaches
  magnitude?: number; // strength of the effect (per day, or as a factor for 'ward')
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

// Aquatic life (M24): fish swim in water tiles, school, and breed up to a water-area cap.
// No brain (instinct, like fauna); the FishSystem moves & breeds them, and they are a food
// source the fishing economy (M24 s2) draws on. Entity = Position + Fish.
export interface Fish {
  breedCooldownTicks: number;  // counts down to 0, then it may spawn another fish
}

// A seafaring merchant on a trade voyage to an overseas settlement (M25 s3). While they carry
// this, the MovementSystem sails them toward (tx,ty); on arrival the VoyageSystem makes first
// contact + trades, then removes it so they resume their life on the mainland.
export interface Voyage {
  tx: number;
  ty: number;
  orgId: string;   // the overseas settlement being visited (for contact + trade)
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

// Specific afflictions (M30): discrete, **mechanically-real** injuries & conditions a body carries —
// not just a Health number. A maimed leg slows movement; a lost eye / maimed arm sap DEX / STR (so a
// veteran of many fights is a diminished combatant); the infirmity of age makes the old frail; a
// chronic illness lingers, slowing recovery. Injuries are permanent (until treated, M30 s2); the
// component is attached lazily on the first affliction. See src/sim/afflictions.ts for the effects.
export type AfflictionKind = 'maimed_leg' | 'lost_eye' | 'maimed_arm' | 'infirmity' | 'chronic_illness';
export interface Afflictions {
  list: { kind: AfflictionKind; sinceTick: number }[];
}

export type RelationType = 'friend' | 'rival' | 'partner';

export interface RelationEdge {
  type: RelationType;
  sentiment: number;  // -1..1 — the opinion (how warmly/coldly they regard the other)
  reason?: string;    // the headline "why" behind the opinion (M29 s1): "robbed them", "a long
                      // friendship", "murdered their son Korga", "vied for Mira's hand". Names are
                      // baked in, so it stays readable after the other party dies. Latest cause wins.
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
  cause: string;           // a bounded category: 'old age' | 'illness' | 'an accident' | 'starvation' | 'murdered' | 'fell in battle' | 'slain by a <beast>' | …
  slayer?: string;         // who/what killed them, when violent (for "killed by X" displays)
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

// Singleton: the player's god-mode interventions (M27). A divine act is just a recorded event in
// the deterministic log (D30/D54) — applied on a tick boundary by the InterventionSystem and
// replayed exactly from the log, so determinism holds and observe-only stays the default.
export interface Intervention {
  tick: number;          // the tick it applies on (recorded → replays exactly)
  kind: string;          // the power: smite / bless / bestow / … (content-ified in M27 s2)
  target: number | null; // the EntityId the act lands on (deterministic id), or null for world-wide
  amount?: number;       // optional magnitude (e.g. gold bestowed)
  applied?: boolean;     // fired once — snapshot-restored acts are already applied; a guard
}
export interface InterventionsData { log: Intervention[]; }

export interface Clock {
  tick: number;
  day: number;
  hour: number;   // 0..23 within the current day
  isDay: boolean;
}
