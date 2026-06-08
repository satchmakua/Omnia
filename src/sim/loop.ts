import type { World } from './ecs.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { SimConfig } from './config.ts';
import { runClockSystem }    from './systems/ClockSystem.ts';
import { runHungerSystem }   from './systems/HungerSystem.ts';
import { runActionSystem }   from './systems/ActionSystem.ts';
import { runMovementSystem } from './systems/MovementSystem.ts';

// System execution order is fixed and deterministic.
export function tick(world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId): void {
  runClockSystem(world, cfg, clockEntity);
  runHungerSystem(world, cfg);
  runActionSystem(world, cfg);
  runMovementSystem(world, cfg, rng);
}

export function runTicks(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, n: number,
): void {
  for (let i = 0; i < n; i++) tick(world, rng, cfg, clockEntity);
}
