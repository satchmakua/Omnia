// A spatial hash grid over tile positions — the perception substrate (M8).
//
// Agents need to find the nearest food / kin / resource / hostile cheaply; the old
// movement code did O(n) linear scans every tick, which won't survive a 10–20× map
// with thousands of agents. Rebuilt each tick from world state (like the occupancy
// grid), this answers "nearest entry matching P" and "all within radius R" by
// expanding only the tiles it needs. A*, the big map, LOD, and combat targeting all
// build on it.
//
// Tile-granular for now (one bucket per occupied tile); coarser cells are a later
// optimization that won't change this API. **`nearest` reproduces the previous linear
// scans exactly** — globally closest by Manhattan distance, ties broken by INSERTION
// order — so swapping it in preserves the deterministic trajectory.

export interface SpatialEntry {
  x: number;
  y: number;
  id: number;   // an EntityId (or any caller-chosen tag)
  seq: number;  // insertion order, for deterministic tie-breaking
}

export class SpatialGrid {
  private readonly buckets = new Map<number, SpatialEntry[]>();
  private count = 0;

  constructor(private readonly width: number, private readonly height: number) {}

  private key(x: number, y: number): number {
    return y * this.width + x;
  }

  insert(x: number, y: number, id: number): void {
    const e: SpatialEntry = { x, y, id, seq: this.count++ };
    const k = this.key(x, y);
    const b = this.buckets.get(k);
    if (b) b.push(e); else this.buckets.set(k, [e]);
  }

  clear(): void {
    this.buckets.clear();
    this.count = 0;
  }

  /** Total entries inserted. */
  get size(): number {
    return this.count;
  }

  /** Entries on exactly tile (x, y), in insertion order. */
  at(x: number, y: number): SpatialEntry[] {
    return this.buckets.get(this.key(x, y)) ?? [];
  }

  // Nearest entry to (x, y) satisfying `accept` (default: any), by Manhattan
  // distance, ties broken by insertion order. Expands square rings outward and stops
  // once no farther tile could beat the best found — the global minimum is guaranteed
  // because every ring r holds only tiles at Manhattan distance ≥ r. Returns null if
  // nothing matches anywhere on the map.
  nearest(x: number, y: number, accept?: (id: number) => boolean): SpatialEntry | null {
    let best: SpatialEntry | null = null;
    let bestDist = Infinity;
    const maxRing = this.width + this.height; // covers the whole map
    for (let r = 0; r <= maxRing; r++) {
      if (r > bestDist) break; // ring r tiles are all ≥ r away — can't beat best
      this.forRing(x, y, r, (e) => {
        if (accept && !accept(e.id)) return;
        const d = Math.abs(e.x - x) + Math.abs(e.y - y);
        if (d < bestDist || (d === bestDist && (best === null || e.seq < best.seq))) {
          bestDist = d;
          best = e;
        }
      });
    }
    return best;
  }

  // All entries within Manhattan distance `radius` of (x, y), nearest-ring-first then
  // insertion order. For perception of multiple targets (social clusters, combat AoE).
  within(x: number, y: number, radius: number): SpatialEntry[] {
    const out: SpatialEntry[] = [];
    for (let r = 0; r <= radius; r++) {
      this.forRing(x, y, r, (e) => {
        if (Math.abs(e.x - x) + Math.abs(e.y - y) <= radius) out.push(e);
      });
    }
    return out;
  }

  // Visit every entry on the square ring at Chebyshev distance r from (cx, cy),
  // clipped to the map. Iteration order within a ring is deterministic but
  // irrelevant to results (callers tie-break by seq / filter by Manhattan).
  private forRing(cx: number, cy: number, r: number, cb: (e: SpatialEntry) => void): void {
    if (r === 0) {
      this.visit(cx, cy, cb);
      return;
    }
    const x0 = cx - r, x1 = cx + r, y0 = cy - r, y1 = cy + r;
    for (let x = x0; x <= x1; x++) {
      this.visit(x, y0, cb);   // top edge
      this.visit(x, y1, cb);   // bottom edge
    }
    for (let y = y0 + 1; y <= y1 - 1; y++) {
      this.visit(x0, y, cb);   // left edge (corners already covered above)
      this.visit(x1, y, cb);   // right edge
    }
  }

  private visit(x: number, y: number, cb: (e: SpatialEntry) => void): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const b = this.buckets.get(this.key(x, y));
    if (b) for (const e of b) cb(e);
  }
}
