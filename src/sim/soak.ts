// Standalone headless soak runner. Usage: npm run soak
// Runs 10,000 ticks and prints world-health metrics; exits non-zero on invariant violation.

import { createSimulation } from './world.ts';
import { tick } from './loop.ts';
import { defaultConfig } from './config.ts';
import { loadContentFromDisk } from '../content/fsSource.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_SPECIES, C_WALLET, C_MAGIC, C_JOB, C_BUSINESS,
  C_FLORA, C_FAUNA, C_RESOURCE, C_TILEMAP, C_CLOCK,
} from './components.ts';
import type { Needs, Position, SpeciesComp, Wallet, Magic, Clock } from './components.ts';
import type { SimConfig } from './config.ts';
import { isPassable } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { wealthStats } from './wealth.ts';

const SOAK_TICKS = 10_000;
const cfg: SimConfig = { ...defaultConfig, seed: 7 }; // seed 7 happens to include a mage

console.log(`Omnia soak: ${SOAK_TICKS} ticks, seed=${cfg.seed}, pop=${cfg.initialPopulation}`);
const t0 = Date.now();

const content = loadContentFromDisk();
const { world, rng, clockEntity } = createSimulation(cfg, content);
const tileMap = world.getComponent<TileMapData>(world.query(C_TILEMAP)[0], C_TILEMAP)!;
let violations = 0;

for (let t = 0; t < SOAK_TICKS; t++) {
  tick(world, rng, cfg, clockEntity, content);

  if ((t + 1) % 1_000 === 0) {
    const agents = world.query(C_AGENT, C_NEEDS, C_POSITION);
    const clock  = world.getComponent<Clock>(clockEntity, C_CLOCK)!;
    let inv = 0;
    const bySpecies: Record<string, number> = {};

    for (const e of agents) {
      const n = world.getComponent<Needs>(e, C_NEEDS)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const sp = world.getComponent<SpeciesComp>(e, C_SPECIES);
      const w = world.getComponent<Wallet>(e, C_WALLET);
      if (sp) bySpecies[sp.id] = (bySpecies[sp.id] ?? 0) + 1;
      if (n.hunger < 0 || n.hunger > 1 || n.energy < 0 || n.energy > 1) inv++;
      if (p.x < 0 || p.x >= cfg.gridWidth || p.y < 0 || p.y >= cfg.gridHeight) inv++;
      if (!isPassable(tileMap, p.x, p.y)) inv++;  // M2 invariant: never on water/blocked
      if (w && (w.gold < 0 || w.debt < 0)) inv++; // M3 invariant: no negative gold/debt
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

    violations += inv;
    const fauna = world.query(C_FAUNA).length;
    const employed = world.query(C_AGENT, C_JOB).length;
    const businesses = world.query(C_BUSINESS).length;
    const mages = world.query(C_AGENT, C_MAGIC).length;
    const wlth = wealthStats(world);
    const marker = inv > 0 ? ' *** VIOLATION ***' : '';
    const mix = Object.entries(bySpecies).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(
      `  tick=${t+1}  day=${clock.day}  folk=${agents.length} [${mix}]  fauna=${fauna}  mages=${mages}  ` +
      `jobs=${employed}/${agents.length}@${businesses}biz  ` +
      `wealth(min/med/max)=${Math.round(wlth.min)}/${Math.round(wlth.median)}/${Math.round(wlth.max)} ` +
      `gini=${wlth.gini.toFixed(2)} inDebt=${wlth.inDebt}  invalid=${inv}${marker}`,
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
