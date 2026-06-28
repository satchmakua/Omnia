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
import type { InterventionsData, Agent, Health, Wallet, Clock, Position } from '../src/sim/components.ts';
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
    const { world, rng } = createSimulation(cfg, content);
    const a = world.query(C_AGENT)[0];
    world.getComponent<Health>(a, C_HEALTH)!.value = 0.3;
    const g0 = world.getComponent<Wallet>(a, C_WALLET)!.gold;
    applyIntervention(world, cfg, { tick: 1, kind: 'bless', target: a }, content, rng);
    expect(world.getComponent<Health>(a, C_HEALTH)!.value).toBe(1);
    applyIntervention(world, cfg, { tick: 1, kind: 'bestow', target: a, amount: 100 }, content, rng);
    expect(world.getComponent<Wallet>(a, C_WALLET)!.gold).toBe(g0 + 100);
    applyIntervention(world, cfg, { tick: 1, kind: 'curse', target: a }, content, rng);
    expect(world.getComponent<Health>(a, C_HEALTH)!.value).toBeLessThan(1);
  });

  it('an act fires once, not twice (the applied guard)', () => {
    const { world, rng } = createSimulation(cfg, content);
    const a = world.query(C_AGENT)[0];
    const wallet = world.getComponent<Wallet>(a, C_WALLET)!;
    const g0 = wallet.gold;
    const iv = enqueueIntervention(world, 'bestow', a, 50)!;
    iv.tick = tickOf(world);                 // due now
    runInterventionSystem(world, cfg, rng, content);
    runInterventionSystem(world, cfg, rng, content);   // a second pass must not re-apply
    expect(wallet.gold).toBe(g0 + 50);
    expect(iv.applied).toBe(true);
  });

  // ── M27 s2: the powers are content ──────────────────────────────────────────────
  it('the power roster is loaded as content (smite/bless/curse/bestow + summons)', () => {
    expect(content.powers.has('smite')).toBe(true);
    expect(content.powers.has('bless')).toBe(true);
    expect(content.powers.has('curse')).toBe(true);
    expect(content.powers.has('bestow')).toBe(true);
    expect(content.powers.require('bestow').amount).toBe(50);   // default magnitude is data
    // a summon power names the world event it fires (ref-checked at load).
    const fest = content.powers.require('summon_festival');
    expect(fest.effect).toBe('summon');
    expect(fest.target).toBe('world');
    expect(content.events.has(fest.event!)).toBe(true);
  });

  it('an unknown power id is ignored (forward-compatible)', () => {
    const { world, rng } = createSimulation(cfg, content);
    const a = world.query(C_AGENT)[0];
    const g0 = world.getComponent<Wallet>(a, C_WALLET)!.gold;
    applyIntervention(world, cfg, { tick: 1, kind: 'no_such_power', target: a }, content, rng);
    expect(world.getComponent<Wallet>(a, C_WALLET)!.gold).toBe(g0);   // nothing happened
  });

  it('a summon fires a world event through the M19 pipeline — a festival lifts mood', () => {
    const { world, rng } = createSimulation(cfg, content);
    const a = world.query(C_AGENT)[0];
    world.getComponent<Agent>(a, C_AGENT)!.mood = 0.5;
    applyIntervention(world, cfg, { tick: 1, kind: 'summon_festival', target: null }, content, rng);
    expect(world.getComponent<Agent>(a, C_AGENT)!.mood!).toBeCloseTo(0.65, 5);   // festival = +0.15
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

  it('REPLAY IS EXACT for an RNG-drawing power: a summoned plague reproduces the run (M27 s2)', () => {
    // A summoned plague draws from the seeded RNG (it picks who falls ill) — the rng path. Because the
    // InterventionSystem runs at a fixed point each tick and the act is recorded, replay draws the same.
    const A = createSimulation(cfg, content);
    for (let t = 0; t < 40; t++) tick(A.world, A.rng, cfg, A.clockEntity, content);
    enqueueIntervention(A.world, 'summon_plague', null);
    const recorded = logOf(A.world).map(iv => ({ ...iv }));
    for (let t = 0; t < 100; t++) tick(A.world, A.rng, cfg, A.clockEntity, content);
    const healthHit = A.world.query(C_AGENT).some(e => (A.world.getComponent<Health>(e, C_HEALTH)?.value ?? 1) < 1);
    expect(healthHit).toBe(true);   // the plague actually bit (rng drew victims)

    const B = createSimulation(cfg, content);
    logOf(B.world).push(...recorded.map(iv => ({ ...iv, applied: false })));
    for (let t = 0; t < 140; t++) tick(B.world, B.rng, cfg, B.clockEntity, content);

    expect(fingerprint(B.world)).toBe(fingerprint(A.world));     // byte-identical despite the RNG draw
  });
});
