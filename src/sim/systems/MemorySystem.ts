// The scheduled memory-compression pass (M6). On a per-agent interval it rolls an
// agent's overgrown working memory down into episodic summaries (the mechanism lives
// in ai/consolidation.ts), so storage stays bounded across a long life while the
// vivid, important events survive as named digest text. Deterministic, consumes no
// RNG, and off the hot path (runs on a schedule, not every tick of real work).
import type { World } from '../ecs.ts';
import { C_AGENT, C_MEMORY, C_CLOCK } from '../components.ts';
import type { Memory, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { consolidateMemory } from '../../ai/consolidation.ts';

export function runMemorySystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  const interval = cfg.memoryRollupIntervalDays * cfg.ticksPerDay;

  for (const e of world.query(C_AGENT, C_MEMORY)) {
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (tick - mem.lastRollupTick < interval) continue;
    mem.lastRollupTick = tick;
    consolidateMemory(
      mem, cfg.workingMemorySize, cfg.memoryRetainAfterRollup,
      cfg.summaryImportanceThreshold, cfg.maxSummaries,
    );
  }
}
