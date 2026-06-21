import { describe, it, expect } from 'vitest';
import { findPath } from '../src/sim/pathfinding.ts';
import type { Enterable } from '../src/sim/systems/movementUtil.ts';

// An enterable gate over a small map with a set of blocked tiles (a "#,#" wall set).
function gridOf(width: number, height: number, walls: string[]): Enterable {
  const blocked = new Set(walls);
  return (x, y) => x >= 0 && x < width && y >= 0 && y < height && !blocked.has(`${x},${y}`);
}

const len = (p: { x: number; y: number }[] | null) => (p === null ? -1 : p.length);

describe('findPath (A*)', () => {
  it('returns an empty path when already at the goal', () => {
    expect(findPath(2, 2, 2, 2, 8, 8, gridOf(8, 8, []), 64)).toEqual([]);
  });

  it('finds the shortest path on open terrain (length = Manhattan distance)', () => {
    const path = findPath(0, 0, 3, 2, 8, 8, gridOf(8, 8, []), 64);
    expect(len(path)).toBe(5);                       // |3-0| + |2-0|
    expect(path![path!.length - 1]).toEqual({ x: 3, y: 2 }); // ends on the goal
    // every step is a single orthogonal move from the previous (start = 0,0)
    let prev = { x: 0, y: 0 };
    for (const s of path!) {
      expect(Math.abs(s.x - prev.x) + Math.abs(s.y - prev.y)).toBe(1);
      prev = s;
    }
  });

  it('routes around a wall a greedy stepper would stick on', () => {
    // A vertical wall x=2 for y=0..3, with a gap at y=4. Going (0,0)→(4,0) must detour
    // down to y=4, across, and back up: longer than the Manhattan distance of 4.
    const walls = ['2,0', '2,1', '2,2', '2,3'];
    const path = findPath(0, 0, 4, 0, 8, 8, walls.length ? gridOf(8, 8, walls) : gridOf(8, 8, []), 4096);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 0 });
    expect(len(path)).toBeGreaterThan(4);            // forced to go around the wall
    // the path never crosses a blocked tile
    for (const s of path!) expect(walls).not.toContain(`${s.x},${s.y}`);
  });

  it('returns null when the goal is walled off, and when the goal itself is blocked', () => {
    // Fully enclose (4,4) with a ring of walls.
    const walls = ['3,3','4,3','5,3','3,4','5,4','3,5','4,5','5,5'];
    expect(findPath(0, 0, 4, 4, 8, 8, gridOf(8, 8, walls), 4096)).toBeNull();
    expect(findPath(0, 0, 2, 2, 8, 8, gridOf(8, 8, ['2,2']), 4096)).toBeNull(); // goal unenterable
  });

  it('gives up (null) past the expansion budget', () => {
    // A reachable but far goal with a tiny budget can't be found.
    expect(findPath(0, 0, 9, 9, 12, 12, gridOf(12, 12, []), 3)).toBeNull();
  });

  it('is deterministic — identical inputs yield an identical path', () => {
    const walls = ['2,0', '2,1', '2,2', '2,3'];
    const a = findPath(0, 0, 5, 5, 8, 8, gridOf(8, 8, walls), 4096);
    const b = findPath(0, 0, 5, 5, 8, 8, gridOf(8, 8, walls), 4096);
    expect(a).toEqual(b);
  });
});
