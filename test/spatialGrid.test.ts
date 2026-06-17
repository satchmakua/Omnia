import { describe, it, expect } from 'vitest';
import { SpatialGrid } from '../src/sim/spatialGrid.ts';
import { createRNG } from '../src/sim/rng.ts';

describe('SpatialGrid basics', () => {
  it('inserts, reports size, looks up a tile, and clears', () => {
    const g = new SpatialGrid(10, 10);
    g.insert(2, 3, 100);
    g.insert(2, 3, 101); // same tile
    g.insert(5, 5, 102);
    expect(g.size).toBe(3);
    expect(g.at(2, 3).map(e => e.id)).toEqual([100, 101]); // insertion order
    expect(g.at(9, 9)).toEqual([]);
    g.clear();
    expect(g.size).toBe(0);
    expect(g.at(2, 3)).toEqual([]);
  });
});

describe('SpatialGrid.nearest', () => {
  it('returns null when empty', () => {
    expect(new SpatialGrid(8, 8).nearest(0, 0)).toBeNull();
  });

  it('uses Manhattan distance (a tile 3 away beats one 4 away even if fewer rings)', () => {
    const g = new SpatialGrid(20, 20);
    g.insert(3, 0, 1);  // Manhattan 3 from origin (Chebyshev 3)
    g.insert(2, 2, 2);  // Manhattan 4 from origin (Chebyshev 2)
    expect(g.nearest(0, 0)!.id).toBe(1);
  });

  it('breaks ties by insertion order', () => {
    const g = new SpatialGrid(20, 20);
    g.insert(1, 0, 10); // dist 1
    g.insert(0, 1, 11); // dist 1 (tie) — inserted later
    expect(g.nearest(0, 0)!.id).toBe(10);
  });

  it('honours an accept predicate', () => {
    const g = new SpatialGrid(20, 20);
    g.insert(1, 0, 1);
    g.insert(2, 0, 2);
    expect(g.nearest(0, 0, id => id !== 1)!.id).toBe(2);
  });

  it('finds a far point when it is the only one (clips to map bounds)', () => {
    const g = new SpatialGrid(30, 30);
    g.insert(29, 29, 7);
    expect(g.nearest(0, 0)!.id).toBe(7);
  });

  it('matches a brute-force linear scan over many points and queries', () => {
    const W = 40, H = 30, rng = createRNG(123);
    const pts: { x: number; y: number; id: number }[] = [];
    for (let i = 0; i < 60; i++) pts.push({ x: Math.floor(rng() * W), y: Math.floor(rng() * H), id: i });
    const grid = new SpatialGrid(W, H);
    for (const p of pts) grid.insert(p.x, p.y, p.id);

    // Brute force: first entry (insertion order) at the global minimum Manhattan distance.
    const brute = (qx: number, qy: number, accept?: (id: number) => boolean): number => {
      let best = -1, bestD = Infinity;
      for (const p of pts) {
        if (accept && !accept(p.id)) continue;
        const d = Math.abs(p.x - qx) + Math.abs(p.y - qy);
        if (d < bestD) { bestD = d; best = p.id; }
      }
      return best;
    };

    for (let q = 0; q < 300; q++) {
      const qx = Math.floor(rng() * W), qy = Math.floor(rng() * H);
      expect(grid.nearest(qx, qy)?.id ?? -1).toBe(brute(qx, qy));
      const odd = (id: number) => id % 2 === 1;        // with a predicate too
      expect(grid.nearest(qx, qy, odd)?.id ?? -1).toBe(brute(qx, qy, odd));
    }
  });
});

describe('SpatialGrid.within', () => {
  it('returns every entry inside the Manhattan radius and nothing beyond', () => {
    const g = new SpatialGrid(20, 20);
    g.insert(5, 5, 0);   // centre (dist 0)
    g.insert(5, 7, 1);   // dist 2
    g.insert(8, 5, 2);   // dist 3
    g.insert(9, 9, 3);   // dist 8
    const ids = g.within(5, 5, 3).map(e => e.id).sort((a, b) => a - b);
    expect(ids).toEqual([0, 1, 2]);
  });
});
