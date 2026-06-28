// The environment-agnostic content pipeline: raw text -> parse -> validate ->
// typed registries. Pure (no filesystem), so it runs identically in Node and
// the browser and is trivially testable. File discovery is the caller's job
// (fsSource.ts in Node, import.meta.glob in the browser).
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { FOLDER_SCHEMAS } from './schema.ts';
import type {
  Species, Capability, Biome, Flora, Fauna, Resource, Profession, Language, Culture, Tech, WorldEvent, Good, Recipe, Wonder, Monster, Building, MagicSchool, Power, ContentFolder,
} from './schema.ts';
import { Registry } from './registry.ts';
import { isKnownEffectTag } from '../capability/effects.ts';
import { isKnownEventEffect } from '../event/effects.ts';
import { isKnownSpellEffect } from '../magic/effects.ts';
import { isKnownPowerEffect } from '../sim/powers.ts';
import { setMagicSchools } from '../magic/schools.ts';

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
  tech: Registry<Tech>;
  events: Registry<WorldEvent>;
  goods: Registry<Good>;
  recipes: Registry<Recipe>;
  wonders: Registry<Wonder>;
  monsters: Registry<Monster>;
  buildings: Registry<Building>;
  magic: Registry<MagicSchool>;
  powers: Registry<Power>;
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
    species: [], capabilities: [], biomes: [], flora: [], fauna: [], resources: [], professions: [], languages: [], cultures: [], tech: [], events: [], goods: [], recipes: [], wonders: [], monsters: [], buildings: [], magic: [], powers: [],
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
  // Same boundary for world events: a declared effect must have a code implementation.
  for (const ev of buckets.events as WorldEvent[]) {
    if (!isKnownEventEffect(ev.effect)) {
      errors.push(
        `events/${ev.id}: effect '${ev.effect}' has no implementation in src/event/effects.ts`,
      );
    }
  }
  // Same boundary for magic schools (M26): a school's signature + every spell effect must have a
  // code implementation in the MagicSystem (src/magic/effects.ts lists the known tags).
  for (const sch of buckets.magic as MagicSchool[]) {
    if (!isKnownSpellEffect(sch.signature)) {
      errors.push(`magic/${sch.id}: signature effect '${sch.signature}' has no implementation in src/magic/effects.ts`);
    }
    for (const sp of sch.spells) {
      if (!isKnownSpellEffect(sp.effect)) {
        errors.push(`magic/${sch.id}: spell '${sp.name}' effect '${sp.effect}' has no implementation in src/magic/effects.ts`);
      }
    }
  }
  // Same boundary for god-mode powers (M27 s2): a power's `effect` must have a code implementation
  // in the power roster (src/sim/powers.ts). (The `event` reference is checked below, once the
  // events registry exists.)
  for (const p of buckets.powers as Power[]) {
    if (!isKnownPowerEffect(p.effect)) {
      errors.push(`powers/${p.id}: effect '${p.effect}' has no implementation in src/sim/powers.ts`);
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
  let tech: Registry<Tech>;
  let events: Registry<WorldEvent>;
  let goods: Registry<Good>;
  let recipes: Registry<Recipe>;
  let wonders: Registry<Wonder>;
  let monsters: Registry<Monster>;
  let buildings: Registry<Building>;
  let magic: Registry<MagicSchool>;
  let powers: Registry<Power>;
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
    tech = new Registry(buckets.tech as Tech[]);
    events = new Registry(buckets.events as WorldEvent[]);
    goods = new Registry(buckets.goods as Good[]);
    recipes = new Registry(buckets.recipes as Recipe[]);
    wonders = new Registry(buckets.wonders as Wonder[]);
    monsters = new Registry(buckets.monsters as Monster[]);
    buildings = new Registry(buckets.buildings as Building[]);
    magic = new Registry(buckets.magic as MagicSchool[]);
    powers = new Registry(buckets.powers as Power[]);
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
  // A tech's prerequisites must be real techs of a lower (earlier) tier — no cycles.
  for (const t of tech.all()) {
    for (const p of t.prerequisites) {
      const pre = tech.get(p);
      if (!pre) refErrors.push(`tech/${t.id}: unknown prerequisite '${p}'`);
      else if (pre.tier > t.tier) refErrors.push(`tech/${t.id}: prerequisite '${p}' is a later tier (${pre.tier} > ${t.tier})`);
    }
  }
  // A recipe must be crafted by a real profession, consume real materials (a resource or a
  // good), and output a real good (M23).
  for (const r of recipes.all()) {
    if (!professions.has(r.profession)) refErrors.push(`recipes/${r.id}: unknown profession '${r.profession}'`);
    if (!goods.has(r.output)) refErrors.push(`recipes/${r.id}: output '${r.output}' is not a known good`);
    for (const id of Object.keys(r.inputs)) {
      if (!resources.has(id) && !goods.has(id)) refErrors.push(`recipes/${r.id}: input '${id}' is neither a resource nor a good`);
    }
  }
  // A power that summons must name a real world event (M27 s2 — the M19 event it fires).
  for (const p of powers.all()) {
    if (p.event !== undefined && !events.has(p.event)) refErrors.push(`powers/${p.id}: summons unknown event '${p.event}'`);
  }
  if (refErrors.length > 0) {
    throw new Error(
      `Content failed to load (${refErrors.length} problem${refErrors.length > 1 ? 's' : ''}):\n` +
      refErrors.join('\n'),
    );
  }

  // Make the magic schools available to the helper module (schoolOf/topSpell/…) that the
  // MagicSystem, spawnAgent and the inspector read. Schools are immutable, load-once content,
  // so a module-level registry — set here, the single content-load chokepoint every entry point
  // (browser, node, tests) passes through — is cleaner than threading `content` through the
  // inspector + four systems (D9 boundary; see DECISIONS).
  setMagicSchools(magic);

  return { species, capabilities, biomes, flora, fauna, resources, professions, languages, cultures, tech, events, goods, recipes, wonders, monsters, buildings, magic, powers };
}
