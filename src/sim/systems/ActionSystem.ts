import type { World } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_JOB, C_WALLET, C_MEMORY } from '../components.ts';
import type { Agent, Needs, Job, Wallet, Memory } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';

// Once an agent starts restoring a survival need, it commits until the need climbs
// back to here — hysteresis, so folk sleep/eat in long stretches instead of flipping
// sleep↔work every tick right at the threshold (the observed jitter).
const RESTED = 0.85;

// Utility action selection (every tick, pure code, no LLM). Priority: survival
// (hunger/energy) → company (social) → a livelihood (adults work toward their
// wealth goal) → wander. Children just live until they come of age.
export function runActionSystem(world: World, cfg: SimConfig): void {
  for (const entity of world.query(C_AGENT, C_NEEDS)) {
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;

    agent.ticksAlive += 1;

    // Stick with an in-progress restore until well-restored — unless the OTHER
    // survival need has itself gone urgent (then re-evaluate below).
    if (agent.action === 'sleep' && needs.energy < RESTED && needs.hunger >= cfg.actionThreshold) continue;
    if (agent.action === 'seek_food' && needs.hunger < RESTED && needs.energy >= cfg.actionThreshold) continue;

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

    // Comfortable: adults work if employed and below their wealth goal, else wander.
    // Their distilled life-purpose (D26) bends the goal: a vow to provide for family /
    // make something of themselves makes them strive harder; grief pulls them back.
    const adult = ageInYears(agent.ticksAlive, cfg) >= cfg.adultAgeYears;
    const job = world.getComponent<Job>(entity, C_JOB);
    const wallet = world.getComponent<Wallet>(entity, C_WALLET);
    const purpose = world.getComponent<Memory>(entity, C_MEMORY)?.purpose ?? 0;
    const goal = agent.wealthGoal * (1 + 0.5 * purpose);
    if (adult && job && wallet && wallet.gold < goal) {
      agent.action = 'work';
    } else {
      agent.action = 'wander';
    }
  }
}
