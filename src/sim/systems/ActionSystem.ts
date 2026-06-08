import type { World } from '../ecs.ts';
import { C_AGENT, C_NEEDS } from '../components.ts';
import type { Agent, Needs, AgentAction } from '../components.ts';
import type { SimConfig } from '../config.ts';

export function runActionSystem(world: World, cfg: SimConfig): void {
  for (const entity of world.query(C_AGENT, C_NEEDS)) {
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;

    agent.ticksAlive += 1;

    // When all needs are comfortable, just wander.
    if (needs.hunger > 0.7 && needs.energy > 0.7) {
      agent.action = 'wander';
      continue;
    }

    // Utility: score rises as the need falls (lower value = more urgent).
    const scoreFood  = 1 - needs.hunger;
    const scoreSleep = 1 - needs.energy;

    let action: AgentAction;
    if (scoreFood >= scoreSleep) {
      action = 'seek_food';
    } else {
      action = 'sleep';
    }

    agent.action = action;
  }
}
