// The environment-agnostic content pipeline: raw text -> parse -> validate ->
// typed registries. Pure (no filesystem), so it runs identically in Node and
// the browser and is trivially testable. File discovery is the caller's job
// (fsSource.ts in Node, import.meta.glob in the browser).
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { FOLDER_SCHEMAS } from './schema.ts';
import type { Species, Capability, ContentFolder } from './schema.ts';
import { Registry } from './registry.ts';
import { isKnownEffectTag } from '../capability/effects.ts';

export interface Content {
  species: Registry<Species>;
  capabilities: Registry<Capability>;
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
  const buckets: Record<ContentFolder, unknown[]> = { species: [], capabilities: [] };
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
  try {
    species = new Registry(buckets.species as Species[]);
    capabilities = new Registry(buckets.capabilities as Capability[]);
  } catch (e) {
    throw new Error(`Content failed to load: ${(e as Error).message}`);
  }

  if (species.size === 0) {
    throw new Error('Content failed to load: no species defined under content/species');
  }

  return { species, capabilities };
}
