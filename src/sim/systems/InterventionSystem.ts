// God mode (M27 s1): apply the player's recorded interventions on their tick. Runs right after the
// clock advances, so a divine act lands before the folk act on the world this tick — and because it
// drains the durable log (the single source of truth for both live play and replay), a live act and
// a replayed act take the identical path → the run reproduces exactly (D30/D54). A no-op when the log
// is empty (the default), so headless/observe-only runs are byte-unchanged.
import type { World } from '../ecs.ts';
import { C_INTERVENTIONS, C_CLOCK } from '../components.ts';
import type { InterventionsData, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { applyIntervention } from '../interventions.ts';

export function runInterventionSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const ents = world.query(C_INTERVENTIONS);
  if (!ents.length) return;
  const data = world.getComponent<InterventionsData>(ents[0], C_INTERVENTIONS)!;
  if (data.log.length === 0) return;   // empty (observe-only default) → no-op, no RNG drawn → trajectory unchanged

  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;

  // Apply every act whose tick has come (≤ tick, in log order — deterministic). The `applied` guard
  // means a snapshot-restored act (already in the world's state) never fires twice.
  for (const iv of data.log) {
    if (!iv.applied && iv.tick <= tick) {
      applyIntervention(world, cfg, iv, content, rng);
      iv.applied = true;
    }
  }
}
