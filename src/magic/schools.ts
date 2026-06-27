// The magic tree (M26, was M17 s3): the schools a mage practises — each a ladder of named spells
// unlocked by growing mastery. Schools are now **content** (content/magic/*.yaml), validated +
// boundary-checked at load (loader.ts); this module holds the shared read helpers the MagicSystem,
// spawnAgent and the inspector use, backed by a module-level registry set once at content load.
//
// Why a module singleton (not threaded `content`): schools are immutable, load-once data, and the
// helpers are pure reads from many call sites (inspector, two systems, spawn). Setting the registry
// at the single content-load chokepoint keeps those call sites argument-free. Until content loads
// (or in a test that never loads it) the readers return empty/undefined — magic simply does nothing,
// never crashes. (Mirrors how culture/language stores back their helpers, but module-level since
// schools never mutate at runtime.) See DECISIONS.
import type { Registry } from '../content/registry.ts';
import type { MagicSchool, MageSpell } from '../content/schema.ts';

export type { MagicSchool, MageSpell };

let registry: Registry<MagicSchool> | null = null;

// Called once by loadContent() with the validated schools registry.
export function setMagicSchools(reg: Registry<MagicSchool>): void {
  registry = reg;
}

// Every school, in a stable order (Registry.all() sorts by id) — for the inspector tree & spawn pick.
export function allSchools(): MagicSchool[] {
  return registry ? registry.all() : [];
}

export function schoolIds(): string[] {
  return allSchools().map(s => s.id);
}

export function schoolOf(id: string | undefined): MagicSchool | undefined {
  return id !== undefined ? registry?.get(id) : undefined;
}

// The spells a mage of this school commands at the given mastery (lowest first).
export function knownSpells(schoolId: string | undefined, mastery: number): MageSpell[] {
  return schoolOf(schoolId)?.spells.filter(sp => sp.mastery <= mastery) ?? [];
}

// The strongest spell the mage can presently cast (or undefined if none unlocked yet).
export function topSpell(schoolId: string | undefined, mastery: number): MageSpell | undefined {
  const known = knownSpells(schoolId, mastery);
  return known.length ? known[known.length - 1] : undefined;
}
