// Standalone export/diff runner. Usage: npm run export
//
// Demonstrates the reproducibility unit of the Science track (M7.7, D29): write a run
// **manifest** (seed + config + ticks), reproduce it, prove the reproduction is exact,
// export the world-health time-series as **CSV**, and **diff** two runs. Artifacts are
// written under `runs/` (gitignored).
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadContentFromDisk } from '../content/fsSource.ts';
import { defaultConfig } from '../sim/config.ts';
import {
  buildManifest, serializeManifest, parseManifest, runManifest,
  statsToCSV, flattenMetrics, diffRecords,
} from './manifest.ts';

const TICKS = 12000; // ~12 sim-years — enough for surnames to concentrate (the Zipf finding)
const OUT = 'runs';
mkdirSync(OUT, { recursive: true });

const content = loadContentFromDisk();
const t0 = Date.now();

console.log(`Omnia export: writing manifests + CSV to ${OUT}/  (${TICKS} ticks each)`);

// 1) A canonical manifest, serialised to disk — this one small file reproduces the run.
const manifest = buildManifest({ ...defaultConfig, seed: 8 }, TICKS, 'canonical seed-8 run (surname-Zipf finding)');
const manifestJson = serializeManifest(manifest);
writeFileSync(`${OUT}/seed8.manifest.json`, manifestJson);
console.log(`\n• wrote ${OUT}/seed8.manifest.json (${manifestJson.length} bytes)`);

// 2) Reproduce from the *serialised* manifest (parse → run) and export results.
const a = runManifest(parseManifest(manifestJson), content);
writeFileSync(`${OUT}/seed8.stats.csv`, statsToCSV(a.stats));
console.log(`• wrote ${OUT}/seed8.stats.csv (${a.stats.length} yearly rows)`);
console.log(
  `  measured: pop=${a.outcome.finalPopulation} surnameZipf s=${a.metrics.surnameZipf.exponent.toFixed(2)} ` +
  `(r²=${a.metrics.surnameZipf.r2.toFixed(2)}) givenZipf s=${a.metrics.givenZipf.exponent.toFixed(2)} ` +
  `gini=${a.metrics.wealthGini.toFixed(2)} tongues=${a.metrics.family?.total ?? 0}`,
);

// 3) Reproducibility proof: run the same manifest again; the metric-diff must be empty.
const a2 = runManifest(manifest, content);
const selfDiff = diffRecords(flattenMetrics(a.metrics), flattenMetrics(a2.metrics));
console.log(`\n• reproducibility: re-running the manifest changed ${selfDiff.length} metrics ` +
  `→ ${selfDiff.length === 0 ? 'EXACT ✓' : 'NON-DETERMINISTIC ✗'}`);

// 4) Run-diff: a different seed is a genuinely different world; show what moved.
const b = runManifest(buildManifest({ ...defaultConfig, seed: 1 }, TICKS), content);
const crossDiff = diffRecords(flattenMetrics(a.metrics), flattenMetrics(b.metrics));
console.log(`\n• run-diff seed 8 vs seed 1 — ${crossDiff.length} metrics differ:`);
for (const d of crossDiff.slice(0, 8)) {
  console.log(`    ${d.key.padEnd(22)} ${d.a.toFixed(3).padStart(9)} → ${d.b.toFixed(3).padStart(9)}  (Δ ${d.delta >= 0 ? '+' : ''}${d.delta.toFixed(3)})`);
}
if (crossDiff.length > 8) console.log(`    … and ${crossDiff.length - 8} more`);

console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
