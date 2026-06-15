import type { World } from './ecs.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';
import type { SimConfig } from './config.ts';
import type { Content } from '../content/loader.ts';
import { runClockSystem }    from './systems/ClockSystem.ts';
import { runFloraSystem }    from './systems/FloraSystem.ts';
import { runResourceSystem } from './systems/ResourceSystem.ts';
import { runHungerSystem }   from './systems/HungerSystem.ts';
import { runCapabilitySystem } from './systems/CapabilitySystem.ts';
import { runActionSystem }   from './systems/ActionSystem.ts';
import { runMovementSystem } from './systems/MovementSystem.ts';
import { runGatherSystem }   from './systems/GatherSystem.ts';
import { runEconomySystem }  from './systems/EconomySystem.ts';
import { runSocialSystem }   from './systems/SocialSystem.ts';
import { runReproductionSystem } from './systems/ReproductionSystem.ts';
import { runHealthSystem }   from './systems/HealthSystem.ts';
import { runAISystem }       from './systems/AISystem.ts';
import { runMemorySystem }   from './systems/MemorySystem.ts';
import { runFaunaSystem }    from './systems/FaunaSystem.ts';
import type { AIProvider } from '../ai/provider.ts';
import { stubProvider } from '../ai/stubProvider.ts';

// System execution order is fixed and deterministic. The world (flora/resources)
// updates first, then sapient agents act, then fauna act on the resulting world.
// `provider` defaults to the deterministic stub, so headless runs stay reproducible.
export function tick(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content,
  provider: AIProvider = stubProvider,
): void {
  runClockSystem(world, cfg, clockEntity);
  runFloraSystem(world, cfg, rng);       // flora grow/spread (no brain)
  runResourceSystem(world);              // resources regrow (no brain)
  runHungerSystem(world, cfg);           // sapient needs decay / starvation
  runCapabilitySystem(world, cfg, content); // magic: mana regen + casting (rare)
  runActionSystem(world, cfg);           // sapient utility action choice
  runMovementSystem(world, cfg, rng, content); // sapient movement / forage / commute / socialise / gather
  runGatherSystem(world, cfg);           // deplete resource nodes being worked
  runEconomySystem(world, cfg);          // hiring, wages, cost of living
  runSocialSystem(world, cfg, rng);      // relationships, social need, courtship → marriage
  runReproductionSystem(world, cfg, rng, content); // births → children + lineage
  runHealthSystem(world, cfg, rng);      // illness, ageing, death → tombstones
  runAISystem(world, cfg, provider);     // the "soul": reflection / dialogue / dreams / decisions (rare)
  runMemorySystem(world, cfg);           // multi-resolution rollup: old memories → episodic summaries
  runFaunaSystem(world, cfg, rng);       // fauna instinct (graze / breed / die)
}

export function runTicks(
  world: World, rng: RNG, cfg: SimConfig, clockEntity: EntityId, content: Content, n: number,
  provider: AIProvider = stubProvider,
): void {
  for (let i = 0; i < n; i++) tick(world, rng, cfg, clockEntity, content, provider);
}
