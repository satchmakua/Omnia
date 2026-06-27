// Standalone headless soak runner. Usage: npm run soak
// Runs 10,000 ticks and prints world-health metrics; exits non-zero on invariant violation.

import { readFileSync } from 'node:fs';
import { createSimulation } from './world.ts';
import { tick } from './loop.ts';
import { loadSimConfig } from './configLoader.ts';
import { loadContentFromDisk } from '../content/fsSource.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_SPECIES, C_WALLET, C_MAGIC, C_JOB, C_BUSINESS,
  C_HEALTH, C_LINEAGE, C_TOMBSTONE, C_MEMORY, C_FLORA, C_FAUNA, C_RESOURCE, C_TILEMAP, C_CLOCK,
  C_CHRONICLE, C_WORLDSTATS, C_LANGUAGESTORE, C_HOME, C_ORGSTORE, C_MARKET, C_COMBAT, C_CRIME, C_RELIGIONSTORE,
} from './components.ts';
import type { Needs, Position, SpeciesComp, Wallet, Magic, Health, Agent, Clock, Market, Combat, Crime } from './components.ts';
import type { SimConfig } from './config.ts';
import { ageInYears, calendarOf } from './config.ts';
import { isPassable, isWater } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { getOrgStore } from '../org/orgStore.ts';
import { wealthStats } from './wealth.ts';
import { measureWorld } from '../analysis/metrics.ts';

const SOAK_TICKS = 40_000; // ~42 sim-years — long enough to see several generations
// Authoritative tunables from the YAML (M9); seed 8 includes a couple of mages.
const cfg: SimConfig = { ...loadSimConfig(readFileSync('config/simulation.yaml', 'utf8')), seed: 8 };

console.log(`Omnia soak: ${SOAK_TICKS} ticks, seed=${cfg.seed}, pop=${cfg.initialPopulation}`);
const t0 = Date.now();

const content = loadContentFromDisk();
const { world, rng, clockEntity } = createSimulation(cfg, content);
const tileMap = world.getComponent<TileMapData>(world.query(C_TILEMAP)[0], C_TILEMAP)!;
let violations = 0;

for (let t = 0; t < SOAK_TICKS; t++) {
  tick(world, rng, cfg, clockEntity, content);

  if ((t + 1) % 6_000 === 0) {
    const agents = world.query(C_AGENT, C_NEEDS, C_POSITION);
    const clock  = world.getComponent<Clock>(clockEntity, C_CLOCK)!;
    let inv = 0;
    const bySpecies: Record<string, number> = {};
    const orgStore = getOrgStore(world);

    for (const e of agents) {
      const n = world.getComponent<Needs>(e, C_NEEDS)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const sp = world.getComponent<SpeciesComp>(e, C_SPECIES);
      const w = world.getComponent<Wallet>(e, C_WALLET);
      const h = world.getComponent<Health>(e, C_HEALTH);
      if (sp) bySpecies[sp.id] = (bySpecies[sp.id] ?? 0) + 1;
      if (n.hunger < 0 || n.hunger > 1 || n.energy < 0 || n.energy > 1 || n.social < 0 || n.social > 1) inv++;
      if (p.x < 0 || p.x >= cfg.gridWidth || p.y < 0 || p.y >= cfg.gridHeight) inv++;
      // M2 invariant: folk stay on passable land — UNLESS they're seafaring (a boat on the water, M24).
      const orgId = world.getComponent<Agent>(e, C_AGENT)?.orgId;
      const seafarer = !!(orgId && orgStore && (orgStore.byId[orgId]?.effects?.seafaring ?? 0) > 0);
      if (!isPassable(tileMap, p.x, p.y) && !(seafarer && isWater(tileMap, p.x, p.y))) inv++;
      if (w && (w.gold < 0 || w.debt < 0)) inv++; // M3 invariant: no negative gold/debt
      if (h && (h.value < 0 || h.value > 1)) inv++; // M4 invariant: health in [0,1]
      const m = world.getComponent(e, C_MEMORY) as { utterances: unknown[]; summaries: unknown[] } | undefined;
      if (m && m.utterances.length > cfg.maxUtterances) inv++; // M5p2 invariant: utterances bounded
      if (m && m.summaries.length > cfg.maxSummaries) inv++;   // M6 invariant: episodic summaries bounded
    }

    // Fauna must also stay on passable land.
    for (const e of world.query(C_FAUNA, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (!isPassable(tileMap, p.x, p.y)) inv++;
    }

    // Homes must sit on passable land too (M11 invariant).
    for (const e of world.query(C_HOME, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (!isPassable(tileMap, p.x, p.y)) inv++;
    }

    // Mana must stay within [0, maxMana].
    for (const e of world.query(C_MAGIC)) {
      const m = world.getComponent<Magic>(e, C_MAGIC)!;
      if (m.mana < 0 || m.mana > m.maxMana) inv++;
    }

    // M6.5 invariant: no two mobile creatures (folk or fauna) share a tile.
    const occupied = new Set<number>();
    for (const e of [...world.query(C_AGENT, C_POSITION), ...world.query(C_FAUNA, C_POSITION)]) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const k = p.y * cfg.gridWidth + p.x;
      if (occupied.has(k)) inv++; else occupied.add(k);
    }

    // M6 invariants: world-history state stays bounded across the generations.
    const ch = world.getComponent(world.query(C_CHRONICLE)[0], C_CHRONICLE) as { eras: unknown[] } | undefined;
    if (ch && ch.eras.length > cfg.chronicleMaxEras) inv++;
    const ws = world.getComponent(world.query(C_WORLDSTATS)[0], C_WORLDSTATS) as { samples: unknown[] } | undefined;
    if (ws && ws.samples.length > cfg.maxStatSamples) inv++;
    const eras = ch ? ch.eras.length : 0;
    const samples = ws ? ws.samples.length : 0;
    const ls = world.getComponent(world.query(C_LANGUAGESTORE)[0], C_LANGUAGESTORE) as
      { soundChanges: number; byId: Record<string, { extinct?: boolean }> } | undefined;
    const drifts = ls ? ls.soundChanges : 0;
    const tongues = ls ? Object.keys(ls.byId).length : 0;
    const lostTongues = ls ? Object.values(ls.byId).filter(l => l.extinct).length : 0;
    const os = world.getComponent(world.query(C_ORGSTORE)[0], C_ORGSTORE) as
      { byId: Record<string, { extinct?: boolean; tier?: number; techs?: string[] }>; wars?: unknown[] } | undefined;
    const livingOrgs = os ? Object.values(os.byId).filter(o => !o.extinct) : [];
    const tribes = livingOrgs.length;
    const wars = os?.wars?.length ?? 0;
    const maxTier = livingOrgs.reduce((m, o) => Math.max(m, o.tier ?? 1), 1);
    const maxTechs = livingOrgs.reduce((m, o) => Math.max(m, o.techs?.length ?? 0), 0);
    const rs = world.getComponent(world.query(C_RELIGIONSTORE)[0], C_RELIGIONSTORE) as
      { byId: Record<string, { extinct?: boolean }> } | undefined;
    const faiths = rs ? Object.values(rs.byId).filter(r => !r.extinct).length : 0;

    violations += inv;
    const fauna = world.query(C_FAUNA).length;
    const mages = world.query(C_AGENT, C_MAGIC).length;
    const graves = world.query(C_TOMBSTONE).length;
    const nodes = world.query(C_RESOURCE).length;
    const homes = world.query(C_HOME).length;
    let beliefs = 0, utters = 0, summ = 0;
    const cultureSet = new Set<string>();
    for (const e of agents) {
      const m = world.getComponent(e, C_MEMORY) as
        { beliefs: unknown[]; utterances: unknown[]; summaries: unknown[] } | undefined;
      if (m && m.beliefs.length > 0) beliefs++;
      if (m) { utters += m.utterances.length; summ += m.summaries.length; }
      const a = world.getComponent(e, C_AGENT) as { cultureId?: string } | undefined;
      if (a?.cultureId) cultureSet.add(a.cultureId);
    }
    // Average age (years), married folk, and the locally-born (have parents).
    let ageSum = 0, married = 0, born = 0;
    for (const e of agents) {
      ageSum += ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg);
      const lin = world.getComponent(e, C_LINEAGE) as { partner: number | null; parents: number[] } | undefined;
      if (lin && lin.partner != null && world.hasComponent(lin.partner, C_AGENT)) married++;
      if (lin && lin.parents.length > 0) born++;
    }
    const avgAge = agents.length ? (ageSum / agents.length).toFixed(0) : '0';
    const wlth = wealthStats(world);
    const mkt = world.getComponent<Market>(world.query(C_MARKET)[0], C_MARKET);
    const bizEnts = world.query(C_BUSINESS);
    const foodBiz = bizEnts.filter(e => (world.getComponent(e, C_BUSINESS) as { producesFood?: boolean }).producesFood).length;
    let vets = 0, scars = 0, kills = 0;
    for (const e of world.query(C_COMBAT)) {
      const c = world.getComponent<Combat>(e, C_COMBAT)!; vets++; scars += c.scars; kills += c.kills;
    }
    let outlaws = 0, thefts = 0, assaults = 0, murders = 0;
    for (const e of world.query(C_CRIME)) {
      const c = world.getComponent<Crime>(e, C_CRIME)!; outlaws++; thefts += c.thefts; assaults += c.assaults; murders += c.murders;
    }
    const marker = inv > 0 ? ' *** VIOLATION ***' : '';
    const season = calendarOf(clock.tick, cfg).season;
    const mix = Object.entries(bySpecies).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(
      `  yr=${(clock.tick / (cfg.ticksPerDay * cfg.daysPerYear)).toFixed(0).padStart(2)}  ` +
      `folk=${String(agents.length).padStart(2)} [${mix}] avgAge=${avgAge}  ` +
      `married=${married} born=${born} graves=${graves} mages=${mages} reflective=${beliefs} utters=${utters} summ=${summ}  ` +
      `${season.padEnd(6)} fauna=${fauna} nodes=${nodes} homes=${homes} eras=${eras} samples=${samples} cultures=${cultureSet.size} tongues=${tongues}(${lostTongues} lost) tribes=${tribes}(wars=${wars}) tech=T${maxTier}/${maxTechs} faiths=${faiths} drifts=${drifts}  gini=${wlth.gini.toFixed(2)} debt=${wlth.inDebt} food=${mkt ? mkt.price.toFixed(1) : '—'}g(s/d ${mkt ? mkt.supply.toFixed(0) : '?'}/${mkt ? mkt.demand.toFixed(0) : '?'}) biz=${bizEnts.length}(farm=${foodBiz}) vets=${vets}(scars=${scars} kills=${kills}) crime=${outlaws}out(t=${thefts} a=${assaults} m=${murders})  invalid=${inv}${marker}`,
    );
  }
}

const elapsed = Date.now() - t0;
const finalPop = world.query(C_AGENT).length;
const clock = world.getComponent<Clock>(clockEntity, C_CLOCK)!;

console.log(`\nDone in ${elapsed}ms | final day=${clock.day} pop=${finalPop}`);

// Science & Instrumentation (M7.7, D29): measure the emergent structure of the run.
// Pure reads of durable state — no RNG, no mutation, so this never perturbs the run.
if (finalPop > 0) {
  const m = measureWorld(world, cfg);
  const f = (x: number, d = 2) => x.toFixed(d);
  console.log('\nScience — emergent structure (measured from final state):');
  console.log(
    `  wealth:   gini=${f(m.wealthGini)} (adults ${f(m.wealthGiniAdults)})  power-law tail α=${f(m.wealthTail.alpha)} ` +
    `(over top ${m.wealthTail.k}, r²=${f(m.wealthTail.r2)})`,
  );
  console.log(
    `  social:   n=${m.social.nodes} edges=${m.social.edges} <k>=${f(m.social.avgDegree)} ` +
    `C=${f(m.social.clustering)} L=${f(m.social.avgPathLength)} ` +
    `σ(small-world)=${f(m.social.smallWorldSigma)} comps=${m.social.components}/${m.social.largestComponent}`,
  );
  console.log(
    `  ages:     n=${m.ages.count} median=${f(m.ages.median, 1)}y mean=${f(m.ages.mean, 1)}y ` +
    `children=${f(m.ages.childFraction * 100, 0)}%`,
  );
  console.log(
    `  names:    surname Zipf s=${f(m.surnameZipf.exponent)} (r²=${f(m.surnameZipf.r2)}, ` +
    `vocab=${m.surnameZipf.vocab}, top=${f(m.surnameZipf.topShare * 100, 0)}%) ` +
    `| given s=${f(m.givenZipf.exponent)} (vocab=${m.givenZipf.vocab})`,
  );
  if (m.family) {
    console.log(
      `  tongues:  total=${m.family.total} living=${m.family.living} lost=${m.family.extinct} ` +
      `roots=${m.family.roots} depth=${m.family.maxDepth} breadth=${m.family.maxBreadth}`,
    );
  }
  console.log(
    `  fluency:  speak=${m.language.tongues} tongues  bilingual=${f(m.language.bilingualFraction * 100, 0)}% ` +
    `mean=${f(m.language.meanTongues, 2)}/head  lingua franca=${m.language.linguaFranca ?? '—'} ` +
    `(${f(m.language.francaShare * 100, 0)}% command)`,
  );
  console.log(`  wellbeing: mean mood=${f(m.mood)}`);
}

if (violations > 0) {
  console.error(`FAILED: ${violations} invariant violation(s)`);
  process.exit(1);
}
if (finalPop === 0) {
  console.warn('WARNING: all agents died (check food balance)');
}
console.log('PASS');
