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

// ── Founding myths (M18 s2) ──────────────────────────────────────────────────────
// A faith's origin story, woven from its deity + a tenet. Deterministic (a hash of the faith's own
// names → no RNG, no sim coupling), so it reproduces on replay/reload and is pure flavour for the
// Faiths view + inspector. Like the language & dialogue generators: the data is text, the faith is real.
function mythHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
}
const MYTH_OPENINGS = [
  'When the world was young and without form',
  'Before the first dawn broke',
  'In the age before memory',
  'Out of the silence at the beginning of things',
  'When only the deep dark lay over the waters',
] as const;
const MYTH_DEEDS = [
  'kindled the sun to warm the folk',
  'breathed life into clay and stone',
  'parted the waters so the dry land could rise',
  'set the stars as watchful eyes over the night',
  'sang the beasts and the green things into being',
  'struck the first fire from the bones of the mountains',
] as const;
const MYTH_CHARGES = [
  'and to the folk gave one law',
  'and charged the faithful, above all',
  'and the first and oldest teaching was',
  'and bade them keep, for all time',
] as const;

export function mythFor(deity: string, tenets: string[]): string {
  const seed = `${deity}|${tenets.join(',')}`;
  const open = MYTH_OPENINGS[mythHash('o' + seed) % MYTH_OPENINGS.length];
  const deed = MYTH_DEEDS[mythHash('d' + seed) % MYTH_DEEDS.length];
  const charge = MYTH_CHARGES[mythHash('c' + seed) % MYTH_CHARGES.length];
  const tenet = tenets.length ? tenets[mythHash('t' + seed) % tenets.length] : 'the old ways';
  return `${open}, ${deity} ${deed}, ${charge}: ${tenet}.`;
}

export function createReligion(store: ReligionStoreData, name: string, deity: string, tenets: string[], fervor: number, tick: number): string {
  const id = `faith.${store.created}`;
  store.byId[id] = {
    id, name, deity, color: faithColor(store.created),
    tenets: [...tenets], fervor: clamp01(fervor), cohesion: 0.6, founded: tick,
    myth: mythFor(deity, tenets),
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
    myth: mythFor(deity, parent.tenets),
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
