// World-history maintenance (M6 item 2), the world-level analogue of MemorySystem.
// On a schedule it (1) samples the statistical strata — a fixed-size running record
// of the town's health — and (2) compresses the Chronicle, rolling old legends into
// coarse eras so the legend log stays bounded across the generations. Deterministic,
// consumes no RNG, off the hot path.
import type { World } from '../ecs.ts';
import { C_CLOCK, C_CHRONICLE, C_WORLDSTATS } from '../components.ts';
import type { Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { consolidateChronicle } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { sampleStats } from '../../history/stats.ts';
import type { WorldStatsData } from '../../history/stats.ts';

export function runHistorySystem(world: World, cfg: SimConfig): void {
  const wsEnts = world.query(C_WORLDSTATS);
  if (wsEnts.length === 0) return;
  const ws = world.getComponent<WorldStatsData>(wsEnts[0], C_WORLDSTATS)!;

  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  if (tick - ws.lastSampleTick < cfg.statsSampleIntervalDays * cfg.ticksPerDay) return;
  ws.lastSampleTick = tick;

  sampleStats(world, ws, cfg, tick);

  const chronEnts = world.query(C_CHRONICLE);
  if (chronEnts.length) {
    const chron = world.getComponent<ChronicleData>(chronEnts[0], C_CHRONICLE)!;
    consolidateChronicle(
      chron, cfg.chronicleRecentCap, cfg.chronicleRetainAfterRollup,
      cfg.chronicleLegendImportance, cfg.chronicleMaxEras,
    );
  }
}
