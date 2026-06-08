// Standalone headless soak runner. Usage: npm run soak
// Runs 10,000 ticks and prints world-health metrics; exits non-zero on invariant violation.

import { createSimulation } from './world.ts';
import { tick } from './loop.ts';
import { defaultConfig } from './config.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_CLOCK } from './components.ts';
import type { Needs, Position, Clock } from './components.ts';
import type { SimConfig } from './config.ts';

const SOAK_TICKS = 10_000;
const cfg: SimConfig = { ...defaultConfig, seed: 42 };

console.log(`Omnia soak: ${SOAK_TICKS} ticks, seed=${cfg.seed}, pop=${cfg.initialPopulation}`);
const t0 = Date.now();

const { world, rng, clockEntity } = createSimulation(cfg);
let violations = 0;

for (let t = 0; t < SOAK_TICKS; t++) {
  tick(world, rng, cfg, clockEntity);

  if ((t + 1) % 1_000 === 0) {
    const agents = world.query(C_AGENT, C_NEEDS, C_POSITION);
    const clock  = world.getComponent<Clock>(clockEntity, C_CLOCK)!;
    let inv = 0;

    for (const e of agents) {
      const n = world.getComponent<Needs>(e, C_NEEDS)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (n.hunger < 0 || n.hunger > 1 || n.energy < 0 || n.energy > 1) inv++;
      if (p.x < 0 || p.x >= cfg.gridWidth || p.y < 0 || p.y >= cfg.gridHeight) inv++;
    }

    violations += inv;
    const marker = inv > 0 ? ' *** VIOLATION ***' : '';
    console.log(
      `  tick=${t+1}  day=${clock.day}  pop=${agents.length}  invalid=${inv}${marker}`,
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
