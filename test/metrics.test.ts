import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_WALLET, C_RELATIONSHIPS, C_TOMBSTONE } from '../src/sim/components.ts';
import type { Agent, Wallet, Relationships, Tombstone } from '../src/sim/components.ts';
import type { LanguageStoreData, RuntimeLanguage } from '../src/lang/languageStore.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { testContent } from './helpers.ts';
import {
  linregress, powerLawTail, socialMetrics, ageDistribution,
  zipfFit, nameFrequencies, languageFamilyShape, measureWorld,
} from '../src/analysis/metrics.ts';

const cfg = defaultConfig;

// ── helpers ──────────────────────────────────────────────────────────────────────

function addAgent(w: World, opts: { name?: string; ageYears?: number; gold?: number } = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: opts.name ?? 'A B', action: 'wander',
    ticksAlive: (opts.ageYears ?? 30) * ticksPerYear(cfg),
    wealthGoal: 50, sex: 'female', lifespanTicks: 1e9,
  });
  w.addComponent<Wallet>(e, C_WALLET, { gold: opts.gold ?? 10, debt: 0 });
  w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  return e;
}

// Build a friendship graph from an undirected edge list over `n` agents.
function buildGraph(n: number, edges: [number, number][]): { w: World; ids: EntityId[] } {
  const w = new World();
  const ids = Array.from({ length: n }, () => addAgent(w));
  for (const [i, j] of edges) {
    w.getComponent<Relationships>(ids[i], C_RELATIONSHIPS)!.edges[ids[j]] = { type: 'friend', sentiment: 0.5 };
    w.getComponent<Relationships>(ids[j], C_RELATIONSHIPS)!.edges[ids[i]] = { type: 'friend', sentiment: 0.5 };
  }
  return { w, ids };
}

// ── generic regression ─────────────────────────────────────────────────────────

describe('linregress', () => {
  it('recovers a known line and r²=1 for collinear points', () => {
    const f = linregress([0, 1, 2, 3], [1, 3, 5, 7]); // y = 2x + 1
    expect(f.slope).toBeCloseTo(2, 6);
    expect(f.intercept).toBeCloseTo(1, 6);
    expect(f.r2).toBeCloseTo(1, 6);
  });
});

// ── 1. power-law tail ────────────────────────────────────────────────────────────

describe('powerLawTail', () => {
  it('fits a near-2 tail index to a clean rank-size power law (value ∝ rank^-0.5 ⇒ α≈2)', () => {
    const values = Array.from({ length: 100 }, (_, i) => 1000 * Math.pow(i + 1, -0.5));
    const fit = powerLawTail(values);
    expect(fit.k).toBeGreaterThan(0);
    expect(fit.alpha).toBeGreaterThan(1.3);
    expect(fit.alpha).toBeLessThan(3.0);
    expect(fit.r2).toBeGreaterThan(0.95);   // a clean power law is straight in log-log
  });

  it('a heavier (more unequal) tail yields a smaller alpha than a lighter one', () => {
    const heavy = Array.from({ length: 100 }, (_, i) => Math.pow(i + 1, -1.0)); // steeper tail
    const light = Array.from({ length: 100 }, (_, i) => Math.pow(i + 1, -0.3)); // flatter
    expect(powerLawTail(heavy).alpha).toBeLessThan(powerLawTail(light).alpha);
  });

  it('returns an undefined (zero) fit when there are too few positive values', () => {
    expect(powerLawTail([5, 0, -3]).alpha).toBe(0);
  });
});

// ── 2. social metrics ────────────────────────────────────────────────────────────

describe('socialMetrics', () => {
  it('a triangle is fully clustered, one component, unit paths', () => {
    const { w } = buildGraph(3, [[0, 1], [1, 2], [0, 2]]);
    const m = socialMetrics(w);
    expect(m.nodes).toBe(3);
    expect(m.edges).toBe(3);
    expect(m.clustering).toBeCloseTo(1, 6);
    expect(m.components).toBe(1);
    expect(m.largestComponent).toBe(3);
    expect(m.avgPathLength).toBeCloseTo(1, 6);
  });

  it('a path graph A–B–C has zero clustering and mean path length 4/3', () => {
    const { w } = buildGraph(3, [[0, 1], [1, 2]]);
    const m = socialMetrics(w);
    expect(m.clustering).toBeCloseTo(0, 6);        // B's two neighbours aren't linked
    expect(m.avgPathLength).toBeCloseTo(4 / 3, 6); // 1 + 1 + 2 over 3 pairs
  });

  it('counts disconnected components and finds the largest', () => {
    const { w } = buildGraph(6, [[0, 1], [2, 3], [3, 4]]); // node 5 is isolated
    const m = socialMetrics(w);
    expect(m.components).toBe(3);          // {0,1}, {2,3,4}, {5}
    expect(m.largestComponent).toBe(3);    // {2,3,4}
  });

  it('detects small-worldness (σ>1) on a rewired ring lattice', () => {
    // 12-node ring, each linked to its 2 nearest on each side (high clustering, long paths),
    // then a couple of long-range shortcuts (collapses path length) — the canonical small world.
    const n = 12;
    const edges: [number, number][] = [];
    for (let i = 0; i < n; i++) { edges.push([i, (i + 1) % n]); edges.push([i, (i + 2) % n]); }
    edges.push([0, 6]); edges.push([3, 9]); // shortcuts
    const { w } = buildGraph(n, edges);
    const m = socialMetrics(w);
    expect(m.clustering).toBeGreaterThan(0.3);
    expect(m.smallWorldSigma).toBeGreaterThan(1);
  });
});

// ── 3. demographics ──────────────────────────────────────────────────────────────

describe('ageDistribution', () => {
  it('summarises ages: median, mean, child fraction, decade buckets', () => {
    const w = new World();
    for (const yr of [5, 15, 25, 35]) addAgent(w, { ageYears: yr });
    const d = ageDistribution(w, cfg);
    expect(d.count).toBe(4);
    expect(d.median).toBeCloseTo(20, 6);                 // mean of 15 and 25
    expect(d.mean).toBeCloseTo(20, 6);
    expect(d.childFraction).toBeCloseTo(0.5, 6);         // ages 5 & 15 are below adultAge 16
    expect(d.buckets[0]).toEqual({ from: 0, to: 10, count: 1 });
    expect(d.buckets.reduce((s, b) => s + b.count, 0)).toBe(4);
  });
});

// ── 4. Zipf over names ───────────────────────────────────────────────────────────

describe('zipfFit', () => {
  it('recovers exponent ≈ 1 for a clean Zipf distribution (freq ∝ 1/rank)', () => {
    const counts = [100, 50, 100 / 3, 25, 20, 100 / 6]; // 100/rank
    const z = zipfFit(counts);
    expect(z.exponent).toBeCloseTo(1, 1);
    expect(z.r2).toBeGreaterThan(0.99);
    expect(z.vocab).toBe(6);
  });

  it('nameFrequencies tallies given names and surnames across living and buried', () => {
    const w = new World();
    addAgent(w, { name: 'Suev Resmu' });
    addAgent(w, { name: 'Vuonit Resmu' });   // shares the surname
    const tomb = w.createEntity();
    w.addComponent<Tombstone>(tomb, C_TOMBSTONE, {
      name: 'Old Resmu', speciesName: 'Human', sex: 'male', bornTick: 0, diedTick: 1,
      ageYears: 50, role: null, cause: 'old age', legacy: '', partner: null, parents: [], children: [],
    });
    const nf = nameFrequencies(w);
    expect(nf.surname.get('Resmu')).toBe(3); // two living + one buried
    expect(nf.given.get('Suev')).toBe(1);
  });
});

// ── 5. language-family shape ─────────────────────────────────────────────────────

describe('languageFamilyShape', () => {
  it('measures depth, breadth, roots, and living vs extinct over a descent tree', () => {
    const mk = (id: string, parent?: string, extinct?: boolean): RuntimeLanguage =>
      ({ id, name: id, phonemes: { consonants: [], vowels: [] }, syllableShapes: [],
         namePatterns: { personal: [], family: [] }, soundChangeRate: 0, parent, extinct } as RuntimeLanguage);
    const store: LanguageStoreData = {
      soundChanges: 0,
      byId: {
        root: mk('root'),
        a: mk('a', 'root'),
        b: mk('b', 'root', true),   // a lost daughter
        ga: mk('ga', 'a'),          // a granddaughter
      },
    };
    const f = languageFamilyShape(store);
    expect(f.total).toBe(4);
    expect(f.living).toBe(3);
    expect(f.extinct).toBe(1);
    expect(f.roots).toBe(1);
    expect(f.maxDepth).toBe(3);     // root → a → ga
    expect(f.maxBreadth).toBe(2);   // root has daughters a and b
  });
});

// ── integration: emergent regularities from a live run ───────────────────────────

describe('measureWorld through the live loop', () => {
  it('produces sane metrics and at least one emergent regularity (surname concentration)', () => {
    const content = testContent();
    const c = { ...defaultConfig, seed: 8 };
    const { world, rng, clockEntity } = createSimulation(c, content);
    runTicks(world, rng, c, clockEntity, content, 10_000);

    const m = measureWorld(world, c);

    // Demographics
    expect(m.ages.count).toBeGreaterThan(0);
    expect(m.ages.median).toBeGreaterThan(0);
    // Social graph well-formed and friendships actually formed
    expect(m.social.nodes).toBe(m.ages.count);
    expect(m.social.edges).toBeGreaterThan(0);
    expect(m.social.clustering).toBeGreaterThanOrEqual(0);
    expect(m.social.components).toBeGreaterThanOrEqual(1);
    // Wealth fit is defined and bounded
    expect(m.wealthGini).toBeGreaterThanOrEqual(0);
    expect(m.wealthTail.alpha).toBeGreaterThanOrEqual(0);
    // Language family carries at least the seed tongues
    expect(m.family).not.toBeNull();
    expect(m.family!.total).toBeGreaterThanOrEqual(2);
    expect(m.family!.maxDepth).toBeGreaterThanOrEqual(1);
    // Emergent regularity: patrilineal surnames concentrate as families grow, so the
    // most common surname is shared by several folk (a non-uniform, Zipf-leaning tail).
    expect(m.surnameZipf.vocab).toBeGreaterThan(0);
    const topSurname = Math.max(...[...nameFrequencies(world).surname.values()]);
    expect(topSurname).toBeGreaterThanOrEqual(2);
  }, 20_000);
});
