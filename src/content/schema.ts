// Schema-as-type: define the runtime validator once with Zod and derive the
// TypeScript type from it (CONTENT_AND_DATA Rule 1). `.strict()` makes unknown
// fields a hard error, so a typo like `siez:` fails loudly at load time.
import { z } from 'zod';

const Range = z.object({ min: z.number(), max: z.number() }).strict();

// ── Species ───────────────────────────────────────────────────────────────────
export const SpeciesSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lifespanYears: Range,                       // core data; used by aging in M4
  size: z.enum(['small', 'medium', 'large']),
  spawnWeight: z.number().positive().default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex colour'),
  tags: z.array(z.string()).default([]),
  needs: z.object({
    hunger: z.number().positive(),
    energy: z.number().positive(),
  }).strict(),
  magicAptitudeChance: z.number().min(0).max(1).default(0),  // reserved for M3
  language: z.string().min(1),   // id of the tongue this folk are named from (M7); resolved at spawn
  // Per-species ability-score modifiers (M13), applied on top of a rolled 3d6. Optional —
  // species without it are unmodified. e.g. a dwarf might be { con: 2, dex: -1 }.
  abilityMods: z.object({
    str: z.number(), dex: z.number(), con: z.number(), int: z.number(), wis: z.number(), cha: z.number(),
  }).partial().default({}),
}).strict();

export type Species = z.infer<typeof SpeciesSchema>;

// ── Capability ────────────────────────────────────────────────────────────────
// Every capability shares one shape: invoke → prerequisites → cost → effect
// (MAGIC_AND_TECHNOLOGY.md). Traditions differ only in their gates and costs:
// technology is common (no aptitude); magic requires innate aptitude and mana.
export const CapabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tradition: z.enum(['technology', 'magic']),
  prerequisites: z.object({
    aptitude: z.boolean().default(false),   // magic: only agents with innate aptitude
  }).strict().default({}),
  cost: z.object({
    mana: z.number().min(0).default(0),      // magic cost
    energy: z.number().min(0).default(0),    // physical exertion
  }).strict().default({}),
  effects: z.array(z.string()).min(1),       // effect tags; code must implement each
  power: z.number().default(0),
}).strict();

export type Capability = z.infer<typeof CapabilitySchema>;

// ── Flora ─────────────────────────────────────────────────────────────────────
// Plants/fungi: grow toward maturity, optionally spread, foraged for food.
export const FloraSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex colour'),
  growthPerDay: z.number().positive(),     // maturity gained per in-sim day
  edibleAt: z.number().min(0).max(1).default(0.5),  // maturity needed to forage
  foodYield: z.number().positive(),        // hunger restored when foraged ripe
  spreadChancePerDay: z.number().min(0).max(1).default(0),  // chance to seed a neighbour
}).strict();

export type Flora = z.infer<typeof FloraSchema>;

// ── Fauna ─────────────────────────────────────────────────────────────────────
// Instinct-only light agents (no LLM, ever). Graze flora, breed, starve.
export const FaunaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex colour'),
  size: z.enum(['small', 'medium', 'large']),
  diet: z.enum(['grazer', 'predator']).default('grazer'),  // grazers eat flora; predators hunt grazers
  hungerDecayPerDay: z.number().positive(),
  breedThreshold: z.number().min(0).max(1).default(0.7),  // hunger above which it may breed
  breedCooldownDays: z.number().min(0).default(1),
}).strict();

export type Fauna = z.infer<typeof FaunaSchema>;

// ── Resource ──────────────────────────────────────────────────────────────────
// Extractable world nodes (timber, ore, ...). Renewable ones regrow; finite
// ones deplete permanently. Extraction itself arrives with the economy (M3).
export const ResourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex colour'),
  renewable: z.boolean().default(true),
  regenPerDay: z.number().min(0).default(0),  // only meaningful when renewable
}).strict();

export type Resource = z.infer<typeof ResourceSchema>;

// ── Profession ────────────────────────────────────────────────────────────────
// A job an agent can hold. Businesses are spawned per profession; agents earn the
// profession's wage while working. (Skill/aptitude gating arrives with the
// Capability system, M3 part 2.)
export const ProfessionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dailyWage: z.number().positive(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex colour'),
  maxEmployeesPerBusiness: z.number().int().positive().default(4),
  requiresAptitude: z.boolean().default(false),  // magical professions hire only the aptitude-gifted
  gathers: z.string().optional(),                // resource id this profession harvests (e.g. "ore")
  producesFood: z.boolean().default(false),      // a food producer — its workforce supplies the staple market (M15)
}).strict();

export type Profession = z.infer<typeof ProfessionSchema>;

// ── Biome ─────────────────────────────────────────────────────────────────────
// Spawn tables reference flora/fauna/resource ids; the loader cross-checks them
// against those registries at startup (fail loud on a dangling reference).
const SpawnEntry = z.object({
  id: z.string().min(1),
  weight: z.number().positive(),
}).strict();

export const BiomeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  climate: z.string().min(1),
  terrain: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex colour'),
  passable: z.boolean().default(true),
  genWeight: z.number().positive().default(1),  // relative frequency at world-gen
  flora: z.array(SpawnEntry).default([]),
  fauna: z.array(SpawnEntry).default([]),
  resources: z.array(SpawnEntry).default([]),
}).strict();

export type Biome = z.infer<typeof BiomeSchema>;
export type SpawnTableEntry = z.infer<typeof SpawnEntry>;

// ── Language ──────────────────────────────────────────────────────────────────
// A seed language (CULTURE_AND_LANGUAGE.md, M7): a phoneme inventory, the syllable
// shapes that combine them (C=consonant, V=vowel), the patterns names follow, and a
// per-era sound-change rate. Words/names are generated on demand from these rules +
// a seed and regenerate identically — we never store whole lexicons (D12).
export const LanguageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phonemes: z.object({
    consonants: z.array(z.string().min(1)).min(1),
    vowels: z.array(z.string().min(1)).min(1),
  }).strict(),
  syllableShapes: z.array(z.string().regex(/^[CV]+$/, 'syllable shape must be C/V letters only')).min(1),
  namePatterns: z.object({
    personal: z.array(z.string().min(1)).min(1),  // tokens: {syl}; other chars are literals
    family: z.array(z.string().min(1)).min(1),
  }).strict(),
  soundChangeRate: z.number().min(0).max(1).default(0.1),  // per era; higher = faster drift (M7 slice 3)
}).strict();

export type Language = z.infer<typeof LanguageSchema>;

// ── Culture ───────────────────────────────────────────────────────────────────
// A seed culture (CULTURE_AND_LANGUAGE.md, M7): positions on a handful of value
// axes (each 0..1, the field naming the "high" pole), practices, the tongue it
// speaks, and a cohesion (resistance to drift, slice 3). Cultures are shared objects
// agents merely reference — and their values **causally bias behaviour** (D26).
export const CultureSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  language: z.string().min(1),   // the tongue this culture speaks
  values: z.object({
    communal: z.number().min(0).max(1).default(0.5),     // communal ↔ individual
    martial: z.number().min(0).max(1).default(0.5),      // martial ↔ mercantile
    traditional: z.number().min(0).max(1).default(0.5),  // traditional ↔ innovative
    open: z.number().min(0).max(1).default(0.5),         // open ↔ insular
  }).strict(),
  practices: z.array(z.string()).default([]),
  cohesion: z.number().min(0).max(1).default(0.5),       // resistance to value drift (M7 slice 3)
}).strict();

export type Culture = z.infer<typeof CultureSchema>;
export type CultureValues = Culture['values'];

// A technology node (M17) — one rung on the ladder organizations climb by research. Data
// declares the node (tier/era/cost/prerequisites + optional effect tags); the ResearchSystem
// implements *how* it is climbed, and code implements what each effect tag does.
export const TechSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.number().int().min(1).max(7),    // 1 tribal … 7 sci-fi
  era: z.string().min(1),                  // display label for the tier (e.g. "Iron Age")
  cost: z.number().positive(),             // research points to unlock
  prerequisites: z.array(z.string()).default([]),   // tech ids that must be known first
  effects: z.array(z.string()).default([]),// code-side effect tags (wired in a later slice)
  blurb: z.string().default(''),
}).strict();

export type Tech = z.infer<typeof TechSchema>;

// ── World event (M19) ──────────────────────────────────────────────────────────
// A thing that *happens* to the world — a bountiful harvest, a festival, a famine,
// a ghost. Data declares the event (when it can fire, how notable it is, which
// code-side effect it triggers, what to write in the feed/Chronicle); the
// EventSystem implements *how* events are scheduled, and code implements what each
// `effect` tag actually does (the data/behaviour boundary, D9). Adding a new event
// is data-only as long as its effect tag already has an implementation.
export const WorldEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['fortune', 'seasonal', 'disaster', 'paranormal']).default('fortune'),
  chancePerDay: z.number().min(0).max(1),   // deterministic scheduled trigger (rolled once a day)
  importance: z.number().min(0).max(1).default(0.6),  // ≥ chronicle threshold → a legend; below → feed only
  effect: z.string().min(1),                // code-side effect tag (src/event/effects.ts)
  message: z.string().min(1),               // the line shown in the feed / Chronicle when it fires
  minPopulation: z.number().int().min(0).default(0),  // a simple trigger guard (won't fire below this many folk)
  season: z.enum(['Spring', 'Summer', 'Autumn', 'Winter']).optional(),  // restrict to a season (M19 seasons slice)
}).strict();

export type WorldEvent = z.infer<typeof WorldEventSchema>;

// ── Good (M23) ──────────────────────────────────────────────────────────────────
// A crafted item — the OUTPUT of a recipe (planks, tools, blades, …). Materials (the raw
// resource ids) are the inputs; goods are what crafting makes of them. `value` is gold worth
// (for trade, slice 3); `category` lets later slices give a class of good a mechanical effect
// (weapon/armour → combat). Carried in the same `Inventory` bag as materials.
export const GoodSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(['ware', 'tool', 'weapon', 'armour']).default('ware'),
  value: z.number().min(0).default(1),
  power: z.number().min(0).default(0),   // combat bonus when equipped (weapon → damage, armour → soak) (M23 s3)
}).strict();

export type Good = z.infer<typeof GoodSchema>;

// ── Recipe (M23) ────────────────────────────────────────────────────────────────
// A crafting recipe: a profession turns carried materials/goods (`inputs`) into a `output`
// good, gated by the crafter's skill. Data declares the recipe; the CraftSystem implements
// *how* it is crafted (consume inputs → produce output → grow skill, learn-by-doing).
export const RecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  profession: z.string().min(1),                              // the profession that crafts this
  inputs: z.record(z.string().min(1), z.number().positive()), // material/good id → quantity consumed
  output: z.string().min(1),                                  // good id produced
  outputQty: z.number().positive().default(1),
  minSkill: z.number().min(0).default(0),                     // craft skill required to attempt it
  skillGain: z.number().min(0).default(0.1),                  // skill gained per craft (learn-by-doing)
}).strict();

export type Recipe = z.infer<typeof RecipeSchema>;

// ── Wonder (M20 s3b) ────────────────────────────────────────────────────────────
// A town-scale mega-project — a great monument, the space elevator — unlocked by reaching a
// tech tier and raised by the town's collective effort over years. Data declares the wonder
// (its tech gate + the effort to build it); the WonderSystem implements *how* it's raised.
export const WonderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  minTier: z.number().int().min(1).max(7),  // tech tier a clan must reach to begin it
  cost: z.number().positive(),              // build-effort (town workforce-days) to complete
  blurb: z.string().default(''),
}).strict();

export type Wonder = z.infer<typeof WonderSchema>;

// Maps a top-level content folder to its schema. The loader uses this to pick
// the right validator for each file by its path.
export const FOLDER_SCHEMAS = {
  species: SpeciesSchema,
  capabilities: CapabilitySchema,
  biomes: BiomeSchema,
  flora: FloraSchema,
  fauna: FaunaSchema,
  resources: ResourceSchema,
  professions: ProfessionSchema,
  languages: LanguageSchema,
  cultures: CultureSchema,
  tech: TechSchema,
  events: WorldEventSchema,
  goods: GoodSchema,
  recipes: RecipeSchema,
  wonders: WonderSchema,
} as const;

export type ContentFolder = keyof typeof FOLDER_SCHEMAS;
