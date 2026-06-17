// Science & Instrumentation (M7.7, D29): run manifests, CSV export, and run-diff.
//
// A **run manifest** is the reproducibility unit: seed + full config + tick count.
// Because the sim is perfectly deterministic, re-running a manifest reproduces the
// run — and its measured findings — exactly. This is the clause that turns a measured
// regularity (`metrics.ts`) or a located transition (`sweep.ts`) into something a
// reader can regenerate from one small file. Pure orchestration over the existing
// loop; no new sim behaviour, no renderer.
import { createSimulation } from '../sim/world.ts';
import { tick } from '../sim/loop.ts';
import type { SimConfig } from '../sim/config.ts';
import type { Content } from '../content/loader.ts';
import { C_AGENT, C_FAUNA, C_WORLDSTATS } from '../sim/components.ts';
import type { WorldStatsData, StatSample } from '../history/stats.ts';
import { measureWorld } from './metrics.ts';
import type { WorldMetrics } from './metrics.ts';
import type { ScenarioOutcome } from './sweep.ts';

export const MANIFEST_VERSION = 1;

export interface RunManifest {
  version: number;
  label?: string;     // a human note; not part of the reproducible identity
  ticks: number;
  config: SimConfig;  // includes the seed — this is what reproduces the run
}

export function buildManifest(config: SimConfig, ticks: number, label?: string): RunManifest {
  return { version: MANIFEST_VERSION, ...(label ? { label } : {}), ticks, config };
}

// Stable JSON: keys sorted recursively, so the same manifest always serialises
// byte-for-byte (diffable, hashable).
function stableStringify(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = norm((v as Record<string, unknown>)[k]);
      return out;
    }
    if (Array.isArray(v)) return v.map(norm);
    return v;
  };
  return JSON.stringify(norm(value), null, 2);
}

export function serializeManifest(m: RunManifest): string {
  return stableStringify(m);
}

// Parse + validate a manifest, failing loud (the project's content ethos) on a bad
// shape or an unknown version, so a stale/corrupt file aborts rather than misbehaves.
export function parseManifest(json: string): RunManifest {
  let raw: unknown;
  try { raw = JSON.parse(json); }
  catch (e) { throw new Error(`manifest: invalid JSON (${(e as Error).message})`); }
  if (!raw || typeof raw !== 'object') throw new Error('manifest: expected an object');
  const m = raw as Partial<RunManifest>;
  if (m.version !== MANIFEST_VERSION) throw new Error(`manifest: unsupported version ${m.version} (expected ${MANIFEST_VERSION})`);
  if (typeof m.ticks !== 'number' || m.ticks < 0) throw new Error('manifest: missing/invalid "ticks"');
  if (!m.config || typeof m.config !== 'object') throw new Error('manifest: missing "config"');
  if (typeof (m.config as SimConfig).seed !== 'number') throw new Error('manifest: config has no numeric "seed"');
  return { version: m.version, label: m.label, ticks: m.ticks, config: m.config as SimConfig };
}

// ── Running a manifest ────────────────────────────────────────────────────────────

export interface ManifestRun {
  outcome: ScenarioOutcome;
  metrics: WorldMetrics;
  stats: StatSample[];   // the world-health time-series accrued during the run
}

// Reproduce a run from its manifest and measure it. Deterministic: identical input ⇒
// identical output, every time.
export function runManifest(m: RunManifest, content: Content): ManifestRun {
  const cfg = m.config;
  const { world, rng, clockEntity } = createSimulation(cfg, content);
  let peak = world.query(C_AGENT).length;
  let extinctionTick: number | null = null;

  for (let t = 0; t < m.ticks; t++) {
    tick(world, rng, cfg, clockEntity, content);
    if ((t + 1) % 100 === 0) {
      const pop = world.query(C_AGENT).length;
      if (pop > peak) peak = pop;
      if (pop === 0 && extinctionTick === null) extinctionTick = t + 1;
    }
  }

  const finalPopulation = world.query(C_AGENT).length;
  if (finalPopulation > peak) peak = finalPopulation;
  const wsEnts = world.query(C_WORLDSTATS);
  const stats = wsEnts.length ? world.getComponent<WorldStatsData>(wsEnts[0], C_WORLDSTATS)!.samples : [];

  return {
    outcome: {
      seed: cfg.seed, ticks: m.ticks, finalPopulation, peakPopulation: peak,
      survived: finalPopulation > 0, extinctionTick, finalFauna: world.query(C_FAUNA).length,
    },
    metrics: measureWorld(world, cfg),
    stats: [...stats],
  };
}

// ── CSV export ────────────────────────────────────────────────────────────────────

const STAT_COLUMNS: (keyof StatSample)[] =
  ['year', 'population', 'births', 'deaths', 'marriages', 'mages', 'gini', 'medianWealth', 'avgAge'];

// The world-health time-series as CSV (one row per sampled year) — the analysable
// tabular export, ready for a spreadsheet or a plotting script.
export function statsToCSV(samples: StatSample[]): string {
  const head = STAT_COLUMNS.join(',');
  const rows = samples.map(s => STAT_COLUMNS.map(c => String(s[c])).join(','));
  return [head, ...rows].join('\n') + '\n';
}

// ── Run-diff ──────────────────────────────────────────────────────────────────────

// Flatten the measured metrics to a flat key→number record, for diffing two runs.
export function flattenMetrics(m: WorldMetrics): Record<string, number> {
  const r: Record<string, number> = {
    'wealth.gini': m.wealthGini,
    'wealth.tailAlpha': m.wealthTail.alpha,
    'wealth.tailR2': m.wealthTail.r2,
    'social.nodes': m.social.nodes,
    'social.edges': m.social.edges,
    'social.avgDegree': m.social.avgDegree,
    'social.clustering': m.social.clustering,
    'social.avgPathLength': m.social.avgPathLength,
    'social.smallWorldSigma': m.social.smallWorldSigma,
    'ages.count': m.ages.count,
    'ages.median': m.ages.median,
    'ages.mean': m.ages.mean,
    'ages.childFraction': m.ages.childFraction,
    'names.givenZipf': m.givenZipf.exponent,
    'names.surnameZipf': m.surnameZipf.exponent,
    'names.surnameZipfR2': m.surnameZipf.r2,
  };
  if (m.family) {
    r['family.total'] = m.family.total;
    r['family.living'] = m.family.living;
    r['family.extinct'] = m.family.extinct;
    r['family.maxDepth'] = m.family.maxDepth;
    r['family.maxBreadth'] = m.family.maxBreadth;
  }
  return r;
}

export interface MetricDiff { key: string; a: number; b: number; delta: number; }

// The keys whose values differ between two runs (beyond eps), sorted. An empty result
// means the two runs measured identically — e.g. re-running one manifest.
export function diffRecords(
  a: Record<string, number>, b: Record<string, number>, eps = 1e-9,
): MetricDiff[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: MetricDiff[] = [];
  for (const key of keys) {
    const av = a[key] ?? 0, bv = b[key] ?? 0;
    if (Math.abs(av - bv) > eps) out.push({ key, a: av, b: bv, delta: bv - av });
  }
  return out;
}
