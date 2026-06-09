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
  nameSounds: z.object({
    onsets: z.array(z.string()).min(1),
    nuclei: z.array(z.string()).min(1),
    codas: z.array(z.string()).min(1),
    syllables: Range,
  }).strict(),
}).strict();

export type Species = z.infer<typeof SpeciesSchema>;

// ── Capability ────────────────────────────────────────────────────────────────
export const CapabilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tradition: z.enum(['technology', 'magic']),
  effects: z.array(z.string()).min(1),        // effect tags; code must implement each
  power: z.number().default(0),
}).strict();

export type Capability = z.infer<typeof CapabilitySchema>;

// Maps a top-level content folder to its schema. The loader uses this to pick
// the right validator for each file by its path.
export const FOLDER_SCHEMAS = {
  species: SpeciesSchema,
  capabilities: CapabilitySchema,
} as const;

export type ContentFolder = keyof typeof FOLDER_SCHEMAS;
