import type { World } from './ecs.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { SimConfig } from './config.ts';
import type { Content } from '../content/loader.ts';
import { runClockSystem }    from './systems/ClockSystem.ts';
import { runHungerSystem }   from './systems/HungerSystem.ts';
import { runActionSystem }   from './systems/ActionSystem.ts';
import { runMovementSystem } from './systems/MovementSystem.ts';

// System execution order is fixed and deterministic.
export function tick(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content,
): void {
  runClockSystem(world, cfg, clockEntity);
  runHungerSystem(world, cfg);
  runActionSystem(world, cfg);
  runMovementSystem(world, cfg, rng, content);
}

export function runTicks(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content, n: number,
): void {
  for (let i = 0; i < n; i++) tick(world, rng, cfg, clockEntity, content);
}
