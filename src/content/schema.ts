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
} as const;

export type ContentFolder = keyof typeof FOLDER_SCHEMAS;
