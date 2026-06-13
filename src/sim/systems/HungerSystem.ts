import type { World } from '../ecs.ts';
import { C_NEEDS, C_AGENT, C_SPECIES } from '../components.ts';
import type { Needs, SpeciesComp } from '../components.ts';
import type { SimConfig } from '../config.ts';

// Sapient needs decay; agents whose hunger bottoms out die. (Flora growth is the
// FloraSystem's job now — food is no longer an abstract regenerating amount.)
export function runHungerSystem(world: World, cfg: SimConfig): void {
  const baseHunger = cfg.hungerDecayPerDay / cfg.ticksPerDay;
  const baseEnergy = cfg.energyDecayPerDay / cfg.ticksPerDay;

  const agents = world.query(C_AGENT, C_NEEDS);
  const toKill: number[] = [];

  for (const entity of agents) {
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;
    // Per-species decay multipliers (default 1 if no species component).
    const species = world.getComponent<SpeciesComp>(entity, C_SPECIES);
    const hMult = species?.hungerMult ?? 1;
    const eMult = species?.energyMult ?? 1;

    needs.hunger = Math.max(0, needs.hunger - baseHunger * hMult);
    needs.energy = Math.max(0, needs.energy - baseEnergy * eMult);

    if (needs.hunger <= 0) toKill.push(entity);
  }

  // Destroy after iterating to avoid mutating the query result mid-loop.
  for (const entity of toKill) world.destroyEntity(entity);
}
