// God mode — the intervention seam (M27 s1). A divine act is a recorded event in the deterministic
// log; the InterventionSystem applies it on its tick, and the log replays exactly. These tests cover
// the powers, the once-only guard, and — the milestone DoD — that a recorded act reproduces the run.
import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/sim/config.ts';
import { createSimulation } from '../src/sim/world.ts';
import { tick } from '../src/sim/loop.ts';
import { runInterventionSystem } from '../src/sim/systems/InterventionSystem.ts';
import { enqueueIntervention, applyIntervention } from '../src/sim/interventions.ts';
import {
  C_AGENT, C_INTERVENTIONS, C_NEEDS, C_HEALTH, C_WALLET, C_CLOCK, C_POSITION, C_TOMBSTONE,
} from '../src/sim/components.ts';
import type { InterventionsData, Health, Wallet, Clock, Position } from '../src/sim/components.ts';
import type { World } from '../src/sim/ecs.ts';
import { testContent } from './helpers.ts';

const content = testContent();
const cfg = { ...defaultConfig, seed: 8 };

const logOf = (w: World) => w.getComponent<InterventionsData>(w.query(C_INTERVENTIONS)[0], C_INTERVENTIONS)!.log;
const tickOf = (w: World) => w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!.tick;
function fingerprint(w: World): string {
  let s = '';
  for (const e of w.query(C_AGENT)) {
    const p = w.getComponent<Position>(e, C_POSITION);
    const h = w.getComponent<Health>(e, C_HEALTH);
    const wal = w.getComponent<Wallet>(e, C_WALLET);
    s += `${e}:${p?.x},${p?.y};${h?.value.toFixed(4)};${wal?.gold.toFixed(2)}|`;
  }
  return `${s}pop${w.query(C_AGENT).length}graves${w.query(C_TOMBSTONE).length}`;
}

describe('god mode — the intervention seam (M27 s1)', () => {
  it('enqueue records an act for the next tick (off by default — the log starts empty)', () => {
    const { world } = createSimulation(cfg, content);
    expect(logOf(world).length).toBe(0);   // observe-only default: nothing enqueued
    const iv = enqueueIntervention(world, 'smite', 999);
    expect(iv).not.toBeNull();
    expect(iv!.tick).toBe(tickOf(world) + 1);
    expect(iv!.applied).toBe(false);
    expect(logOf(world).length).toBe(1);
  });

  it('a smite strikes the target down on its scheduled tick (not before)', () => {
    const { world, rng, clockEntity } = createSimulation(cfg, content);
    const victim = world.query(C_AGENT)[0];
    enqueueIntervention(world, 'smite', victim);
    expect(world.hasComponent(victim, C_AGENT)).toBe(true);    // still alive this tick
    tick(world, rng, cfg, clockEntity, content);               // the next tick applies it
    expect(world.hasComponent(victim, C_AGENT)).toBe(false);   // struck down
    expect(world.hasComponent(victim, C_TOMBSTONE)).toBe(true);
  });

  it('bless restores, curse saps, bestow gifts gold', () => {
    const { world } = createSimulation(cfg, content);
    const a = world.query(C_AGENT)[0];
    world.getComponent<Health>(a, C_HEALTH)!.value = 0.3;
    const g0 = world.getComponent<Wallet>(a, C_WALLET)!.gold;
    applyIntervention(world, cfg, { tick: 1, kind: 'bless', target: a });
    expect(world.getComponent<Health>(a, C_HEALTH)!.value).toBe(1);
    applyIntervention(world, cfg, { tick: 1, kind: 'bestow', target: a, amount: 100 });
    expect(world.getComponent<Wallet>(a, C_WALLET)!.gold).toBe(g0 + 100);
    applyIntervention(world, cfg, { tick: 1, kind: 'curse', target: a });
    expect(world.getComponent<Health>(a, C_HEALTH)!.value).toBeLessThan(1);
  });

  it('an act fires once, not twice (the applied guard)', () => {
    const { world } = createSimulation(cfg, content);
    const a = world.query(C_AGENT)[0];
    const wallet = world.getComponent<Wallet>(a, C_WALLET)!;
    const g0 = wallet.gold;
    const iv = enqueueIntervention(world, 'bestow', a, 50)!;
    iv.tick = tickOf(world);                 // due now
    runInterventionSystem(world, cfg);
    runInterventionSystem(world, cfg);        // a second pass must not re-apply
    expect(wallet.gold).toBe(g0 + 50);
    expect(iv.applied).toBe(true);
  });

  it('REPLAY IS EXACT: a recorded act reproduces the run identically (the DoD)', () => {
    // Live run: play 40 ticks, then a god strikes — capture the log, run on to tick 140.
    const A = createSimulation(cfg, content);
    for (let t = 0; t < 40; t++) tick(A.world, A.rng, cfg, A.clockEntity, content);
    const victim = A.world.query(C_AGENT)[3];
    enqueueIntervention(A.world, 'smite', victim);
    const recorded = logOf(A.world).map(iv => ({ ...iv }));   // the durable record
    for (let t = 0; t < 100; t++) tick(A.world, A.rng, cfg, A.clockEntity, content);

    // Replay: a fresh world (same seed) given only the recorded log, run the same total ticks.
    const B = createSimulation(cfg, content);
    logOf(B.world).push(...recorded.map(iv => ({ ...iv, applied: false })));
    for (let t = 0; t < 140; t++) tick(B.world, B.rng, cfg, B.clockEntity, content);

    expect(B.world.hasComponent(victim, C_AGENT)).toBe(false);   // the same soul fell
    expect(fingerprint(B.world)).toBe(fingerprint(A.world));     // byte-identical world
  });
});
