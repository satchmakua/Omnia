// Shared grid-movement helpers used by both the sapient MovementSystem and the
// instinct FaunaSystem, so the "step toward a target around impassable terrain"
// logic lives in exactly one place. Movement also respects an optional Occupancy
// so two mobile creatures (folk or fauna) never stand on the same tile (M6.5).
import { isPassable } from '../../world/tilemap.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import type { World, EntityId } from '../ecs.ts';
import { C_POSITION } from '../components.ts';
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

// Tile occupancy of mobile creatures, by count (a tile may briefly hold more than
// one at world-gen; collision then spreads them out). Movers consult it to avoid
// stepping onto an occupied tile, and update it as they move.
export class Occupancy {
  private readonly counts = new Map<number, number>();
  constructor(private readonly width: number) {}
  private key(x: number, y: number): number { return y * this.width + x; }
  occupied(x: number, y: number): boolean { return (this.counts.get(this.key(x, y)) ?? 0) > 0; }
  add(x: number, y: number): void { const k = this.key(x, y); this.counts.set(k, (this.counts.get(k) ?? 0) + 1); }
  remove(x: number, y: number): void {
    const k = this.key(x, y); const c = (this.counts.get(k) ?? 0) - 1;
    if (c <= 0) this.counts.delete(k); else this.counts.set(k, c);
  }
  move(fx: number, fy: number, tx: number, ty: number): void { this.remove(fx, fy); this.add(tx, ty); }
}

// Build an occupancy map of every mobile creature currently in the world.
export function buildOccupancy(world: World, width: number, mobileMarkers: string[]): Occupancy {
  const occ = new Occupancy(width);
  const seen = new Set<EntityId>();
  for (const marker of mobileMarkers) {
    for (const e of world.query(marker, C_POSITION)) {
      if (seen.has(e)) continue;
      seen.add(e);
      const p = world.getComponent<Position>(e, C_POSITION)!;
      occ.add(p.x, p.y);
    }
  }
  return occ;
}

function steppable(x: number, y: number, enterable: Enterable, occ: Occupancy | undefined): boolean {
  return enterable(x, y) && (!occ || !occ.occupied(x, y));
}

// Random one-cell step onto a free enterable neighbour; stays put if hemmed in. With an
// `idleChance`, the wanderer simply lingers in place this tick (calmer, less restless motion).
// The single rng() draw is reused for both the idle roll and the direction (remapped), so
// `idleChance == 0` is byte-identical to the original behaviour (fauna / blocked-fallback).
export function wanderStep(pos: Position, rng: RNG, enterable: Enterable, occ?: Occupancy, idleChance = 0): void {
  const r = rng();
  if (r < idleChance) return;                               // linger this tick
  const u = idleChance > 0 ? (r - idleChance) / (1 - idleChance) : r;   // remap remaining range → [0,1)
  const dir = DIRS[Math.min(DIRS.length - 1, Math.floor(u * DIRS.length))];
  const nx = pos.x + dir.dx, ny = pos.y + dir.dy;
  if (steppable(nx, ny, enterable, occ)) {
    if (occ) occ.move(pos.x, pos.y, nx, ny);
    pos.x = nx; pos.y = ny;
  }
}

// Step one cell toward (tx,ty), preferring the larger axis. If terrain or another
// creature blocks the preferred axis, try the other; if both are blocked, wander.
export function stepToward(
  pos: Position, tx: number, ty: number, rng: RNG, enterable: Enterable, occ?: Occupancy,
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

  const step = candidates.find(c => steppable(c.x, c.y, enterable, occ));
  if (step) {
    if (occ) occ.move(pos.x, pos.y, step.x, step.y);
    pos.x = step.x; pos.y = step.y;
  } else {
    wanderStep(pos, rng, enterable, occ);
  }
}
