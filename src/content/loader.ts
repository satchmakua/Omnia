// The environment-agnostic content pipeline: raw text -> parse -> validate ->
// typed registries. Pure (no filesystem), so it runs identically in Node and
// the browser and is trivially testable. File discovery is the caller's job
// (fsSource.ts in Node, import.meta.glob in the browser).
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { FOLDER_SCHEMAS } from './schema.ts';
import type {
  Species, Capability, Biome, Flora, Fauna, Resource, Profession, Language, Culture, ContentFolder,
} from './schema.ts';
import { Registry } from './registry.ts';
import { isKnownEffectTag } from '../capability/effects.ts';

export interface Content {
  species: Registry<Species>;
  capabilities: Registry<Capability>;
  biomes: Registry<Biome>;
  flora: Registry<Flora>;
  fauna: Registry<Fauna>;
  resources: Registry<Resource>;
  professions: Registry<Profession>;
  languages: Registry<Language>;
  cultures: Registry<Culture>;
}

// Relative path like "species/human.yaml" -> "species".
function folderOf(relPath: string): string {
  return relPath.replace(/\\/g, '/').split('/')[0];
}

function formatZodError(relPath: string, err: z.ZodError): string {
  const lines = err.issues.map((i) => {
    const where = i.path.length ? i.path.join('.') : '(root)';
    return `    - ${where}: ${i.message}`;
  });
  return `${relPath}: invalid content\n${lines.join('\n')}`;
}

/**
 * Build typed registries from a map of { relativePath: rawYamlText }.
 * Throws an aggregated, human-readable error if ANY file is malformed,
 * fails schema validation, or references an unimplemented effect tag.
 * Fail loud, early, helpful (CONTENT_AND_DATA Rule 1).
 */
export function loadContent(files: Map<string, string>): Content {
  const buckets: Record<ContentFolder, unknown[]> = {
    species: [], capabilities: [], biomes: [], flora: [], fauna: [], resources: [], professions: [], languages: [], cultures: [],
  };
  const errors: string[] = [];

  // Deterministic processing order regardless of filesystem/glob ordering.
  const paths = [...files.keys()].sort();

  for (const relPath of paths) {
    const folder = folderOf(relPath);
    if (!(folder in FOLDER_SCHEMAS)) {
      // Unknown top-level folder: ignore quietly (e.g. README in /content).
      if (relPath.endsWith('.yaml') || relPath.endsWith('.yml')) {
        errors.push(`${relPath}: unknown content folder '${folder}'`);
      }
      continue;
    }
    const schema = FOLDER_SCHEMAS[folder as ContentFolder];

    let raw: unknown;
    try {
      raw = parseYaml(files.get(relPath)!);
    } catch (e) {
      errors.push(`${relPath}: YAML parse error — ${(e as Error).message}`);
      continue;
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
      errors.push(formatZodError(relPath, result.error));
      continue;
    }
    buckets[folder as ContentFolder].push(result.data);
  }

  // Boundary check: every declared effect tag must have a code implementation.
  for (const cap of buckets.capabilities as Capability[]) {
    for (const tag of cap.effects) {
      if (!isKnownEffectTag(tag)) {
        errors.push(
          `capabilities/${cap.id}: effect tag '${tag}' has no implementation in src/capability/effects.ts`,
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Content failed to load (${errors.length} problem${errors.length > 1 ? 's' : ''}):\n` +
      errors.join('\n'),
    );
  }

  let species: Registry<Species>;
  let capabilities: Registry<Capability>;
  let biomes: Registry<Biome>;
  let flora: Registry<Flora>;
  let fauna: Registry<Fauna>;
  let resources: Registry<Resource>;
  let professions: Registry<Profession>;
  let languages: Registry<Language>;
  let cultures: Registry<Culture>;
  try {
    species = new Registry(buckets.species as Species[]);
    capabilities = new Registry(buckets.capabilities as Capability[]);
    biomes = new Registry(buckets.biomes as Biome[]);
    flora = new Registry(buckets.flora as Flora[]);
    fauna = new Registry(buckets.fauna as Fauna[]);
    resources = new Registry(buckets.resources as Resource[]);
    professions = new Registry(buckets.professions as Profession[]);
    languages = new Registry(buckets.languages as Language[]);
    cultures = new Registry(buckets.cultures as Culture[]);
  } catch (e) {
    throw new Error(`Content failed to load: ${(e as Error).message}`);
  }

  if (species.size === 0) {
    throw new Error('Content failed to load: no species defined under content/species');
  }

  // Referential integrity: biome spawn tables must point at content that exists.
  const refErrors: string[] = [];
  for (const biome of biomes.all()) {
    const check = (kind: string, reg: Registry<{ id: string }>, entries: { id: string }[]) => {
      for (const entry of entries) {
        if (!reg.has(entry.id)) {
          refErrors.push(`biomes/${biome.id}: ${kind} spawn-table references unknown id '${entry.id}'`);
        }
      }
    };
    check('flora', flora, biome.flora);
    check('fauna', fauna, biome.fauna);
    check('resources', resources, biome.resources);
  }
  // A profession that gathers must name a real resource.
  for (const prof of professions.all()) {
    if (prof.gathers !== undefined && !resources.has(prof.gathers)) {
      refErrors.push(`professions/${prof.id}: gathers unknown resource '${prof.gathers}'`);
    }
  }
  // A culture must speak a tongue that exists.
  for (const culture of cultures.all()) {
    if (!languages.has(culture.language)) {
      refErrors.push(`cultures/${culture.id}: speaks unknown language '${culture.language}'`);
    }
  }
  if (refErrors.length > 0) {
    throw new Error(
      `Content failed to load (${refErrors.length} problem${refErrors.length > 1 ? 's' : ''}):\n` +
      refErrors.join('\n'),
    );
  }

  return { species, capabilities, biomes, flora, fauna, resources, professions, languages, cultures };
}
