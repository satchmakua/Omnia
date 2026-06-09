import type { World } from '../ecs.ts';
import { C_NEEDS, C_AGENT, C_SPECIES, C_FOOD } from '../components.ts';
import type { Needs, SpeciesComp, Food } from '../components.ts';
import type { SimConfig } from '../config.ts';

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

  // Regenerate food sources.
  for (const entity of world.query(C_FOOD)) {
    const food = world.getComponent<Food>(entity, C_FOOD)!;
    food.amount = Math.min(1.0, food.amount + food.regenPerTick);
  }
}
