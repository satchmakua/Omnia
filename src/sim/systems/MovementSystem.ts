import type { World } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_FOOD, C_TILEMAP } from '../components.ts';
import type { Agent, Needs, Position, Food } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { invokeCapability } from '../../capability/invoke.ts';
import { isPassable } from '../../world/tilemap.ts';
import type { TileMapData } from '../../world/tilemap.ts';

const DIRS = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
  { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
] as const;

export function runMovementSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const foodEntities = world.query(C_FOOD, C_POSITION);
  const forage = content.capabilities.require('forage');

  // Singleton terrain grid (optional: systems still work if absent, treating
  // the whole grid as passable).
  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;

  // A tile is enterable if it's in bounds and (no map, or the map says passable).
  const enterable = (x: number, y: number): boolean => {
    if (x < 0 || x >= cfg.gridWidth || y < 0 || y >= cfg.gridHeight) return false;
    return map ? isPassable(map, x, y) : true;
  };

  for (const entity of world.query(C_AGENT, C_NEEDS, C_POSITION)) {
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;
    const pos   = world.getComponent<Position>(entity, C_POSITION)!;
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;

    if (agent.action === 'sleep') {
      needs.energy = Math.min(1.0, needs.energy + cfg.sleepRestorePerTick);
      continue;
    }

    if (agent.action === 'seek_food') {
      let nearestId = -1;
      let minDist = Infinity;

      for (const fid of foodEntities) {
        const food = world.getComponent<Food>(fid, C_FOOD)!;
        if (food.amount <= 0) continue;
        const fp = world.getComponent<Position>(fid, C_POSITION)!;
        const d = Math.abs(fp.x - pos.x) + Math.abs(fp.y - pos.y);
        if (d < minDist) { minDist = d; nearestId = fid; }
      }

      if (nearestId >= 0) {
        if (minDist === 0) {
          // Eat by invoking the forage capability: data declares the effect
          // (restore_hunger) and its power; the bite is capped by available food.
          const food = world.getComponent<Food>(nearestId, C_FOOD)!;
          const bite = Math.min(food.amount, forage.power);
          food.amount -= bite;
          invokeCapability(forage, { needs }, bite);
        } else {
          // Step toward the food. Build candidate steps on each axis with a
          // nonzero delta, preferring the larger axis. Take the first enterable
          // one; if terrain blocks all of them, wander to unstick.
          const fp = world.getComponent<Position>(nearestId, C_POSITION)!;
          const dx = fp.x - pos.x;
          const dy = fp.y - pos.y;
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
          else wander(pos, rng, enterable);
        }
        continue;
      }
      // No food available — fall through to wander.
    }

    wander(pos, rng, enterable);
  }
}

// Random one-cell step onto an enterable neighbour; stays put if hemmed in.
function wander(pos: Position, rng: RNG, enterable: (x: number, y: number) => boolean): void {
  const dir = DIRS[Math.floor(rng() * DIRS.length)];
  const nx = pos.x + dir.dx;
  const ny = pos.y + dir.dy;
  if (enterable(nx, ny)) { pos.x = nx; pos.y = ny; }
}
