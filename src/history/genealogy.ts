// The family forest (M35): a pure read of every soul who ever lived — living agents (carry
// `Lineage`) and the buried (carry a `Tombstone` with the same parents/children/partner) — built
// into a generational pedigree graph the Heritage view draws. No sim state is touched (sim/render
// separation holds), it's deterministic, and it's bounded by the living + the tombstones. The graph
// + layout are pure (testable here); the SVG drawing lives in src/render/familyForest.ts.
import type { World, EntityId } from '../sim/ecs.ts';
import { C_AGENT, C_TOMBSTONE, C_LINEAGE, C_CLOCK } from '../sim/components.ts';
import type { Agent, Tombstone, Lineage, Clock } from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';
import { ticksPerYear } from '../sim/config.ts';

export interface ForestNode {
  id: EntityId;
  name: string;
  surname: string;
  sex: 'male' | 'female';
  alive: boolean;
  color: string;
  gen: number;          // generation depth (0 = a founder with no known parents)
  col: number;          // ordered slot within the generation row
  bornYear: number;
  diedYear: number | null;
  parents: EntityId[];  // filtered to souls present in the forest
  children: EntityId[];
  partner: EntityId | null;
}

export interface Forest {
  nodes: ForestNode[];
  byId: Map<EntityId, ForestNode>;
  couples: [EntityId, EntityId][];  // partner pairs, each once (lower id first)
  generations: number;              // number of generation rows
  width: number;                    // widest generation (max col + 1)
}

// A small fixed palette; surnames hash into it so each family is consistently coloured — living &
// dead alike (the tombstone has no clan id, so the surname is the shared key). Matching a live
// clan's own colour is a later refinement.
const FAMILY_PALETTE = [
  '#e6c07a', '#6fc3c9', '#d68fae', '#8fbf6a', '#c79bd0', '#e0915a', '#7fa6e0', '#d9c15a',
  '#6cc7a0', '#e07a7a', '#9ab0c0', '#c9a26a', '#7ad0c0', '#bf8fd0', '#a0c97a', '#e09ac0',
];

function surnameColor(surname: string): string {
  let h = 0;
  for (let i = 0; i < surname.length; i++) h = (h * 31 + surname.charCodeAt(i)) >>> 0;
  return FAMILY_PALETTE[h % FAMILY_PALETTE.length];
}
function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length ? parts[parts.length - 1] : name;
}

export function buildForest(world: World, cfg: SimConfig): Forest {
  const tpy = ticksPerYear(cfg);
  const clockEnts = world.query(C_CLOCK);
  const now = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  const yearOf = (t: number) => Math.floor(t / tpy);

  // ── 1. Collect every soul (living agents + the buried) ──
  const byId = new Map<EntityId, ForestNode>();
  for (const e of world.query(C_AGENT)) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    const surname = a.surname ?? surnameOf(a.name);
    byId.set(e, {
      id: e, name: a.name, surname, sex: a.sex, alive: true, color: surnameColor(surname),
      gen: 0, col: 0, bornYear: yearOf(now - a.ticksAlive), diedYear: null,
      parents: [...(lin?.parents ?? [])], children: [...(lin?.children ?? [])], partner: lin?.partner ?? null,
    });
  }
  for (const e of world.query(C_TOMBSTONE)) {
    const t = world.getComponent<Tombstone>(e, C_TOMBSTONE)!;
    const surname = surnameOf(t.name);
    byId.set(e, {
      id: e, name: t.name, surname, sex: t.sex, alive: false, color: surnameColor(surname),
      gen: 0, col: 0, bornYear: yearOf(t.bornTick), diedYear: yearOf(t.diedTick),
      parents: [...t.parents], children: [...t.children], partner: t.partner,
    });
  }

  // ── 2. Keep only references that resolve to a soul in the set ──
  for (const n of byId.values()) {
    n.parents = n.parents.filter(p => byId.has(p));
    n.children = n.children.filter(c => byId.has(c));
    if (n.partner !== null && !byId.has(n.partner)) n.partner = null;
  }
  const nodes = [...byId.values()];

  // ── 3. Generation depth: founder = 0, child = max(parent gen)+1 (memoised, cycle-guarded) ──
  const genCache = new Map<EntityId, number>();
  const computing = new Set<EntityId>();
  const genOf = (id: EntityId): number => {
    const cached = genCache.get(id);
    if (cached !== undefined) return cached;
    if (computing.has(id)) return 0;          // defensive against a malformed cycle
    computing.add(id);
    const n = byId.get(id)!;
    const g = n.parents.length ? Math.max(...n.parents.map(genOf)) + 1 : 0;
    computing.delete(id);
    genCache.set(id, g);
    return g;
  };
  for (const n of nodes) n.gen = genOf(n.id);
  const generations = nodes.length ? Math.max(...nodes.map(n => n.gen)) + 1 : 0;

  // ── 4. Order each generation: cluster families, keep couples adjacent, place children under
  // their parents (a barycentre pass over the already-ordered parent generation). ──
  const byGen: ForestNode[][] = Array.from({ length: generations }, () => []);
  for (const n of nodes) byGen[n.gen].push(n);

  const surnameOrder = new Map<string, number>();
  let so = 0;
  for (const n of nodes) if (!surnameOrder.has(n.surname)) surnameOrder.set(n.surname, so++);

  for (let g = 0; g < generations; g++) {
    const bary = (n: ForestNode): number => {
      if (g === 0 || n.parents.length === 0) return surnameOrder.get(n.surname)! * 1000;  // founders cluster by family
      const cols = n.parents.map(p => byId.get(p)!.col);
      return cols.reduce((a, b) => a + b, 0) / cols.length;
    };
    const placed = new Set<EntityId>();
    const units: ForestNode[][] = [];
    for (const n of [...byGen[g]].sort((a, b) => bary(a) - bary(b) || a.id - b.id)) {
      if (placed.has(n.id)) continue;
      const partner = n.partner !== null ? byId.get(n.partner) : undefined;
      if (partner && partner.gen === g && !placed.has(partner.id)) {
        units.push(n.sex === 'male' ? [n, partner] : [partner, n]);   // ♂ left · ♀ right
        placed.add(n.id); placed.add(partner.id);
      } else { units.push([n]); placed.add(n.id); }
    }
    units.sort((u, v) =>
      u.reduce((s, n) => s + bary(n), 0) / u.length - v.reduce((s, n) => s + bary(n), 0) / v.length);
    let col = 0;
    for (const u of units) for (const n of u) n.col = col++;
  }
  const width = nodes.length ? Math.max(...nodes.map(n => n.col)) + 1 : 0;

  // ── 5. Couples (each pair once) ──
  const couples: [EntityId, EntityId][] = [];
  const seen = new Set<EntityId>();
  for (const n of nodes) {
    if (n.partner !== null && !seen.has(n.id)) {
      couples.push(n.id < n.partner ? [n.id, n.partner] : [n.partner, n.id]);
      seen.add(n.id); seen.add(n.partner);
    }
  }

  return { nodes, byId, couples, generations, width };
}

// A soul's whole bloodline: their ancestors + descendants + self, plus everyone's partner (so
// couples stay together). Used by the family-forest "focus this person" filter (M35 s2).
export function bloodline(f: Forest, id: EntityId): Set<EntityId> {
  const set = new Set<EntityId>();
  const up = [id];
  while (up.length) { const c = up.pop()!; if (set.has(c) || !f.byId.has(c)) continue; set.add(c); for (const p of f.byId.get(c)!.parents) up.push(p); }
  const down = [id]; const seen = new Set<EntityId>();
  while (down.length) { const c = down.pop()!; if (seen.has(c) || !f.byId.has(c)) continue; seen.add(c); set.add(c); for (const k of f.byId.get(c)!.children) down.push(k); }
  for (const nid of [...set]) { const p = f.byId.get(nid)!.partner; if (p !== null && f.byId.has(p)) set.add(p); }
  return set;
}

// The souls in a still-living line: every living soul + all their ancestors (+ partners) — i.e.
// the lines that haven't died out. Used by the "living lines only" filter (M35 s2).
export function livingLines(f: Forest): Set<EntityId> {
  const set = new Set<EntityId>();
  for (const n of f.nodes) if (n.alive) {
    const up = [n.id];
    while (up.length) { const c = up.pop()!; if (set.has(c)) continue; set.add(c); for (const p of f.byId.get(c)!.parents) up.push(p); }
  }
  for (const nid of [...set]) { const p = f.byId.get(nid)!.partner; if (p !== null && f.byId.has(p)) set.add(p); }
  return set;
}
