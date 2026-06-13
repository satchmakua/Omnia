import type { World } from './ecs.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { SimConfig } from './config.ts';
import type { Content } from '../content/loader.ts';
import { runClockSystem }    from './systems/ClockSystem.ts';
import { runFloraSystem }    from './systems/FloraSystem.ts';
import { runResourceSystem } from './systems/ResourceSystem.ts';
import { runHungerSystem }   from './systems/HungerSystem.ts';
import { runActionSystem }   from './systems/ActionSystem.ts';
import { runMovementSystem } from './systems/MovementSystem.ts';
import { runEconomySystem }  from './systems/EconomySystem.ts';
import { runFaunaSystem }    from './systems/FaunaSystem.ts';

// System execution order is fixed and deterministic. The world (flora/resources)
// updates first, then sapient agents act, then fauna act on the resulting world.
export function tick(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content,
): void {
  runClockSystem(world, cfg, clockEntity);
  runFloraSystem(world, cfg, rng);       // flora grow/spread (no brain)
  runResourceSystem(world);              // resources regrow (no brain)
  runHungerSystem(world, cfg);           // sapient needs decay / starvation
  runActionSystem(world, cfg);           // sapient utility action choice
  runMovementSystem(world, cfg, rng, content); // sapient movement / forage / commute
  runEconomySystem(world, cfg);          // hiring, wages, cost of living
  runFaunaSystem(world, cfg, rng);       // fauna instinct (graze / breed / die)
}

export function runTicks(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content, n: number,
): void {
  for (let i = 0; i < n; i++) tick(world, rng, cfg, clockEntity, content);
}
