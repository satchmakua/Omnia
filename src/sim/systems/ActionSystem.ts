import type { World } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_JOB, C_WALLET } from '../components.ts';
import type { Agent, Needs, Job, Wallet } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';

// Utility action selection (every tick, pure code, no LLM). Priority: survival
// (hunger/energy) → company (social) → a livelihood (adults work toward their
// wealth goal) → wander. Children just live until they come of age.
export function runActionSystem(world: World, cfg: SimConfig): void {
  for (const entity of world.query(C_AGENT, C_NEEDS)) {
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;

    agent.ticksAlive += 1;

    // Survival needs dominate only when genuinely urgent (below the threshold);
    // otherwise the agent is free to socialise, work, or wander. A higher gate
    // would starve earning time and push the poorest into runaway debt.
    if (needs.hunger < cfg.actionThreshold || needs.energy < cfg.actionThreshold) {
      agent.action = (1 - needs.hunger) >= (1 - needs.energy) ? 'seek_food' : 'sleep';
      continue;
    }

    if (needs.social < cfg.actionThreshold) {
      agent.action = 'socialize';
      continue;
    }

    // Comfortable: adults work if employed and below the wealth goal, else wander.
    const adult = ageInYears(agent.ticksAlive, cfg) >= cfg.adultAgeYears;
    const job = world.getComponent<Job>(entity, C_JOB);
    const wallet = world.getComponent<Wallet>(entity, C_WALLET);
    if (adult && job && wallet && wallet.gold < agent.wealthGoal) {
      agent.action = 'work';
    } else {
      agent.action = 'wander';
    }
  }
}
