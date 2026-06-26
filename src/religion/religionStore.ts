// Runtime religion store (M18) — faiths the folk follow, mirroring the culture/tribe engines
// (D12/D33): a singleton of `Religion` records agents reference by `religionId`. A faith carries
// a coined name + deity, a few tenets, a `fervor` (devoutness), descent, and schisms over the
// eras into sects (reusing the fork machinery). Faith **causally** warms bonds between the
// faithful (D26 — `faithFactor`). Religions are seeded from the founding cultures' values.
import { C_RELIGIONSTORE } from '../sim/components.ts';
import type { World } from '../sim/ecs.ts';
import type { Religion } from '../sim/components.ts';
import type { RNG } from '../sim/rng.ts';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface ReligionStoreData {
  byId: Record<string, Religion>;
  created: number;         // total faiths ever founded — spaces the colour hues
  lastEvolveTick: number;  // the schism clock
}

export function createReligionStore(): ReligionStoreData {
  return { byId: {}, created: 0, lastEvolveTick: 0 };
}

export function getReligionStore(world: World): ReligionStoreData | undefined {
  const ents = world.query(C_RELIGIONSTORE);
  return ents.length ? world.getComponent<ReligionStoreData>(ents[0], C_RELIGIONSTORE) : undefined;
}
export function getReligion(store: ReligionStoreData, id: string): Religion | undefined {
  return store.byId[id];
}

// A hue-spaced colour for the faith (golden-angle steps from a violet base — distinct from
// the green-based tribe palette so faiths and tribes don't blur together).
export function faithColor(index: number): string {
  return `hsl(${Math.round((275 + index * 137.508) % 360)}, 45%, 62%)`;
}

export function createReligion(store: ReligionStoreData, name: string, deity: string, tenets: string[], fervor: number, tick: number): string {
  const id = `faith.${store.created}`;
  store.byId[id] = {
    id, name, deity, color: faithColor(store.created),
    tenets: [...tenets], fervor: clamp01(fervor), cohesion: 0.6, founded: tick,
  };
  store.created++;
  return id;
}

// A sect breaks away on schism: it keeps the parent's tenets, takes a new name/deity and a
// nudged fervor (zeal often runs hotter or cooler in a breakaway), with a descent link.
export function forkReligion(store: ReligionStoreData, parentId: string, name: string, deity: string, tick: number, rng: RNG): string {
  const parent = store.byId[parentId];
  const id = `${parentId}.s${tick}`;
  store.byId[id] = {
    id, name, deity, color: faithColor(store.created),
    tenets: [...parent.tenets], fervor: clamp01(parent.fervor + (rng() * 2 - 1) * 0.3),
    cohesion: clamp01(parent.cohesion + 0.1), founded: tick, parent: parentId,
  };
  store.created++;
  return id;
}

// Bound the store: drop the oldest extinct faiths beyond the cap (their descent survives in
// their sects). Living faiths are never pruned.
export function pruneReligions(store: ReligionStoreData, cap: number): void {
  const ids = Object.keys(store.byId);
  if (ids.length <= cap) return;
  const extinct = ids.filter(id => store.byId[id].extinct)
    .sort((a, b) => (store.byId[a].diedTick ?? 0) - (store.byId[b].diedTick ?? 0));
  for (const id of extinct) {
    if (Object.keys(store.byId).length <= cap) break;
    delete store.byId[id];
  }
}

// Causal coupling (D26): two of the same faith bond more warmly (shared devotion), scaled by
// how devout the faith is; folk of different faiths are a touch cooler. Neutral (1) when a
// faith is absent, so the unbelieving and the test worlds are unaffected.
export function faithFactor(store: ReligionStoreData | undefined, a: string | undefined, b: string | undefined): number {
  if (!store || !a || !b) return 1;
  if (a === b) return 1 + 0.2 * (store.byId[a]?.fervor ?? 0.5);   // up to +0.2 for the most devout
  return 0.92;                                                     // mild cross-faith chill
}
