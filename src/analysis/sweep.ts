// Science & Instrumentation (M7.7, D29): parameter sweeps to locate phase
// transitions / tipping points. The sim is perfectly deterministic, so a sweep is a
// real experiment: vary one config knob across a range (over several seeds for
// robustness), run each scenario headlessly to an outcome, and find the threshold
// where the outcome flips — e.g. the food-scarcity point at which the town tips from
// surviving to a starvation collapse.
//
// Pure orchestration over the existing headless loop: no new sim behaviour, no
// renderer. Each scenario is reproducible from its (config, seed).
import { createSimulation } from '../sim/world.ts';
import { tick } from '../sim/loop.ts';
import type { SimConfig } from '../sim/config.ts';
import type { Content } from '../content/loader.ts';
import { C_AGENT, C_FAUNA } from '../sim/components.ts';

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// ── One scenario ─────────────────────────────────────────────────────────────────

export interface ScenarioOutcome {
  seed: number;
  ticks: number;
  finalPopulation: number;
  peakPopulation: number;
  survived: boolean;            // anyone left alive at the end
  extinctionTick: number | null; // when the last folk died (sampled), or null
  finalFauna: number;
}

// Run one headless scenario to its outcome. Population is sampled every `sampleEvery`
// ticks (cheap) to capture the peak and detect extinction; once everyone is dead the
// town can never recover (no living adults → no births), so we stop early.
export function runScenario(
  cfg: SimConfig, content: Content, ticks: number, sampleEvery = 100,
): ScenarioOutcome {
  const { world, rng, clockEntity } = createSimulation(cfg, content);
  let peak = world.query(C_AGENT).length;
  let extinctionTick: number | null = null;

  for (let t = 0; t < ticks; t++) {
    tick(world, rng, cfg, clockEntity, content);
    if ((t + 1) % sampleEvery === 0) {
      const pop = world.query(C_AGENT).length;
      if (pop > peak) peak = pop;
      if (pop === 0) { extinctionTick = t + 1; break; }
    }
  }

  const finalPopulation = world.query(C_AGENT).length;
  if (finalPopulation > peak) peak = finalPopulation;
  return {
    seed: cfg.seed, ticks,
    finalPopulation, peakPopulation: peak,
    survived: finalPopulation > 0,
    extinctionTick,
    finalFauna: world.query(C_FAUNA).length,
  };
}

// ── A sweep over one parameter ────────────────────────────────────────────────────

export interface SweepPoint {
  value: number;
  runs: ScenarioOutcome[];
  survivalRate: number;          // fraction of seeds that survived
  meanFinalPopulation: number;
  meanPeakPopulation: number;
}

export interface Transition {
  metric: string;
  critical: number;     // the level crossed (e.g. survivalRate 0.5)
  lowerValue: number;   // bracketing parameter values
  upperValue: number;
  estimate: number;     // interpolated parameter value at the crossing
  drop: number;         // magnitude of the metric change across the bracket (sharpness)
}

export interface SweepResult {
  param: keyof SimConfig;
  ticks: number;
  seeds: number[];
  points: SweepPoint[];
  transition: Transition | null;
}

// Vary `param` across `values`, running every `seed` to `ticks`, and locate the
// survival phase transition (survivalRate crossing 0.5).
export function sweepParam(
  base: SimConfig, content: Content, param: keyof SimConfig,
  values: number[], seeds: number[], ticks: number,
): SweepResult {
  const points: SweepPoint[] = values.map((value) => {
    const runs = seeds.map((seed) =>
      runScenario({ ...base, [param]: value, seed } as SimConfig, content, ticks));
    return {
      value, runs,
      survivalRate: runs.filter(r => r.survived).length / runs.length,
      meanFinalPopulation: mean(runs.map(r => r.finalPopulation)),
      meanPeakPopulation: mean(runs.map(r => r.peakPopulation)),
    };
  });
  return { param, ticks, seeds, points, transition: findTransition(points, p => p.survivalRate, 0.5) };
}

// Find where a per-point metric crosses `critical`, between adjacent sweep points.
// Returns the sharpest such crossing (largest jump), linearly interpolated in
// parameter space — that interpolated value is the located tipping point.
export function findTransition(
  points: SweepPoint[], metric: (p: SweepPoint) => number, critical: number,
): Transition | null {
  let best: Transition | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const ya = metric(a), yb = metric(b);
    if ((ya >= critical) === (yb >= critical)) continue; // same side ⇒ no crossing
    const frac = (critical - ya) / (yb - ya);
    const estimate = a.value + frac * (b.value - a.value);
    const drop = Math.abs(yb - ya);
    if (!best || drop > best.drop) {
      best = { metric: 'survivalRate', critical, lowerValue: a.value, upperValue: b.value, estimate, drop };
    }
  }
  return best;
}
