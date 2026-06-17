// Standalone sweep runner. Usage: npm run sweep
//
// Demonstrates the Science & Instrumentation track (M7.7, D29): vary one config knob
// across a range over several seeds, run each scenario headlessly, and locate the
// phase transition where the town tips between surviving and collapsing. Every run is
// reproducible from its (config, seed) — the printed transition is a real finding.
import { loadContentFromDisk } from '../content/fsSource.ts';
import { defaultConfig } from '../sim/config.ts';
import { sweepParam } from './sweep.ts';
import type { SweepResult } from './sweep.ts';

const SEEDS = [1, 2, 8];
const TICKS = 4000; // ~4 sim-years — long enough for a starving town to actually die out

function report(title: string, blurb: string, r: SweepResult): void {
  console.log(`\n== ${title} ==`);
  console.log(`   ${blurb}`);
  console.log(`   param          survival   meanFinalPop   meanPeakPop`);
  for (const p of r.points) {
    const bar = '█'.repeat(Math.round(p.survivalRate * 10)).padEnd(10, '·');
    console.log(
      `   ${String(p.value).padStart(7)}   ${bar} ${(p.survivalRate * 100).toFixed(0).padStart(3)}%` +
      `     ${p.meanFinalPopulation.toFixed(1).padStart(6)}        ${p.meanPeakPopulation.toFixed(1).padStart(6)}`,
    );
  }
  if (r.transition) {
    const t = r.transition;
    console.log(
      `   ► phase transition at ${String(r.param)} ≈ ${t.estimate.toFixed(4)} ` +
      `(survival flips ${(t.drop * 100).toFixed(0)}% between ${t.lowerValue} and ${t.upperValue})`,
    );
  } else {
    console.log('   ► no survival phase transition in this range.');
  }
}

console.log(`Omnia sweep: seeds ${SEEDS.join(',')}, ${TICKS} ticks each`);
const t0 = Date.now();
const content = loadContentFromDisk();

// Food SUPPLY: how much flora the world starts with. Below a critical density the
// town can't feed itself and starves; above it, it grows to carrying capacity.
report(
  'Food supply — floraDensity',
  'starting flora per passable tile; the survival order parameter rises from a collapse phase',
  sweepParam(defaultConfig, content, 'floraDensity', [0.0, 0.0025, 0.005, 0.0075, 0.01, 0.02, 0.04, 0.06], SEEDS, TICKS),
);

// Food DEMAND: how fast folk get hungry. Past a critical decay rate, foraging can't
// keep up and the population thins toward collapse.
report(
  'Food demand — hungerDecayPerDay',
  'how fast hunger falls; carrying capacity erodes, then survival collapses',
  sweepParam(defaultConfig, content, 'hungerDecayPerDay', [0.8, 2, 4, 6, 8, 10, 12, 14], SEEDS, TICKS),
);

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
