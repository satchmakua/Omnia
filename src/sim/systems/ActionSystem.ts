import type { World } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_JOB, C_WALLET } from '../components.ts';
import type { Agent, Needs, Job, Wallet } from '../components.ts';
import type { SimConfig } from '../config.ts';

// Utility action selection (every tick, pure code, no LLM). Survival comes first:
// hunger and energy outrank money. When comfortable and employed but short of
// their personal wealth goal, agents go to work; otherwise they wander.
export function runActionSystem(world: World, cfg: SimConfig): void {
  for (const entity of world.query(C_AGENT, C_NEEDS)) {
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;

    agent.ticksAlive += 1;

    // Survival needs dominate only when genuinely urgent (below the threshold);
    // otherwise the agent is free to work or wander. A higher gate would starve
    // earning time and push the poorest into runaway debt.
    if (needs.hunger < cfg.actionThreshold || needs.energy < cfg.actionThreshold) {
      agent.action = (1 - needs.hunger) >= (1 - needs.energy) ? 'seek_food' : 'sleep';
      continue;
    }

    // Comfortable: work if employed and below the wealth goal, else wander.
    const job = world.getComponent<Job>(entity, C_JOB);
    const wallet = world.getComponent<Wallet>(entity, C_WALLET);
    if (job && wallet && wallet.gold < agent.wealthGoal) {
      agent.action = 'work';
    } else {
      agent.action = 'wander';
    }
  }
}
