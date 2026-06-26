import type { World } from '../ecs.ts';
import { C_NEEDS, C_AGENT, C_SPECIES, C_CLOCK } from '../components.ts';
import type { Needs, SpeciesComp, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import { killAgent } from '../death.ts';
import { emitEvent } from '../../history/eventlog.ts';

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

  // Starvation is a proper death — a tombstone (so lineage still resolves) with an honest
  // cause, not a silent removal. Done after iterating to avoid mutating the query mid-loop.
  if (toKill.length > 0) {
    const clockEnts = world.query(C_CLOCK);
    const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
    const tpy = ticksPerYear(cfg);
    for (const entity of toKill) {
      const tomb = killAgent(world, entity, tick, 'starvation', tpy);
      emitEvent(world, 'death', `${tomb.name} starved to death.`);
    }
  }
}
