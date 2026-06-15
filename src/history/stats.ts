// Statistical strata (SIMULATION_MODEL Mechanism 4): "everything not individually
// remembered still counts." Fixed-size running aggregates of the town's health —
// population, wealth, births/deaths/marriages, a cause-of-death histogram — sampled
// on a schedule so the cost is constant no matter how much history has passed.
//
// Every figure is DERIVED from current durable state (living agents + tombstones),
// so this couples to no other system and consumes no RNG. Deaths come from the
// tombstones (which persist), and births from "has parents" (founders don't).
import type { World } from '../sim/ecs.ts';
import {
  C_AGENT, C_MAGIC, C_LINEAGE, C_TOMBSTONE,
} from '../sim/components.ts';
import type { Agent, Lineage, Tombstone } from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';
import { ageInYears, ticksPerYear } from '../sim/config.ts';
import { wealthStats } from '../sim/wealth.ts';

export interface StatSample {
  year: number;
  population: number;
  births: number;     // cumulative: everyone ever born in-sim (living + buried)
  deaths: number;     // cumulative: tombstone count
  marriages: number;  // current: living couples
  mages: number;
  gini: number;
  medianWealth: number;
  avgAge: number;
}

export interface WorldStatsData {
  samples: StatSample[];                  // bounded yearly time-series
  causeOfDeath: Record<string, number>;   // cumulative, fixed key-set (few causes)
  lastSampleTick: number;
}

export function createWorldStats(): WorldStatsData {
  return { samples: [], causeOfDeath: {}, lastSampleTick: -1e9 };
}

// Take one snapshot of the town's health and append it (bounded ring buffer).
export function sampleStats(world: World, ws: WorldStatsData, cfg: SimConfig, tick: number): void {
  const agents = world.query(C_AGENT);
  const population = agents.length;
  const mages = world.query(C_AGENT, C_MAGIC).length;

  const tombs = world.query(C_TOMBSTONE);
  const deaths = tombs.length;

  // Births = everyone with recorded parentage, living or buried (founders have none).
  let births = 0;
  for (const e of world.query(C_AGENT, C_LINEAGE)) {
    if (world.getComponent<Lineage>(e, C_LINEAGE)!.parents.length > 0) births++;
  }
  // Current marriages (living couples), and a running cause-of-death histogram.
  const cause: Record<string, number> = {};
  let married = 0;
  for (const e of tombs) {
    const t = world.getComponent<Tombstone>(e, C_TOMBSTONE)!;
    if (t.parents.length > 0) births++;
    cause[t.cause] = (cause[t.cause] ?? 0) + 1;
  }
  let ageSum = 0;
  for (const e of agents) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    ageSum += ageInYears(a.ticksAlive, cfg);
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    if (lin && lin.partner != null && world.hasComponent(lin.partner, C_AGENT)) married++;
  }

  const wlth = wealthStats(world);
  ws.samples.push({
    year: Math.floor(tick / ticksPerYear(cfg)),
    population,
    births,
    deaths,
    marriages: Math.floor(married / 2),
    mages,
    gini: wlth.gini,
    medianWealth: wlth.median,
    avgAge: population ? ageSum / population : 0,
  });
  if (ws.samples.length > cfg.maxStatSamples) ws.samples.shift();
  ws.causeOfDeath = cause;
}
