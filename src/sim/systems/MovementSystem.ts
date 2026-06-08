import type { World } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_FOOD } from '../components.ts';
import type { Agent, Needs, Position, Food } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';

const DIRS = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
  { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
] as const;

export function runMovementSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const foodEntities = world.query(C_FOOD, C_POSITION);

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
          // Eat
          const food = world.getComponent<Food>(nearestId, C_FOOD)!;
          const bite = Math.min(food.amount, cfg.foodRestoreAmount);
          food.amount -= bite;
          needs.hunger = Math.min(1.0, needs.hunger + bite);
        } else {
          // Step one cell toward the food source.
          const fp = world.getComponent<Position>(nearestId, C_POSITION)!;
          const dx = fp.x - pos.x;
          const dy = fp.y - pos.y;
          if (Math.abs(dx) >= Math.abs(dy)) {
            pos.x = clampAxis(pos.x + Math.sign(dx), cfg.gridWidth);
          } else {
            pos.y = clampAxis(pos.y + Math.sign(dy), cfg.gridHeight);
          }
        }
        continue;
      }
      // No food available — fall through to wander.
    }

    // wander: random step
    const dir = DIRS[Math.floor(rng() * DIRS.length)];
    pos.x = clampAxis(pos.x + dir.dx, cfg.gridWidth);
    pos.y = clampAxis(pos.y + dir.dy, cfg.gridHeight);
  }
}

function clampAxis(v: number, max: number): number {
  return Math.max(0, Math.min(max - 1, v));
}
