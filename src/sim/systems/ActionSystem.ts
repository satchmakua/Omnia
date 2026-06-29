import type { World } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_JOB, C_WALLET, C_MEMORY, C_PERSONALITY } from '../components.ts';
import type { Agent, Needs, Job, Wallet, Memory, Personality } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import { traitGoalFactor } from '../heredity.ts';

// Once an agent starts restoring a need, it commits until the need climbs back to
// here — hysteresis, so folk sleep/eat/relax in long stretches instead of flipping
// every tick right at the threshold (the observed jitter).
const RESTED = 0.85;
const REFRESHED = 0.85;   // leisure runs until fun climbs back to here

// Utility action selection (every tick, pure code, no LLM). Priority: survival
// (hunger/energy) → company (social) → leisure (fun) → a livelihood (adults work
// toward their wealth goal) → wander. Children just live (and play) until of age.
export function runActionSystem(world: World, cfg: SimConfig): void {
  for (const entity of world.query(C_AGENT, C_NEEDS)) {
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;
    const fun = needs.fun ?? 1;   // absent (old fixtures) reads as fully entertained

    agent.ticksAlive += 1;

    // Stick with an in-progress restore until well-restored — unless a more urgent
    // need has itself gone below the threshold (then re-evaluate below).
    if (agent.action === 'sleep' && needs.energy < RESTED && needs.hunger >= cfg.actionThreshold) continue;
    if (agent.action === 'seek_food' && needs.hunger < RESTED && needs.energy >= cfg.actionThreshold) continue;
    // Leisure holds until refreshed, but any survival/social need pre-empts it.
    if (agent.action === 'relax' && fun < REFRESHED
        && needs.hunger >= cfg.actionThreshold && needs.energy >= cfg.actionThreshold
        && needs.social >= cfg.actionThreshold) continue;

    // Survival needs dominate only when genuinely urgent (below the threshold);
    // otherwise the agent is free to socialise, work, or wander. A higher gate
    // would starve earning time and push the poorest into runaway debt.
    if (needs.hunger < cfg.actionThreshold || needs.energy < cfg.actionThreshold) {
      agent.action = (1 - needs.hunger) >= (1 - needs.energy) ? 'seek_food' : 'sleep';
      continue;
    }

    // A mental break (M28 s2) overrides ordinary life — but never survival (handled above), so a
    // despairing soul still eats. Despair/anger withdraw into restless drifting (anger may then lash
    // out — the CrimeSystem reads the state); elation throws itself into leisure (celebrates).
    if (agent.mentalState) {
      agent.action = agent.mentalState === 'elation' ? 'relax' : 'wander';
      continue;
    }

    if (needs.social < cfg.actionThreshold) {
      agent.action = 'socialize';
      continue;
    }

    // Bored: a life beyond survival — folk take leisure when their fun runs low (M28).
    if (fun < cfg.actionThreshold) {
      agent.action = 'relax';
      continue;
    }

    // Comfortable: adults work if employed and below their wealth goal, else wander.
    // Their distilled life-purpose (D26) bends the goal: a vow to provide for family /
    // make something of themselves makes them strive harder; grief pulls them back.
    const adult = ageInYears(agent.ticksAlive, cfg) >= cfg.adultAgeYears;
    const job = world.getComponent<Job>(entity, C_JOB);
    const wallet = world.getComponent<Wallet>(entity, C_WALLET);
    const purpose = world.getComponent<Memory>(entity, C_MEMORY)?.purpose ?? 0;
    const trait = world.getComponent<Personality>(entity, C_PERSONALITY)?.trait ?? '';
    const goal = agent.wealthGoal * (1 + 0.5 * purpose) * traitGoalFactor(trait);
    if (adult && job && wallet && wallet.gold < goal) {
      agent.action = 'work';
    } else {
      agent.action = 'wander';
    }
  }
}
