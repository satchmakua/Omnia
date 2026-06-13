// Shared grid-movement helpers used by both the sapient MovementSystem and the
// instinct FaunaSystem, so the "step toward a target around impassable terrain"
// logic lives in exactly one place.
import { isPassable } from '../../world/tilemap.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import type { Position } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';

export type Enterable = (x: number, y: number) => boolean;

const DIRS = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
  { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
] as const;

// A tile is enterable if in bounds and (no map, or the map marks it passable).
export function makeEnterable(cfg: SimConfig, map: TileMapData | undefined): Enterable {
  return (x, y) => {
    if (x < 0 || x >= cfg.gridWidth || y < 0 || y >= cfg.gridHeight) return false;
    return map ? isPassable(map, x, y) : true;
  };
}

// Random one-cell step onto an enterable neighbour; stays put if hemmed in.
export function wanderStep(pos: Position, rng: RNG, enterable: Enterable): void {
  const dir = DIRS[Math.floor(rng() * DIRS.length)];
  const nx = pos.x + dir.dx;
  const ny = pos.y + dir.dy;
  if (enterable(nx, ny)) { pos.x = nx; pos.y = ny; }
}

// Step one cell toward (tx,ty), preferring the larger axis. If terrain blocks
// the preferred axis, try the other; if both are blocked, wander to unstick.
export function stepToward(
  pos: Position, tx: number, ty: number, rng: RNG, enterable: Enterable,
): void {
  const dx = tx - pos.x;
  const dy = ty - pos.y;
  if (dx === 0 && dy === 0) return;

  const stepX = { x: pos.x + Math.sign(dx), y: pos.y };
  const stepY = { x: pos.x, y: pos.y + Math.sign(dy) };

  const candidates: Position[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) candidates.push(stepX);
    if (dy !== 0) candidates.push(stepY);
  } else {
    if (dy !== 0) candidates.push(stepY);
    if (dx !== 0) candidates.push(stepX);
  }

  const step = candidates.find(c => enterable(c.x, c.y));
  if (step) { pos.x = step.x; pos.y = step.y; }
  else wanderStep(pos, rng, enterable);
}
