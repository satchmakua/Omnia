// Science & Instrumentation (M7.7, D29): pure measurement of emergent structure.
//
// Like the statistical strata (D22), every figure here is DERIVED from current
// durable state — living agents, tombstones, and the runtime lineage stores. This
// module consumes no RNG, mutates nothing, and couples to no system, so measuring a
// run can never perturb its deterministic trajectory. It turns "it didn't crash"
// (verification) into "it reproduces a known pattern" (validation): a power-law
// wealth tail, a small-world social graph, a Zipfian name distribution, a branching
// language family. All metrics are pure functions of state, so a given seed produces
// identical measurements every run.
import type { World } from '../sim/ecs.ts';
import {
  C_AGENT, C_WALLET, C_RELATIONSHIPS, C_TOMBSTONE, C_MEMORY, C_LINEAGE, C_JOB,
} from '../sim/components.ts';
import type {
  Agent, Wallet, Relationships, Tombstone, Memory, Lineage, Job,
} from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';
import { ageInYears } from '../sim/config.ts';
import { gini } from '../sim/wealth.ts';
import { getLanguageStore } from '../lang/languageStore.ts';
import type { LanguageStoreData } from '../lang/languageStore.ts';

// ── Generic helpers ─────────────────────────────────────────────────────────────

export interface LinFit { slope: number; intercept: number; r2: number; n: number; }

// Ordinary least-squares line through (xs, ys), with the coefficient of
// determination r² (1 = perfectly linear). Used to fit log-log relationships.
export function linregress(xs: number[], ys: number[]): LinFit {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: 0, r2: 0, n };
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0, n };
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy), n };
}

// ── 1. Wealth: power-law tail (Hill estimator) ───────────────────────────────────

export interface TailFit {
  alpha: number;   // estimated tail index: P(X > x) ∝ x^-alpha (0 ⇒ undefined / too few)
  xmin: number;    // threshold the tail was fit above
  k: number;       // sample size of the tail
  r2: number;      // straightness of the log-log rank-size line over the tail (0..1)
}

// Hill estimator of the power-law tail index over the largest `tailFraction` of the
// positive values, plus the r² of the tail's log-log rank-size line as a crude
// "how power-law is it" score. A heavier (more unequal) tail gives a smaller alpha.
export function powerLawTail(values: number[], tailFraction = 0.2): TailFit {
  const v = values.filter(x => x > 0).sort((a, b) => b - a); // descending
  const n = v.length;
  const k = Math.max(2, Math.floor(n * tailFraction));
  if (n < 5 || k >= n) return { alpha: 0, xmin: 0, k: 0, r2: 0 };
  const xmin = v[k];                       // the (k+1)-th largest is the tail threshold
  let s = 0;
  for (let i = 0; i < k; i++) s += Math.log(v[i] / xmin);
  const alpha = s > 0 ? k / s : 0;
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < k; i++) { xs.push(Math.log(i + 1)); ys.push(Math.log(v[i])); }
  return { alpha, xmin, k, r2: linregress(xs, ys).r2 };
}

// ── 2. Social network: clustering, path length, small-worldness ──────────────────

export interface SocialMetrics {
  nodes: number;
  edges: number;
  avgDegree: number;
  clustering: number;       // mean local clustering coefficient (transitivity of friendship)
  avgPathLength: number;    // mean shortest path within the largest component
  components: number;       // number of connected components
  largestComponent: number; // size of the biggest friend cluster
  smallWorldSigma: number;  // (C/Crand)/(L/Lrand); > 1 ⇒ small-world (high clustering, short paths)
}

type Adjacency = Map<number, Set<number>>;

// The undirected friendship graph over living agents: a tie exists where either side
// records a friend/partner edge to another living agent (partner/friend = positive ties).
function buildSocialGraph(world: World): Adjacency {
  const ids = world.query(C_AGENT, C_RELATIONSHIPS);
  const idSet = new Set(ids);
  const adj: Adjacency = new Map();
  for (const e of ids) adj.set(e, new Set());
  for (const e of ids) {
    const rel = world.getComponent<Relationships>(e, C_RELATIONSHIPS)!;
    for (const k of Object.keys(rel.edges)) {
      const o = Number(k);
      const type = rel.edges[o].type;
      if (o !== e && idSet.has(o) && (type === 'friend' || type === 'partner')) {
        adj.get(e)!.add(o);
        adj.get(o)!.add(e); // symmetric
      }
    }
  }
  return adj;
}

function connectedComponents(adj: Adjacency): number[][] {
  const seen = new Set<number>();
  const comps: number[][] = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const u = stack.pop()!;
      comp.push(u);
      for (const v of adj.get(u)!) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
    comps.push(comp);
  }
  return comps;
}

// Mean shortest-path length over all reachable pairs inside one component (BFS).
function avgShortestPath(adj: Adjacency, comp: number[]): number {
  if (comp.length < 2) return 0;
  let total = 0, pairs = 0;
  for (const s of comp) {
    const dist = new Map<number, number>([[s, 0]]);
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi];
      const du = dist.get(u)!;
      for (const v of adj.get(u)!) if (!dist.has(v)) { dist.set(v, du + 1); queue.push(v); }
    }
    for (const [t, d] of dist) if (t > s) { total += d; pairs++; } // each pair once
  }
  return pairs ? total / pairs : 0;
}

export function socialMetrics(world: World): SocialMetrics {
  const adj = buildSocialGraph(world);
  const nodes = adj.size;
  let degSum = 0;
  for (const ns of adj.values()) degSum += ns.size;
  const edges = degSum / 2;
  const avgDegree = nodes ? degSum / nodes : 0;

  // Mean local clustering coefficient over nodes with degree ≥ 2.
  let cSum = 0, cN = 0;
  for (const [u, ns] of adj) {
    const deg = ns.size;
    if (deg < 2) continue;
    const neigh = [...ns];
    let links = 0;
    for (let i = 0; i < neigh.length; i++)
      for (let j = i + 1; j < neigh.length; j++)
        if (adj.get(neigh[i])!.has(neigh[j])) links++;
    cSum += links / (deg * (deg - 1) / 2);
    cN++;
  }
  const clustering = cN ? cSum / cN : 0;

  const comps = connectedComponents(adj);
  let largest: number[] = [];
  for (const c of comps) if (c.length > largest.length) largest = c;
  const avgPathLength = avgShortestPath(adj, largest);

  // Small-world σ: clustering and path length vs an Erdős–Rényi graph of equal size
  // and density (C_rand ≈ k/n, L_rand ≈ ln n / ln k). σ > 1 ⇒ small-world.
  let smallWorldSigma = 0;
  if (avgDegree > 1 && nodes > 1 && avgPathLength > 0) {
    const cRand = avgDegree / nodes;
    const lRand = Math.log(nodes) / Math.log(avgDegree);
    if (cRand > 0 && lRand > 0) smallWorldSigma = (clustering / cRand) / (avgPathLength / lRand);
  }

  return {
    nodes, edges, avgDegree, clustering, avgPathLength,
    components: comps.length, largestComponent: largest.length, smallWorldSigma,
  };
}

// ── 3. Demographics: the age distribution ────────────────────────────────────────

export interface AgeBucket { from: number; to: number; count: number; }
export interface AgeDistribution {
  count: number;
  median: number;
  mean: number;
  childFraction: number;      // share below adultAgeYears
  buckets: AgeBucket[];       // by `bucketYears` (default decades)
}

export function ageDistribution(world: World, cfg: SimConfig, bucketYears = 10): AgeDistribution {
  const ages: number[] = [];
  for (const e of world.query(C_AGENT)) {
    ages.push(ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg));
  }
  const count = ages.length;
  if (count === 0) return { count: 0, median: 0, mean: 0, childFraction: 0, buckets: [] };
  ages.sort((a, b) => a - b);
  const median = count % 2 ? ages[(count - 1) / 2] : (ages[count / 2 - 1] + ages[count / 2]) / 2;
  const mean = ages.reduce((s, x) => s + x, 0) / count;
  const children = ages.filter(a => a < cfg.adultAgeYears).length;

  const buckets: AgeBucket[] = [];
  const maxAge = ages[count - 1];
  for (let lo = 0; lo <= maxAge; lo += bucketYears) {
    const hi = lo + bucketYears;
    buckets.push({ from: lo, to: hi, count: ages.filter(a => a >= lo && a < hi).length });
  }
  return { count, median, mean, childFraction: children / count, buckets };
}

// ── 4. Names: Zipf's law over given names & surnames ─────────────────────────────

export interface NameFrequencies { given: Map<string, number>; surname: Map<string, number>; }

// Frequency of every given name and surname across the living and the buried — so a
// whole run's naming is measured, not just the current snapshot.
export function nameFrequencies(world: World): NameFrequencies {
  const given = new Map<string, number>();
  const surname = new Map<string, number>();
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);
  const add = (full: string, sur?: string) => {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts[0]) bump(given, parts[0]);
    const s = sur ?? (parts.length > 1 ? parts[parts.length - 1] : undefined);
    if (s) bump(surname, s);
  };
  for (const e of world.query(C_AGENT)) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    add(a.name, a.surname);
  }
  for (const e of world.query(C_TOMBSTONE)) add(world.getComponent<Tombstone>(e, C_TOMBSTONE)!.name);
  return { given, surname };
}

export interface ZipfFit {
  exponent: number;  // s in freq ∝ rank^-s (≈ 1 for natural language)
  r2: number;        // straightness of the log-log rank-frequency line
  vocab: number;     // distinct tokens
  tokens: number;    // total tokens
  topShare: number;  // share of tokens held by the single most common — a concentration cue
}

// Fit Zipf's law to a multiset's frequency counts: regress ln(freq) on ln(rank).
export function zipfFit(counts: number[]): ZipfFit {
  const sorted = counts.filter(c => c > 0).sort((a, b) => b - a);
  const vocab = sorted.length;
  const tokens = sorted.reduce((s, c) => s + c, 0);
  if (vocab < 3) return { exponent: 0, r2: 0, vocab, tokens, topShare: tokens ? sorted[0] / tokens : 0 };
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < vocab; i++) { xs.push(Math.log(i + 1)); ys.push(Math.log(sorted[i])); }
  const f = linregress(xs, ys);
  return { exponent: -f.slope, r2: f.r2, vocab, tokens, topShare: sorted[0] / tokens };
}

// ── 5. Language-family shape ──────────────────────────────────────────────────────

export interface FamilyShape {
  total: number;      // tongues in the store (living + lost)
  living: number;
  extinct: number;
  roots: number;      // seed tongues with no surviving parent
  maxDepth: number;   // longest descent chain (a root counts as depth 1)
  maxBreadth: number; // most direct daughters of any one tongue
}

export function languageFamilyShape(store: LanguageStoreData): FamilyShape {
  const byId = store.byId;
  const ids = Object.keys(byId);
  let living = 0, extinct = 0, roots = 0;
  const childCount = new Map<string, number>();
  for (const id of ids) {
    const l = byId[id];
    if (l.extinct) extinct++; else living++;
    if (l.parent && byId[l.parent]) childCount.set(l.parent, (childCount.get(l.parent) ?? 0) + 1);
    else roots++;
  }
  const depthOf = (id: string): number => {
    let d = 1, cur = byId[id].parent;
    const seen = new Set<string>([id]);
    while (cur && byId[cur] && !seen.has(cur)) { d++; seen.add(cur); cur = byId[cur].parent; }
    return d;
  };
  let maxDepth = 0, maxBreadth = 0;
  for (const id of ids) maxDepth = Math.max(maxDepth, depthOf(id));
  for (const c of childCount.values()) maxBreadth = Math.max(maxBreadth, c);
  return { total: ids.length, living, extinct, roots, maxDepth, maxBreadth };
}

// ── 6. Life-orientation: the spread of causal vows (M10 slice 3) ──────────────────

export interface VowSpread {
  withVow: number;                  // adults who have settled on a guiding vow
  counts: Record<string, number>;   // vow text → how many hold it
  meanDrive: number;                // mean `purpose` over those with a vow (+ hopeful, − weary)
}

// Tally the deterministic `vow`/`purpose` distilled into each agent's memory. A pure
// read — vows are written by reflection, here we just count them across the living.
export function vowSpread(world: World): VowSpread {
  const counts: Record<string, number> = {};
  let withVow = 0, driveSum = 0;
  for (const e of world.query(C_AGENT, C_MEMORY)) {
    const m = world.getComponent<Memory>(e, C_MEMORY)!;
    if (!m.vow) continue;
    withVow++;
    counts[m.vow] = (counts[m.vow] ?? 0) + 1;
    driveSum += m.purpose ?? 0;
  }
  return { withVow, counts, meanDrive: withVow ? driveSum / withVow : 0 };
}

// ── 7. Dynasties: concentration of living folk into paternal name-lines ───────────

export interface DynastyConcentration {
  lines: number;         // distinct surnames among the living (paternal lines)
  largestShare: number;  // share of the living in the single biggest line (0..1)
  gini: number;          // inequality of line sizes (0 = all equal, 1 = one line dominates)
}

// Surnames pass down the paternal line (founders coin them), so a surname ≈ a dynasty.
// Measures whether a few family lines have come to dominate the living population.
export function dynastyConcentration(world: World): DynastyConcentration {
  const sizes = new Map<string, number>();
  let total = 0;
  for (const e of world.query(C_AGENT)) {
    const sur = world.getComponent<Agent>(e, C_AGENT)!.surname;
    if (!sur) continue;
    sizes.set(sur, (sizes.get(sur) ?? 0) + 1);
    total++;
  }
  if (total === 0) return { lines: 0, largestShare: 0, gini: 0 };
  let largest = 0;
  for (const n of sizes.values()) if (n > largest) largest = n;
  return { lines: sizes.size, largestShare: largest / total, gini: gini([...sizes.values()]) };
}

// ── 8. Mating: do partners share a culture more than chance would give? ───────────

export interface MatingAssortativity {
  pairs: number;             // living couples counted
  sameCultureFraction: number;
  expectedRandom: number;    // same-culture rate if partners paired at random
  index: number;             // (obs − exp)/(1 − exp): 1 = fully within-culture, 0 = random, <0 = mixing
}

// Compares the observed within-culture pairing rate against what random matching of the
// same partnered population would produce (a normalized homophily index). Surfaces the
// melting-pot ↔ segregation tension the culture axes (slice 2) create.
export function matingAssortativity(world: World): MatingAssortativity {
  const ids = world.query(C_AGENT, C_LINEAGE);
  const idSet = new Set(ids);
  const cultureOf = (e: number) => world.getComponent<Agent>(e, C_AGENT)!.cultureId;

  let pairs = 0, same = 0;
  const partneredCultureCounts = new Map<string, number>();
  let partneredTotal = 0;
  for (const e of ids) {
    const partner = world.getComponent<Lineage>(e, C_LINEAGE)!.partner;
    if (partner == null || !idSet.has(partner)) continue;
    // Every partnered agent contributes to the random-baseline distribution…
    const c = cultureOf(e) ?? '∅';
    partneredCultureCounts.set(c, (partneredCultureCounts.get(c) ?? 0) + 1);
    partneredTotal++;
    // …but each couple is scored once, from the lower id.
    if (e < partner) {
      pairs++;
      if (cultureOf(e) === cultureOf(partner)) same++;
    }
  }
  if (pairs === 0) return { pairs: 0, sameCultureFraction: 0, expectedRandom: 0, index: 0 };
  // Expected same-culture rate under random pairing = Simpson's index of the partnered pool.
  let expected = 0;
  for (const n of partneredCultureCounts.values()) {
    const p = n / partneredTotal;
    expected += p * p;
  }
  const obs = same / pairs;
  const index = expected < 1 ? (obs - expected) / (1 - expected) : 0;
  return { pairs, sameCultureFraction: obs, expectedRandom: expected, index };
}

// ── 9. Economy: how specialized is the town's work? ──────────────────────────────

export interface OccupationDiversity {
  workers: number;
  professions: number;  // distinct trades held
  shannon: number;      // Shannon entropy of the job mix (nats)
  evenness: number;     // shannon / ln(professions): 0 = one trade dominates, 1 = perfectly even
  topShare: number;     // share of workers in the single most common trade
}

// Shannon entropy over professions among the employed: a higher, more even spread means
// a richer division of labour; a low score means nearly everyone does the same work.
export function occupationDiversity(world: World): OccupationDiversity {
  const counts = new Map<string, number>();
  let workers = 0;
  for (const e of world.query(C_AGENT, C_JOB)) {
    const id = world.getComponent<Job>(e, C_JOB)!.professionId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    workers++;
  }
  const professions = counts.size;
  if (workers === 0 || professions === 0) {
    return { workers, professions, shannon: 0, evenness: 0, topShare: 0 };
  }
  let shannon = 0, top = 0;
  for (const n of counts.values()) {
    const p = n / workers;
    shannon -= p * Math.log(p);
    if (n > top) top = n;
  }
  const evenness = professions > 1 ? shannon / Math.log(professions) : 1;
  return { workers, professions, shannon, evenness, topShare: top / workers };
}

// ── 10. Language: bilingualism & the lingua franca ───────────────────────────────

export interface LinguisticDiversity {
  speakers: number;          // living agents who have a fluency map
  tongues: number;           // distinct tongues commanded (≥ FLUENT) by at least one of them
  bilingualFraction: number; // share who command ≥ 2 tongues at conversational fluency
  meanTongues: number;       // mean tongues known (≥ FLUENT) per speaker
  linguaFranca: string | null; // the tongue understood most widely (highest total command)
  francaShare: number;       // that tongue's mean fluency across all speakers (1 = everyone fluent)
}

// Conversational fluency: the bar at which someone is counted a speaker of a tongue.
const FLUENT = 0.5;

// How polyglot is the town, and is a common tongue emerging? Measures the slice-4
// fluency mechanic at the population level: bilingualism rises and a "lingua franca"
// surfaces as minority-tongue speakers assimilate to the majority through contact.
// A pure read of `Agent.fluency` (no RNG, no mutation).
export function linguisticDiversity(world: World): LinguisticDiversity {
  const maps: Record<string, number>[] = [];
  for (const e of world.query(C_AGENT)) {
    const f = world.getComponent<Agent>(e, C_AGENT)!.fluency;
    if (f) maps.push(f);
  }
  const speakers = maps.length;
  if (speakers === 0) {
    return { speakers: 0, tongues: 0, bilingualFraction: 0, meanTongues: 0, linguaFranca: null, francaShare: 0 };
  }
  const commanded = new Set<string>();
  const totalCommand = new Map<string, number>();   // Σ fluency per tongue → the widest-understood
  let bilingual = 0, tonguesKnownSum = 0;
  for (const f of maps) {
    let known = 0;
    for (const [lang, v] of Object.entries(f)) {
      totalCommand.set(lang, (totalCommand.get(lang) ?? 0) + v);
      if (v >= FLUENT) { commanded.add(lang); known++; }
    }
    if (known >= 2) bilingual++;
    tonguesKnownSum += known;
  }
  let franca: string | null = null, best = 0;
  for (const [lang, sum] of totalCommand) if (sum > best) { best = sum; franca = lang; }
  return {
    speakers,
    tongues: commanded.size,
    bilingualFraction: bilingual / speakers,
    meanTongues: tonguesKnownSum / speakers,
    linguaFranca: franca,
    francaShare: best / speakers,
  };
}

// ── 11. Honest wealth inequality: among working-age adults ────────────────────────

// Gini over WORKING-AGE ADULTS' gold (the real economy). Children are exempt from the
// cost of living (D38) and so sit at 0 gold; counting them inflates the all-folk Gini and
// makes the town look more unequal than it is. A pure read; gini() handles non-negatives.
export function adultWealthGini(world: World, cfg: SimConfig): number {
  const gold: number[] = [];
  for (const e of world.query(C_AGENT, C_WALLET)) {
    if (ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg) >= cfg.adultAgeYears) {
      gold.push(world.getComponent<Wallet>(e, C_WALLET)!.gold);
    }
  }
  return gini(gold);
}

// ── The bundle ───────────────────────────────────────────────────────────────────

export interface WorldMetrics {
  wealthGini: number;
  wealthGiniAdults: number;
  wealthTail: TailFit;
  social: SocialMetrics;
  ages: AgeDistribution;
  givenZipf: ZipfFit;
  surnameZipf: ZipfFit;
  family: FamilyShape | null;
  vows: VowSpread;
  dynasty: DynastyConcentration;
  mating: MatingAssortativity;
  occupation: OccupationDiversity;
  language: LinguisticDiversity;
}

// One pass measuring every emergent structure from the current world state.
export function measureWorld(world: World, cfg: SimConfig): WorldMetrics {
  // Wealth = gold held (the convention used by the HUD, strata, and soak line), so
  // the Gini here agrees with the rest of the codebase.
  const gold: number[] = [];
  for (const e of world.query(C_AGENT, C_WALLET)) {
    gold.push(world.getComponent<Wallet>(e, C_WALLET)!.gold);
  }
  const names = nameFrequencies(world);
  const lstore = getLanguageStore(world);
  return {
    wealthGini: gini(gold),
    wealthGiniAdults: adultWealthGini(world, cfg),
    wealthTail: powerLawTail(gold),
    social: socialMetrics(world),
    ages: ageDistribution(world, cfg),
    givenZipf: zipfFit([...names.given.values()]),
    surnameZipf: zipfFit([...names.surname.values()]),
    family: lstore ? languageFamilyShape(lstore) : null,
    vows: vowSpread(world),
    dynasty: dynastyConcentration(world),
    mating: matingAssortativity(world),
    occupation: occupationDiversity(world),
    language: linguisticDiversity(world),
  };
}
