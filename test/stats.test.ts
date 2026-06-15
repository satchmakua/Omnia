import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_WALLET, C_LINEAGE, C_MAGIC, C_TOMBSTONE, C_CLOCK, C_CHRONICLE, C_WORLDSTATS,
} from '../src/sim/components.ts';
import type { Agent, Wallet, Lineage, Magic, Tombstone, Clock } from '../src/sim/components.ts';
import { createWorldStats, sampleStats } from '../src/history/stats.ts';
import type { WorldStatsData } from '../src/history/stats.ts';
import { createChronicle, chronicleAdd } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { runHistorySystem } from '../src/sim/systems/HistorySystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;

function addAgent(w: World, opts: { parents?: EntityId[]; partner?: EntityId | null; gold?: number; mage?: boolean; ageTicks?: number }): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: 'A', action: 'wander', ticksAlive: opts.ageTicks ?? 1000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9,
  });
  w.addComponent<Wallet>(e, C_WALLET, { gold: opts.gold ?? 10, debt: 0 });
  w.addComponent<Lineage>(e, C_LINEAGE, {
    partner: opts.partner ?? null, parents: opts.parents ?? [], children: [], reproCooldownTicks: 0,
  });
  if (opts.mage) w.addComponent<Magic>(e, C_MAGIC, { mana: 10, maxMana: 100, manaRegenPerTick: 0.1 });
  return e;
}

function addTomb(w: World, cause: string, parents: EntityId[] = []): EntityId {
  const e = w.createEntity();
  w.addComponent<Tombstone>(e, C_TOMBSTONE, {
    name: 'Dead', speciesName: 'Human', sex: 'male', bornTick: 0, diedTick: 100, ageYears: 40,
    role: null, cause, legacy: '', partner: null, parents, children: [],
  });
  return e;
}

describe('sampleStats', () => {
  it('derives the town aggregates from living agents and tombstones', () => {
    const w = new World();
    const ws = createWorldStats();
    const founderA = addAgent(w, { gold: 100 });
    const founderB = addAgent(w, { gold: 0 });
    addAgent(w, { parents: [founderA], mage: true });  // a locally-born mage
    w.getComponent<Lineage>(founderA, C_LINEAGE)!.partner = founderB; // a couple
    w.getComponent<Lineage>(founderB, C_LINEAGE)!.partner = founderA;
    addTomb(w, 'old age', [founderA]);   // a dead agent who was born in-sim
    addTomb(w, 'illness');               // a dead founder

    sampleStats(w, ws, cfg, ticksPerYear(cfg) * 5);
    const s = ws.samples[0];
    expect(s.year).toBe(5);
    expect(s.population).toBe(3);
    expect(s.mages).toBe(1);
    expect(s.deaths).toBe(2);
    expect(s.births).toBe(2);          // 1 living with parents + 1 tombstone with parents
    expect(s.marriages).toBe(1);       // founderA ↔ founderB
    expect(s.medianWealth).toBe(10);   // gold 0/10/100 → median 10
    expect(ws.causeOfDeath).toEqual({ 'old age': 1, illness: 1 });
  });

  it('bounds the time-series to maxStatSamples', () => {
    const w = new World();
    addAgent(w, {});
    const ws = createWorldStats();
    const tiny = { ...cfg, maxStatSamples: 3 };
    for (let i = 0; i < 6; i++) sampleStats(w, ws, tiny, i * ticksPerYear(tiny));
    expect(ws.samples.length).toBe(3);
    expect(ws.samples[ws.samples.length - 1].year).toBe(5); // newest retained
  });
});

describe('runHistorySystem', () => {
  function world(tick: number) {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 0, hour: 0, isDay: true });
    w.addComponent<WorldStatsData>(w.createEntity(), C_WORLDSTATS, createWorldStats());
    const chron = createChronicle();
    for (let i = 0; i < 12; i++) chronicleAdd(chron, { tick: i, importance: 0.7, kind: 'birth', text: `b${i}` });
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, chron);
    addAgent(w, {});
    return w;
  }

  it('samples the strata and compresses the Chronicle on schedule', () => {
    const small = { ...cfg, statsSampleIntervalDays: 1, chronicleRecentCap: 8, chronicleRetainAfterRollup: 4 };
    const w = world(small.statsSampleIntervalDays * small.ticksPerDay);
    runHistorySystem(w, small);

    const ws = w.getComponent<WorldStatsData>(w.query(C_WORLDSTATS)[0], C_WORLDSTATS)!;
    const chron = w.getComponent<ChronicleData>(w.query(C_CHRONICLE)[0], C_CHRONICLE)!;
    expect(ws.samples.length).toBe(1);
    expect(chron.entries.length).toBe(4); // compressed down to the retain window
    expect(chron.eras.length).toBe(1);
  });

  it('does not sample again until the interval elapses', () => {
    const small = { ...cfg, statsSampleIntervalDays: 1 };
    const interval = small.statsSampleIntervalDays * small.ticksPerDay;
    const w = world(interval);
    const ws = w.getComponent<WorldStatsData>(w.query(C_WORLDSTATS)[0], C_WORLDSTATS)!;
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;

    runHistorySystem(w, small);                 // first sample (no prior sample → always fires)
    expect(ws.samples.length).toBe(1);

    clock.tick = interval * 2 - 1;              // < one interval since the last sample
    runHistorySystem(w, small);
    expect(ws.samples.length).toBe(1);          // throttled

    clock.tick = interval * 2;                  // a full interval later
    runHistorySystem(w, small);
    expect(ws.samples.length).toBe(2);
  });
});

describe('world history through the live loop', () => {
  it('accrues strata samples and compresses the Chronicle as the town lives', () => {
    const content = testContent();
    // Small Chronicle caps so the births/deaths/weddings overflow into eras within the run.
    const c = {
      ...defaultConfig, seed: 8, chronicleRecentCap: 10, chronicleRetainAfterRollup: 5, chronicleMaxEras: 3,
    };
    const { world, rng, clockEntity } = createSimulation(c, content);
    runTicks(world, rng, c, clockEntity, content, 12000);

    const ws = world.getComponent<WorldStatsData>(world.query(C_WORLDSTATS)[0], C_WORLDSTATS)!;
    const chron = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE)!;

    expect(ws.samples.length).toBeGreaterThan(0);
    expect(ws.samples.length).toBeLessThanOrEqual(c.maxStatSamples);
    expect(ws.samples[ws.samples.length - 1].population).toBeGreaterThan(0);
    expect(chron.eras.length).toBeGreaterThan(0);              // the rollup fired through the loop
    expect(chron.eras.length).toBeLessThanOrEqual(c.chronicleMaxEras);
    expect(chron.entries.length).toBeLessThanOrEqual(c.chronicleRecentCap);
  }, 20_000);
});
