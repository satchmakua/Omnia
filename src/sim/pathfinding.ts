// A* pathfinding for sapient movement (M8). Greedy `stepToward` walks one cell toward
// a target and gets stuck on concave terrain (a bay, a wall); A* routes around it.
//
// Planning is over **static terrain only** (the `Enterable` passability gate) — dynamic
// occupancy (other movers) is handled at step time, not in the plan, so paths don't
// thrash as crowds shift. 4-neighbour, unit cost, Manhattan heuristic (admissible ⇒
// shortest paths). Fully deterministic: the open set breaks ties by (f, then h, then
// tile index), and neighbours expand in a fixed order — no RNG, no Map-iteration
// dependence. Sparse (Map/Set keyed by tile index) so cost scales with the area
// explored, not the whole map — keeps it viable as the world grows.
import type { Position } from './components.ts';
import type { RNG } from './rng.ts';
import type { Enterable, Occupancy } from './systems/movementUtil.ts';
import { stepToward } from './systems/movementUtil.ts';

export interface PathStep { x: number; y: number; }

const DIRS = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
  { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
] as const;

interface HNode { i: number; x: number; y: number; f: number; h: number; }

function less(a: HNode, b: HNode): boolean {
  if (a.f !== b.f) return a.f < b.f;
  if (a.h !== b.h) return a.h < b.h;
  return a.i < b.i;
}

function heapPush(heap: HNode[], n: HNode): void {
  heap.push(n);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(heap[i], heap[p])) break;
    [heap[i], heap[p]] = [heap[p], heap[i]];
    i = p;
  }
}

function heapPop(heap: HNode[]): HNode {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length > 0) {
    heap[0] = last;
    const n = heap.length;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let s = i;
      if (l < n && less(heap[l], heap[s])) s = l;
      if (r < n && less(heap[r], heap[s])) s = r;
      if (s === i) break;
      [heap[i], heap[s]] = [heap[s], heap[i]];
      i = s;
    }
  }
  return top;
}

// The shortest path from (sx,sy) to (gx,gy) over enterable terrain, as the list of
// steps **after** the start up to and including the goal. Returns `[]` when already at
// the goal, or `null` if the goal is unreachable within `maxExpansions` (or unenterable).
export function findPath(
  sx: number, sy: number, gx: number, gy: number,
  width: number, height: number, enterable: Enterable, maxExpansions: number,
): PathStep[] | null {
  if (sx === gx && sy === gy) return [];
  if (!enterable(gx, gy)) return null;

  const idx = (x: number, y: number) => y * width + x;
  const goalI = idx(gx, gy);
  const h = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);

  const g = new Map<number, number>([[idx(sx, sy), 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const heap: HNode[] = [];
  heapPush(heap, { i: idx(sx, sy), x: sx, y: sy, f: h(sx, sy), h: h(sx, sy) });

  let expansions = 0;
  while (heap.length > 0) {
    const cur = heapPop(heap);
    if (cur.i === goalI) return reconstruct(came, goalI, width);
    if (closed.has(cur.i)) continue;
    closed.add(cur.i);
    if (++expansions > maxExpansions) return null;

    const cg = g.get(cur.i)!;
    for (const d of DIRS) {
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      if (!enterable(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (closed.has(ni)) continue;
      const ng = cg + 1;
      const known = g.get(ni);
      if (known === undefined || ng < known) {
        g.set(ni, ng);
        came.set(ni, cur.i);
        const hn = h(nx, ny);
        heapPush(heap, { i: ni, x: nx, y: ny, f: ng + hn, h: hn });
      }
    }
  }
  return null;
}

function reconstruct(came: Map<number, number>, goalI: number, width: number): PathStep[] {
  const rev: number[] = [];
  let c: number | undefined = goalI;
  while (c !== undefined && came.has(c)) { rev.push(c); c = came.get(c); }
  const path: PathStep[] = [];
  for (let k = rev.length - 1; k >= 0; k--) path.push({ x: rev[k] % width, y: Math.floor(rev[k] / width) });
  return path;
}

// Take one step toward (tx,ty) along an A* route around terrain. If the next planned
// tile is momentarily occupied by another mover — or no route exists at all — fall
// back to the greedy `stepToward` for local avoidance / wandering, so dynamic
// collision behaviour (and its RNG use) is unchanged from before.
export function pathToward(
  pos: Position, tx: number, ty: number, rng: RNG, enterable: Enterable,
  occ: Occupancy | undefined, width: number, height: number,
  maxExpansions = width * height,
): void {
  if (pos.x === tx && pos.y === ty) return;
  const path = findPath(pos.x, pos.y, tx, ty, width, height, enterable, maxExpansions);
  const next = path && path.length > 0 ? path[0] : null;
  if (next && (!occ || !occ.occupied(next.x, next.y))) {
    if (occ) occ.move(pos.x, pos.y, next.x, next.y);
    pos.x = next.x; pos.y = next.y;
    return;
  }
  stepToward(pos, tx, ty, rng, enterable, occ);
}
