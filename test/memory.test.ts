import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_MEMORY, C_CLOCK } from '../src/sim/components.ts';
import type { Agent, Memory, MemoryEntry, EpisodicSummary, Clock } from '../src/sim/components.ts';
import { summarizeBlock, mergeSummaries, consolidateMemory } from '../src/ai/consolidation.ts';
import { remember } from '../src/ai/memory.ts';
import { runMemorySystem } from '../src/sim/systems/MemorySystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { testContent } from './helpers.ts';

function makeMem(events: MemoryEntry[] = []): Memory {
  return {
    events: [...events], summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
    utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9,
  };
}
function evs(n: number, importance = 0.2, base = 0): MemoryEntry[] {
  return Array.from({ length: n }, (_, i) => ({ tick: base + i, text: `e${base + i}`, importance }));
}

// ── summarizeBlock ──────────────────────────────────────────────────────────────

describe('summarizeBlock', () => {
  it('names notable events and folds the trivia into a count', () => {
    const block: MemoryEntry[] = [
      { tick: 10, text: 'wed Mara', importance: 0.7 },
      { tick: 12, text: 'their child was born', importance: 0.85 },
      { tick: 15, text: 'wandered', importance: 0.1 },
      { tick: 18, text: 'took work', importance: 0.3 },
    ];
    const s = summarizeBlock(block, 0.6);
    expect(s.fromTick).toBe(10);
    expect(s.toTick).toBe(18);
    expect(s.count).toBe(4);
    expect(s.importance).toBeCloseTo(0.85);
    expect(s.text).toContain('wed Mara');
    expect(s.text).toContain('their child was born');
    expect(s.text).toContain('2 quieter days'); // the two trivial entries dissolve
  });

  it('an all-trivial block becomes a bare count', () => {
    const s = summarizeBlock([{ tick: 1, text: 'a', importance: 0.1 }, { tick: 2, text: 'b', importance: 0.2 }], 0.6);
    expect(s.text).toBe('2 quiet, unremarkable days');
    expect(s.importance).toBeCloseTo(0.2);
  });

  it('names at most three notable events; the rest fold away', () => {
    const block = Array.from({ length: 5 }, (_, i) => ({ tick: i, text: `big${i}`, importance: 0.9 }));
    const s = summarizeBlock(block, 0.6);
    expect(s.text).toContain('big0');
    expect(s.text).toContain('big2');
    expect(s.text).not.toContain('big3');
    expect(s.text).toContain('and 2'); // two un-named events folded
    expect(s.count).toBe(5);
  });
});

// ── mergeSummaries ──────────────────────────────────────────────────────────────

describe('mergeSummaries', () => {
  const early: EpisodicSummary = { fromTick: 0, toTick: 10, text: 'early era', importance: 0.4, count: 3 };
  const big: EpisodicSummary = { fromTick: 11, toTick: 20, text: 'a great wedding', importance: 0.8, count: 2 };

  it('coarsens to the more notable era, widening the span and summing the count', () => {
    const m = mergeSummaries(early, big);
    expect(m.fromTick).toBe(0);
    expect(m.toTick).toBe(20);
    expect(m.importance).toBeCloseTo(0.8);
    expect(m.count).toBe(5);
    expect(m.text).toBe('a great wedding'); // the vivid era keeps its words
  });

  it('keeps the higher-importance text regardless of order', () => {
    expect(mergeSummaries(big, early).text).toBe('a great wedding');
  });
});

// ── consolidateMemory ───────────────────────────────────────────────────────────

describe('consolidateMemory', () => {
  it('does nothing while the working set fits', () => {
    const mem = makeMem(evs(5));
    expect(consolidateMemory(mem, 5, 3, 0.6, 2)).toBe(false);
    expect(mem.events.length).toBe(5);
    expect(mem.summaries.length).toBe(0);
  });

  it('rolls the oldest overflow into a digest and keeps the recent raw', () => {
    const mem = makeMem(evs(8));
    expect(consolidateMemory(mem, 5, 3, 0.6, 2)).toBe(true);
    expect(mem.events.map(e => e.text)).toEqual(['e5', 'e6', 'e7']); // the 3 most-recent survive raw
    expect(mem.summaries.length).toBe(1);
    expect(mem.summaries[0].count).toBe(5); // the 5 oldest were digested
  });

  it('bounds the digest thread by merging the oldest eras', () => {
    const mem = makeMem(evs(8));
    for (let r = 0; r < 3; r++) {
      consolidateMemory(mem, 5, 3, 0.6, 2);
      // refill the working set past the high-water mark for the next rollup
      mem.events.push(...evs(5, 0.2, 100 + r * 10));
    }
    expect(mem.summaries.length).toBeLessThanOrEqual(2); // maxSummaries respected via merging
  });
});

// ── remember is now pure-append ───────────────────────────────────────────────────

describe('remember (pure append)', () => {
  it('no longer drops old memories — the scheduled rollup owns bounding', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent<Memory>(e, C_MEMORY, makeMem());
    for (let i = 0; i < 60; i++) remember(w, e, i, `m${i}`, 0.1);
    expect(w.getComponent<Memory>(e, C_MEMORY)!.events.length).toBe(60);
  });
});

// ── runMemorySystem (scheduling) ──────────────────────────────────────────────────

describe('runMemorySystem', () => {
  const cfg = {
    ...defaultConfig, ticksPerDay: 240, workingMemorySize: 5, memoryRetainAfterRollup: 3,
    maxSummaries: 2, memoryRollupIntervalDays: 1, summaryImportanceThreshold: 0.6,
  };

  function world(tick: number) {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 0, hour: 0, isDay: true });
    const a = w.createEntity();
    w.addComponent<Agent>(a, C_AGENT, { name: 'Mara', action: 'wander', ticksAlive: 1, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
    w.addComponent<Memory>(a, C_MEMORY, makeMem(evs(8)));
    return { w, a };
  }

  it('rolls up an overgrown memory and stamps the rollup tick', () => {
    const { w, a } = world(0);
    runMemorySystem(w, cfg);
    const mem = w.getComponent<Memory>(a, C_MEMORY)!;
    expect(mem.events.length).toBe(3);
    expect(mem.summaries.length).toBe(1);
    expect(mem.lastRollupTick).toBe(0);
  });

  it('does not roll up again within the interval', () => {
    const { w, a } = world(0);
    runMemorySystem(w, cfg);                              // rolls up at tick 0
    const mem = w.getComponent<Memory>(a, C_MEMORY)!;
    mem.events.push(...evs(8, 0.2, 100));                 // overgrow again
    w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!.tick = 239; // < interval (240)
    runMemorySystem(w, cfg);
    expect(mem.summaries.length).toBe(1);                 // unchanged

    w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!.tick = 240; // interval elapsed
    runMemorySystem(w, cfg);
    expect(mem.summaries.length).toBe(2);                 // rolled up again
  });

  it('keeps memory bounded across many scheduled rollups', () => {
    const { w, a } = world(0);
    const mem = w.getComponent<Memory>(a, C_MEMORY)!;
    for (let day = 0; day < 40; day++) {
      w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!.tick = day * 240;
      mem.events.push(...evs(4, 0.2, 1000 + day * 10)); // steady new memories
      runMemorySystem(w, cfg);
    }
    expect(mem.events.length).toBeLessThanOrEqual(cfg.workingMemorySize + 4);
    expect(mem.summaries.length).toBeLessThanOrEqual(cfg.maxSummaries);
  });
});

// ── end-to-end: the rollup actually fires through the real tick loop ───────────────

describe('memory rollup through the live loop', () => {
  it('agents accrue episodic summaries and stay bounded as the town lives', () => {
    const content = testContent();
    // A small working set so the sparse stream overflows within the run.
    const cfg = {
      ...defaultConfig, seed: 8, workingMemorySize: 3, memoryRetainAfterRollup: 2,
      maxSummaries: 3, memoryRollupIntervalDays: 1,
    };
    const { world, rng, clockEntity } = createSimulation(cfg, content);
    runTicks(world, rng, cfg, clockEntity, content, 8000);

    let withSummaries = 0, maxEvents = 0;
    for (const e of world.query(C_AGENT, C_MEMORY)) {
      const mem = world.getComponent<Memory>(e, C_MEMORY)!;
      if (mem.summaries.length) withSummaries++;
      maxEvents = Math.max(maxEvents, mem.events.length);
      expect(mem.summaries.length).toBeLessThanOrEqual(cfg.maxSummaries); // bounded
    }
    expect(withSummaries).toBeGreaterThan(0);                 // the rollup fired via the loop
    expect(maxEvents).toBeLessThanOrEqual(cfg.workingMemorySize + 8); // working set stays small
  }, 20_000);
});
