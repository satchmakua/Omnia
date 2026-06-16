// Runtime culture store (M7 slice 2). Cultures are a handful of **shared objects**
// agents merely reference (D12) — kept in a singleton, seeded from the authored
// cultures and later growing daughter cultures as populations diverge (slice 4).
// Crucially the values **causally bias behaviour** (D26): see `wealthGoalFactor`.
import { C_CULTURESTORE } from '../sim/components.ts';
import type { World } from '../sim/ecs.ts';
import type { Content } from '../content/loader.ts';
import type { Culture, CultureValues } from '../content/schema.ts';

// A live culture: the authored shape plus optional descent bookkeeping (slice 4).
export interface RuntimeCulture extends Culture {
  parent?: string;       // id of the culture this split from
  foundedTick?: number;  // when a daughter culture formed
}

export interface CultureStoreData {
  byId: Record<string, RuntimeCulture>;
}

// Seed from the authored cultures, deep-cloned so runtime drift never mutates the
// content registry.
export function createCultureStore(content: Content): CultureStoreData {
  const byId: Record<string, RuntimeCulture> = {};
  for (const c of content.cultures.all()) {
    byId[c.id] = { ...c, values: { ...c.values }, practices: [...c.practices] };
  }
  return { byId };
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
