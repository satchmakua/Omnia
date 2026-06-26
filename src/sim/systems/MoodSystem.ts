// Mood & comfort (M11 slice 2) — the first well-being system, and what makes a home
// *matter*. Each day an agent's `mood` drifts toward a target set by their circumstances:
// a home of their own and living family lift it; debt, homelessness, and illness weigh it
// down. Mood then gently warms friendship (D26) — content folk bond more readily — so a
// settled, housed, solvent town grows more connected. Deterministic (no RNG); a pure read
// of durable state, so it never perturbs the trajectory.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_WALLET, C_HEALTH, C_LINEAGE, C_HOME, C_CLOCK } from '../components.ts';
import type { Agent, Wallet, Health, Lineage, Home, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import { getReligionStore } from '../../religion/religionStore.ts';

export const MOOD_BASELINE = 0.6;   // a fresh soul starts mildly content; spawnAgent seeds this

// How circumstance bends the mood target (hardcoded weights, like the other D26 couplings).
const HOME_BONUS = 0.20;        // a home of one's own — security & comfort
const FAMILY_BONUS = 0.15;      // a living partner / parent / child — companionship
const DEBT_PENALTY = 0.20;      // owing more than you have wears on you (debt's bite, D39 via mood)
const HOMELESS_PENALTY = 0.10;  // an adult with no home of their own
const FAITH_COMFORT = 0.12;     // a devout faith is a solace (scaled by its fervor) (M18 s2)
const ILL_PENALTY = 0.15;       // sickness saps contentment
const ADJUST_PER_DAY = 0.34;    // mood drifts ~⅓ of the way to its target each day (days, not instant)

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// The friendship-warmth multiplier from a pair's mood: centred on the baseline (no change
// for typical folk), lifted by contentment, damped by misery. Used by SocialSystem.
export function moodWarmth(a: number, b: number): number {
  return 0.7 + 0.5 * ((a + b) / 2);   // avg 0.6 → 1.0; avg 1 → 1.2; avg 0 → 0.7
}

export function runMoodSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  // Who owns a home? (one pass, so the per-agent check is O(1)).
  const homeowners = new Set<EntityId>();
  for (const e of world.query(C_HOME)) homeowners.add(world.getComponent<Home>(e, C_HOME)!.owner);
  const faithStore = getReligionStore(world);   // a devout faith comforts its followers (M18 s2)

  const alive = (id: number) => world.hasComponent(id, C_AGENT);
  for (const e of world.query(C_AGENT)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const adult = ageInYears(agent.ticksAlive, cfg) >= cfg.adultAgeYears;
    const owns = homeowners.has(e);
    const wallet = world.getComponent<Wallet>(e, C_WALLET);
    const health = world.getComponent<Health>(e, C_HEALTH);
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    const hasFamily = !!lin && (
      (lin.partner !== null && alive(lin.partner)) ||
      lin.parents.some(alive) || lin.children.some(alive)
    );

    let target = MOOD_BASELINE;
    if (owns) target += HOME_BONUS;
    if (hasFamily) target += FAMILY_BONUS;
    if (wallet && wallet.debt > 0) target -= DEBT_PENALTY;
    // A roof — even a rented one — spares the homeless penalty (children are dependents anyway).
    if (adult && !owns && agent.rentsFrom === undefined) target -= HOMELESS_PENALTY;
    if (health && health.ill) target -= ILL_PENALTY;
    // Faith is a solace — a follower draws comfort scaled by how devout their faith is.
    if (faithStore && agent.religionId) target += FAITH_COMFORT * (faithStore.byId[agent.religionId]?.fervor ?? 0);
    target = clamp01(target);

    const mood = agent.mood ?? MOOD_BASELINE;
    agent.mood = mood + (target - mood) * ADJUST_PER_DAY;
  }
}
