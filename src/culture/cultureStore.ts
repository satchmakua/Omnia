// Runtime culture store (M7 slice 2). Cultures are a handful of **shared objects**
// agents merely reference (D12) — kept in a singleton, seeded from the authored
// cultures and later growing daughter cultures as populations diverge (slice 4).
// Crucially the values **causally bias behaviour** (D26): see `wealthGoalFactor`.
import { C_CULTURESTORE } from '../sim/components.ts';
import type { World } from '../sim/ecs.ts';
import type { Content } from '../content/loader.ts';
import type { Culture, CultureValues } from '../content/schema.ts';
import type { RNG } from '../sim/rng.ts';

// A live culture: the authored shape plus descent (M7 slice 4) + extinction (M7 slice 5)
// bookkeeping. A culture with no living members is kept as a compact descent record.
export interface RuntimeCulture extends Culture {
  parent?: string;       // id of the culture this split from
  foundedTick?: number;  // when a daughter culture formed
  extinct?: boolean;     // no living members — a lost culture, kept for the family tree
  diedTick?: number;     // when it died out
}

export interface CultureStoreData {
  byId: Record<string, RuntimeCulture>;
  lastEvolveTick: number;   // the generational evolution clock (slice 3)
}

// Seed from the authored cultures, deep-cloned so runtime drift never mutates the
// content registry.
export function createCultureStore(content: Content): CultureStoreData {
  const byId: Record<string, RuntimeCulture> = {};
  for (const c of content.cultures.all()) {
    byId[c.id] = { ...c, values: { ...c.values }, practices: [...c.practices] };
  }
  return { byId, lastEvolveTick: 0 };  // hold the seed state for the first era
}

const AXES: (keyof CultureValues)[] = ['communal', 'martial', 'traditional', 'open'];
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Drift a culture's values one era (M7 slice 3): a small random walk on each axis,
// damped by the culture's cohesion (a tight-knit culture resists change). Mutates
// in place; deterministic via `rng`.
export function driftValues(c: RuntimeCulture, base: number, rng: RNG): void {
  const amt = base * (1 - c.cohesion);
  for (const k of AXES) c.values[k] = clamp01(c.values[k] + (rng() * 2 - 1) * amt);
}

// Fork a daughter culture from a parent (a schism, M7 slice 4): copy it, give it the
// new daughter tongue and a name tied to it, link the descent, make it a tight new
// sect (higher cohesion), and nudge its values so it is already distinct.
export function forkCulture(
  store: CultureStoreData, parentId: string, langId: string, langName: string,
  tick: number, nudge: number, rng: RNG,
): string {
  const parent = store.byId[parentId];
  const newId = `${parentId}.d${tick}`;
  const daughter: RuntimeCulture = {
    ...parent,
    id: newId,
    name: `${langName}-kin`,
    language: langId,
    parent: parentId,
    foundedTick: tick,
    values: { ...parent.values },
    practices: [...parent.practices],
    cohesion: clamp01(parent.cohesion + 0.1),
  };
  driftValues(daughter, nudge, rng);
  store.byId[newId] = daughter;
  return newId;
}

export function getCultureStore(world: World): CultureStoreData | undefined {
  const ents = world.query(C_CULTURESTORE);
  return ents.length ? world.getComponent<CultureStoreData>(ents[0], C_CULTURESTORE) : undefined;
}

export function getCulture(store: CultureStoreData, id: string): RuntimeCulture | undefined {
  return store.byId[id];
}

// The (first) culture that speaks a tongue — how a founder inherits their culture
// from their species' language. Deterministic: the store seeds in id order.
export function cultureForLanguage(store: CultureStoreData, languageId: string): string | undefined {
  for (const c of Object.values(store.byId)) if (c.language === languageId) return c.id;
  return undefined;
}

// ── Causal coupling (D26) ──────────────────────────────────────────────────────
// A communal culture shares readily and prizes only modest personal wealth; an
// individualist one accumulates. So a higher `communal` value lowers an agent's
// wealth goal. Bounded to [0.7, 1.3] so the economy stays stable (soak-gated).
export function wealthGoalFactor(values: CultureValues): number {
  return 1.3 - 0.6 * values.communal;
}

// `open` axis: how readily friendship warms BETWEEN cultures. Same culture → full
// warmth; different cultures → the pair's average openness (floored so insular folk
// aren't perfectly segregated). So open cultures befriend outsiders, insular ones
// barely do — while company (the social *need*) is still met by anyone.
export function bondFactor(a: RuntimeCulture | undefined, b: RuntimeCulture | undefined): number {
  if (!a || !b || a.id === b.id) return 1;
  return Math.max(0.15, (a.values.open + b.values.open) / 2);
}

// `traditional` axis: traditional folk prefer to marry within their own culture
// (endogamy). `roll` is a seeded RNG draw in [0,1); true ⇒ restrict to same-culture.
export function prefersEndogamy(c: RuntimeCulture | undefined, roll: number): boolean {
  return !!c && roll < c.values.traditional;
}
