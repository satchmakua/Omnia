// Standalone headless soak runner. Usage: npm run soak
// Runs 10,000 ticks and prints world-health metrics; exits non-zero on invariant violation.

import { createSimulation } from './world.ts';
import { tick } from './loop.ts';
import { defaultConfig } from './config.ts';
import { loadContentFromDisk } from '../content/fsSource.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_SPECIES, C_WALLET, C_MAGIC, C_JOB, C_BUSINESS,
  C_HEALTH, C_LINEAGE, C_TOMBSTONE, C_MEMORY, C_FLORA, C_FAUNA, C_RESOURCE, C_TILEMAP, C_CLOCK,
  C_CHRONICLE, C_WORLDSTATS,
} from './components.ts';
import type { Needs, Position, SpeciesComp, Wallet, Magic, Health, Agent, Clock } from './components.ts';
import type { SimConfig } from './config.ts';
import { ageInYears } from './config.ts';
import { isPassable } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { wealthStats } from './wealth.ts';

const SOAK_TICKS = 40_000; // ~42 sim-years — long enough to see several generations
const cfg: SimConfig = { ...defaultConfig, seed: 8 }; // seed 8 includes a couple of mages

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

    for (const e of agents) {
      const n = world.getComponent<Needs>(e, C_NEEDS)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const sp = world.getComponent<SpeciesComp>(e, C_SPECIES);
      const w = world.getComponent<Wallet>(e, C_WALLET);
      const h = world.getComponent<Health>(e, C_HEALTH);
      if (sp) bySpecies[sp.id] = (bySpecies[sp.id] ?? 0) + 1;
      if (n.hunger < 0 || n.hunger > 1 || n.energy < 0 || n.energy > 1 || n.social < 0 || n.social > 1) inv++;
      if (p.x < 0 || p.x >= cfg.gridWidth || p.y < 0 || p.y >= cfg.gridHeight) inv++;
      if (!isPassable(tileMap, p.x, p.y)) inv++;  // M2 invariant: never on water/blocked
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

    // Mana must stay within [0, maxMana].
    for (const e of world.query(C_MAGIC)) {
      const m = world.getComponent<Magic>(e, C_MAGIC)!;
      if (m.mana < 0 || m.mana > m.maxMana) inv++;
    }

    // M6 invariants: world-history state stays bounded across the generations.
    const ch = world.getComponent(world.query(C_CHRONICLE)[0], C_CHRONICLE) as { eras: unknown[] } | undefined;
    if (ch && ch.eras.length > cfg.chronicleMaxEras) inv++;
    const ws = world.getComponent(world.query(C_WORLDSTATS)[0], C_WORLDSTATS) as { samples: unknown[] } | undefined;
    if (ws && ws.samples.length > cfg.maxStatSamples) inv++;
    const eras = ch ? ch.eras.length : 0;
    const samples = ws ? ws.samples.length : 0;

    violations += inv;
    const fauna = world.query(C_FAUNA).length;
    const mages = world.query(C_AGENT, C_MAGIC).length;
    const graves = world.query(C_TOMBSTONE).length;
    const nodes = world.query(C_RESOURCE).length;
    let beliefs = 0, utters = 0, summ = 0;
    for (const e of agents) {
      const m = world.getComponent(e, C_MEMORY) as
        { beliefs: unknown[]; utterances: unknown[]; summaries: unknown[] } | undefined;
      if (m && m.beliefs.length > 0) beliefs++;
      if (m) { utters += m.utterances.length; summ += m.summaries.length; }
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
    const marker = inv > 0 ? ' *** VIOLATION ***' : '';
    const mix = Object.entries(bySpecies).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(
      `  yr=${(clock.tick / (cfg.ticksPerDay * cfg.daysPerYear)).toFixed(0).padStart(2)}  ` +
      `folk=${String(agents.length).padStart(2)} [${mix}] avgAge=${avgAge}  ` +
      `married=${married} born=${born} graves=${graves} mages=${mages} reflective=${beliefs} utters=${utters} summ=${summ}  ` +
      `fauna=${fauna} nodes=${nodes} eras=${eras} samples=${samples}  gini=${wlth.gini.toFixed(2)}  invalid=${inv}${marker}`,
    );
  }
}

const elapsed = Date.now() - t0;
const finalPop = world.query(C_AGENT).length;
const clock = world.getComponent<Clock>(clockEntity, C_CLOCK)!;

console.log(`\nDone in ${elapsed}ms | final day=${clock.day} pop=${finalPop}`);

if (violations > 0) {
  console.error(`FAILED: ${violations} invariant violation(s)`);
  process.exit(1);
}
if (finalPop === 0) {
  console.warn('WARNING: all agents died (check food balance)');
}
console.log('PASS');
