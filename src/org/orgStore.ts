// Runtime organization store (M14, D33) — the unified social-structure engine. Tribes/
// factions are a handful of shared objects agents reference by `orgId` (like cultures, D12),
// kept in a singleton. Each carries a leader, values (→ a government), a hue-spaced colour
// (never red), and descends/schisms over the eras — reusing the culture/language fork pattern.
import { C_ORGSTORE } from '../sim/components.ts';
import type { World } from '../sim/ecs.ts';
import type { Organization } from '../sim/components.ts';
import type { RNG } from '../sim/rng.ts';

type Values = Organization['values'];
const AXES = ['communal', 'martial', 'traditional', 'open'] as const;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface OrgStoreData {
  byId: Record<string, Organization>;
  created: number;         // total tribes ever formed — spaces the colour hues
  lastEvolveTick: number;  // the org-evolution (schism) clock
}

export function createOrgStore(): OrgStoreData {
  return { byId: {}, created: 0, lastEvolveTick: 0 };
}

export function getOrgStore(world: World): OrgStoreData | undefined {
  const ents = world.query(C_ORGSTORE);
  return ents.length ? world.getComponent<OrgStoreData>(ents[0], C_ORGSTORE) : undefined;
}
export function getOrg(store: OrgStoreData, id: string): Organization | undefined {
  return store.byId[id];
}

// A hue-spaced colour, never red. Golden-angle steps from a green base, nudged clear of the
// red band ([344,360]∪[0,16]). Returned as an hsl() string the renderer can use directly.
export function orgHue(index: number): number {
  let h = (140 + index * 137.508) % 360;
  if (h < 16) h += 26; else if (h > 344) h -= 26;
  return Math.round(h);
}
export const orgColor = (index: number): string => `hsl(${orgHue(index)}, 55%, 60%)`;

// The government a tribe's values imply (emergent from values, D26).
export function governmentOf(v: Values): string {
  if (v.martial > 0.6) return 'chiefdom';        // a warband under a strong chief
  if (v.traditional > 0.65) return 'theocracy';   // bound to the old rites
  if (v.communal > 0.6) return 'council';         // shared rule by a council
  if (v.open > 0.65) return 'meritocracy';        // the able rise
  return 'gerontocracy';                          // rule of the eldest
}

export function createOrg(store: OrgStoreData, name: string, values: Values, cohesion: number, tick: number): string {
  const id = `org.${store.created}`;
  store.byId[id] = {
    id, name, color: orgColor(store.created), government: governmentOf(values),
    values: { ...values }, leader: null, cohesion: clamp01(cohesion), founded: tick,
  };
  store.created++;
  return id;
}

// Fork a daughter tribe on schism: copy the parent, nudge its values (so its government may
// diverge), give it a fresh colour + descent link, and make it a tighter new faction.
export function forkOrg(store: OrgStoreData, parentId: string, name: string, tick: number, nudge: number, rng: RNG): string {
  const parent = store.byId[parentId];
  const v: Values = { ...parent.values };
  for (const k of AXES) v[k] = clamp01(v[k] + (rng() * 2 - 1) * nudge);
  const id = `${parentId}.d${tick}`;
  store.byId[id] = {
    id, name, color: orgColor(store.created), government: governmentOf(v),
    values: v, leader: null, cohesion: clamp01(parent.cohesion + 0.1), founded: tick, parent: parentId,
  };
  store.created++;
  return id;
}

// Bound the store: once there are more than `cap` tribes, drop the oldest extinct ones
// (their descent is summarised by their surviving daughters). Living tribes are never pruned.
export function pruneOrgs(store: OrgStoreData, cap: number): void {
  const ids = Object.keys(store.byId);
  if (ids.length <= cap) return;
  const extinct = ids.filter(id => store.byId[id].extinct)
    .sort((a, b) => (store.byId[a].diedTick ?? 0) - (store.byId[b].diedTick ?? 0));
  for (const id of extinct) {
    if (Object.keys(store.byId).length <= cap) break;
    delete store.byId[id];
  }
}
