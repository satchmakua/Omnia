// Brain tiers (WORLD_AND_ENVIRONMENT / DECISIONS D10) — an inviolable performance
// invariant, made concrete here. What a thing *is* determines how much brain it
// gets and therefore which systems touch it:
//
//   sapient  (C_AGENT)    full brain: utility action + movement + (later) the rare
//                         LLM "soul". Driven by ActionSystem + MovementSystem.
//   fauna    (C_FAUNA)    instinct-only: a small utility brain. NO LLM, EVER.
//                         Driven by FaunaSystem.
//   flora    (C_FLORA)    no brain: rule-driven state. FloraSystem (grow/spread).
//   resource (C_RESOURCE) no brain: rule-driven state. ResourceSystem (regen).
//
// The tiers are mutually exclusive component markers, so the LLM layer (M5) can
// only ever attach to C_AGENT entities — fauna are structurally excluded.
import type { World, EntityId } from './ecs.ts';
import { C_AGENT, C_FAUNA, C_FLORA, C_RESOURCE } from './components.ts';

export type BrainTier = 'sapient' | 'fauna' | 'none';

export function brainTier(world: World, e: EntityId): BrainTier {
  if (world.hasComponent(e, C_AGENT)) return 'sapient';
  if (world.hasComponent(e, C_FAUNA)) return 'fauna';
  return 'none'; // flora, resources, singletons
}

// True only for entities the LLM "soul" may ever attach to.
export function isSapient(world: World, e: EntityId): boolean {
  return world.hasComponent(e, C_AGENT);
}

// Sanity guard usable in tests: no entity carries two brain tiers at once.
export function hasSingleTier(world: World, e: EntityId): boolean {
  const n = (world.hasComponent(e, C_AGENT) ? 1 : 0)
          + (world.hasComponent(e, C_FAUNA) ? 1 : 0)
          + (world.hasComponent(e, C_FLORA) ? 1 : 0)
          + (world.hasComponent(e, C_RESOURCE) ? 1 : 0);
  return n <= 1;
}
