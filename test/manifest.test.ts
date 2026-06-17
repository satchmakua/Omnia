import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/sim/config.ts';
import { testContent } from './helpers.ts';
import type { StatSample } from '../src/history/stats.ts';
import {
  MANIFEST_VERSION, buildManifest, serializeManifest, parseManifest,
  runManifest, statsToCSV, flattenMetrics, diffRecords,
} from '../src/analysis/manifest.ts';

describe('manifest serialise/parse', () => {
  it('round-trips a manifest through stable JSON', () => {
    const m = buildManifest({ ...defaultConfig, seed: 8 }, 5000, 'a label');
    const back = parseManifest(serializeManifest(m));
    expect(back.version).toBe(MANIFEST_VERSION);
    expect(back.ticks).toBe(5000);
    expect(back.label).toBe('a label');
    expect(back.config).toEqual(m.config);
  });

  it('serialises byte-stably regardless of key order (diffable/hashable)', () => {
    const m = buildManifest({ ...defaultConfig, seed: 3 }, 100);
    // A config with the same values but a shuffled key order must serialise identically.
    const shuffled = { ...m, config: Object.fromEntries(Object.entries(m.config).reverse()) } as typeof m;
    expect(serializeManifest(shuffled)).toBe(serializeManifest(m));
  });

  it('fails loud on a bad version or a missing config', () => {
    expect(() => parseManifest('{"version":999,"ticks":1,"config":{"seed":1}}')).toThrow(/version/);
    expect(() => parseManifest(`{"version":${MANIFEST_VERSION},"ticks":1}`)).toThrow(/config/);
    expect(() => parseManifest(`{"version":${MANIFEST_VERSION},"ticks":1,"config":{}}`)).toThrow(/seed/);
    expect(() => parseManifest('not json')).toThrow(/JSON/);
  });
});

describe('runManifest reproducibility (the DoD clause)', () => {
  it('a finding is reproducible from its exported manifest, byte-for-byte', () => {
    const content = testContent();
    const m = buildManifest({ ...defaultConfig, seed: 8 }, 2000);

    // Run directly, and run from a serialise→parse round-trip of the same manifest.
    const direct = runManifest(m, content);
    const fromFile = runManifest(parseManifest(serializeManifest(m)), content);

    expect(diffRecords(flattenMetrics(direct.metrics), flattenMetrics(fromFile.metrics))).toEqual([]);
    expect(fromFile.outcome).toEqual(direct.outcome);
  }, 20_000);

  it('a different seed is a different world (run-diff is non-empty)', () => {
    const content = testContent();
    const a = runManifest(buildManifest({ ...defaultConfig, seed: 8 }, 2000), content);
    const b = runManifest(buildManifest({ ...defaultConfig, seed: 1 }, 2000), content);
    expect(diffRecords(flattenMetrics(a.metrics), flattenMetrics(b.metrics)).length).toBeGreaterThan(0);
  }, 20_000);
});

describe('statsToCSV', () => {
  it('emits a header plus one row per sample, with the expected columns', () => {
    const samples: StatSample[] = [
      { year: 1, population: 20, births: 0, deaths: 0, marriages: 5, mages: 1, gini: 0.2, medianWealth: 10, avgAge: 30 },
      { year: 2, population: 22, births: 3, deaths: 1, marriages: 6, mages: 1, gini: 0.25, medianWealth: 12, avgAge: 28 },
    ];
    const lines = statsToCSV(samples).trim().split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toBe('year,population,births,deaths,marriages,mages,gini,medianWealth,avgAge');
    expect(lines[1]).toBe('1,20,0,0,5,1,0.2,10,30');
  });
});

describe('diffRecords', () => {
  it('reports changed keys (sorted), ignores within-eps, and treats missing as 0', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 1, y: 2.5 };          // y changed, z dropped (→ 0)
    const d = diffRecords(a, b);
    expect(d.map(r => r.key)).toEqual(['y', 'z']);
    expect(d[0]).toEqual({ key: 'y', a: 2, b: 2.5, delta: 0.5 });
    expect(d[1]).toEqual({ key: 'z', a: 3, b: 0, delta: -3 });
  });

  it('is empty for identical records', () => {
    expect(diffRecords({ a: 1, b: 2 }, { a: 1, b: 2 })).toEqual([]);
  });
});
