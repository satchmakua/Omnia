// God mode — the player's hand on the world (M27). A divine act is **just a recorded event in the
// deterministic log** (D30/D54): the player enqueues an `Intervention`, the InterventionSystem applies
// it on a tick boundary, and the log replays exactly — so determinism + green-main hold and observe-only
// stays the default (god mode is an opt-in toggle). The powers themselves are **content** (M27 s2):
// `iv.kind` is a power id in content/powers/*.yaml, dispatched to its code-side effect in src/sim/powers.ts
// (the data/behaviour boundary, D9). Effects draw only from the supplied seeded `rng` → replay-safe.
import type { World, EntityId } from './ecs.ts';
import { C_INTERVENTIONS, C_CLOCK } from './components.ts';
import type { InterventionsData, Intervention, Clock } from './components.ts';
import type { SimConfig } from './config.ts';
import type { RNG } from './rng.ts';
import type { Content } from '../content/loader.ts';
import { POWER_EFFECTS } from './powers.ts';

export function createInterventions(): InterventionsData {
  return { log: [] };
}

function tickOf(world: World): number {
  const ce = world.query(C_CLOCK);
  return ce.length ? world.getComponent<Clock>(ce[0], C_CLOCK)!.tick : 0;
}

/**
 * Enqueue a god-act to apply on the NEXT tick. Recorded into the durable log, so a saved/replayed
 * run reproduces it exactly. `kind` is a power id (content/powers/*.yaml). Returns the queued
 * intervention (or null if there's no log singleton). Gating on "is god mode on?" is the caller's
 * job (the UI) — the sim just applies what's logged.
 */
export function enqueueIntervention(
  world: World, kind: string, target: EntityId | null, amount?: number,
): Intervention | null {
  const ents = world.query(C_INTERVENTIONS);
  if (!ents.length) return null;
  const data = world.getComponent<InterventionsData>(ents[0], C_INTERVENTIONS)!;
  const iv: Intervention = { tick: tickOf(world) + 1, kind, target, amount, applied: false };
  data.log.push(iv);
  return iv;
}

/**
 * Apply one intervention: look the power up in the content roster, dispatch to its code-side effect.
 * Deterministic — effects draw only from the seeded `rng` (most draw none) → replay-safe. An unknown
 * power id is ignored (forward-compatible with older/newer rosters).
 */
export function applyIntervention(
  world: World, cfg: SimConfig, iv: Intervention, content: Content, rng: RNG,
): void {
  const power = content.powers.get(iv.kind);
  if (!power) return;
  const fn = POWER_EFFECTS[power.effect];
  if (!fn) return;   // boundary-checked at load, so this is belt-and-braces
  fn({
    world, cfg, rng, content, power,
    tick: tickOf(world),
    target: iv.target,
    amount: iv.amount ?? power.amount,
  });
}
