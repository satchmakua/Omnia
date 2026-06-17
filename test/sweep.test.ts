import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/sim/config.ts';
import { testContent } from './helpers.ts';
import {
  runScenario, sweepParam, findTransition,
} from '../src/analysis/sweep.ts';
import type { SweepPoint } from '../src/analysis/sweep.ts';

// A minimal SweepPoint for the pure transition-finder tests.
const pt = (value: number, survivalRate: number): SweepPoint =>
  ({ value, survivalRate, runs: [], meanFinalPopulation: 0, meanPeakPopulation: 0 });

describe('findTransition', () => {
  it('locates and linearly interpolates a crossing of the critical level', () => {
    const points = [pt(0, 1.0), pt(1, 1.0), pt(2, 0.0)]; // flips between value 1 and 2
    const tr = findTransition(points, p => p.survivalRate, 0.5);
    expect(tr).not.toBeNull();
    expect(tr!.lowerValue).toBe(1);
    expect(tr!.upperValue).toBe(2);
    expect(tr!.estimate).toBeCloseTo(1.5, 6); // halfway, since 1.0 → 0.0 crosses 0.5 at the midpoint
    expect(tr!.drop).toBeCloseTo(1, 6);
  });

  it('returns null when the metric never crosses (all on one side)', () => {
    expect(findTransition([pt(0, 1.0), pt(1, 0.9), pt(2, 0.8)], p => p.survivalRate, 0.5)).toBeNull();
  });

  it('picks the sharpest crossing when several exist', () => {
    // crossings: 0→1 (drop 0.2), 1→2 (drop 0.6), 2→3 (drop 1.0, the hard collapse).
    const points = [pt(0, 0.6), pt(1, 0.4), pt(2, 1.0), pt(3, 0.0)];
    const tr = findTransition(points, p => p.survivalRate, 0.5)!;
    expect(tr.lowerValue).toBe(2);
    expect(tr.upperValue).toBe(3);
    expect(tr.drop).toBeCloseTo(1.0, 6);
  });
});

describe('runScenario', () => {
  it('a well-fed town survives a short run', () => {
    const o = runScenario({ ...defaultConfig, seed: 8 }, testContent(), 2000);
    expect(o.survived).toBe(true);
    expect(o.finalPopulation).toBeGreaterThan(0);
    expect(o.extinctionTick).toBeNull();
    expect(o.peakPopulation).toBeGreaterThanOrEqual(o.finalPopulation);
  }, 15_000);

  it('with no flora the town starves to extinction', () => {
    const o = runScenario({ ...defaultConfig, seed: 8, floraDensity: 0 }, testContent(), 2500);
    expect(o.survived).toBe(false);
    expect(o.finalPopulation).toBe(0);
    expect(o.extinctionTick).not.toBeNull();
  }, 15_000);
});

describe('sweepParam locates a food-scarcity phase transition', () => {
  it('survival flips from collapse to carrying-capacity as food supply rises', () => {
    const r = sweepParam(defaultConfig, testContent(), 'floraDensity', [0.0, 0.02, 0.06], [1, 8], 2500);
    expect(r.points).toHaveLength(3);

    // Phase boundaries: no food ⇒ certain collapse; ample food ⇒ certain survival.
    expect(r.points[0].survivalRate).toBe(0);
    expect(r.points[r.points.length - 1].survivalRate).toBe(1);

    // Order parameter (mean surviving population) rises monotonically with food.
    for (let i = 1; i < r.points.length; i++) {
      expect(r.points[i].meanFinalPopulation).toBeGreaterThanOrEqual(r.points[i - 1].meanFinalPopulation);
    }
    expect(r.points[r.points.length - 1].meanFinalPopulation).toBeGreaterThan(0);

    // A transition is located and bracketed inside the swept range.
    expect(r.transition).not.toBeNull();
    expect(r.transition!.estimate).toBeGreaterThan(0);
    expect(r.transition!.estimate).toBeLessThanOrEqual(0.02);
    expect(r.transition!.drop).toBeGreaterThan(0);
  }, 20_000);
});
