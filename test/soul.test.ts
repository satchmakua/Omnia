import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_MEMORY, C_CLOCK, C_AIRECORD } from '../src/sim/components.ts';
import type { Agent, Memory, MemoryEntry, AIRecord } from '../src/sim/components.ts';
import { runAISystem } from '../src/sim/systems/AISystem.ts';
import { stubProvider } from '../src/ai/stubProvider.ts';
import { RecordedProvider } from '../src/ai/recording.ts';
import type { AIProvider } from '../src/ai/provider.ts';
import { embedText } from '../src/ai/provider.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const familyMemories: MemoryEntry[] = [
  { tick: 10, text: 'their child was born', importance: 0.85 },
  { tick: 20, text: 'their child was born', importance: 0.85 },
  { tick: 30, text: 'wed Tovic', importance: 0.7 },
];

function soulWorld(events: MemoryEntry[] = familyMemories, name = 'Mara') {
  const w = new World();
  w.addComponent(w.createEntity(), C_CLOCK, { tick: 100_000, day: 0, hour: 0, isDay: true });
  const rec = w.createEntity();
  w.addComponent<AIRecord>(rec, C_AIRECORD, { entries: [] });
  const a = w.createEntity();
  w.addComponent<Agent>(a, C_AGENT, { name, action: 'wander', ticksAlive: 50_000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
  w.addComponent<Memory>(a, C_MEMORY, { events: [...events], beliefs: [], lastReflectTick: -1e9 });
  return { w, a, rec };
}

describe('AISystem reflection', () => {
  it('an agent with enough memories reflects into a belief, recorded', () => {
    const { w, a, rec } = soulWorld();
    runAISystem(w, cfg, stubProvider);
    const mem = w.getComponent<Memory>(a, C_MEMORY)!;
    expect(mem.beliefs.length).toBe(1);
    expect(mem.lastReflectTick).toBe(100_000);
    expect(w.getComponent<AIRecord>(rec, C_AIRECORD)!.entries.length).toBe(1);
  });

  it('does not reflect again within the interval', () => {
    const { w, a } = soulWorld();
    runAISystem(w, cfg, stubProvider);
    runAISystem(w, cfg, stubProvider);
    expect(w.getComponent<Memory>(a, C_MEMORY)!.beliefs.length).toBe(1);
  });

  it('does not reflect without enough memories', () => {
    const { w, a } = soulWorld([{ tick: 1, text: 'wandered', importance: 0.1 }]);
    runAISystem(w, cfg, stubProvider);
    expect(w.getComponent<Memory>(a, C_MEMORY)!.beliefs.length).toBe(0);
  });

  it('respects the per-tick reflection cap', () => {
    const { w } = soulWorld();
    // add a second eligible agent
    const b = w.createEntity();
    w.addComponent<Agent>(b, C_AGENT, { name: 'Bryn', action: 'wander', ticksAlive: 50_000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Memory>(b, C_MEMORY, { events: [...familyMemories], beliefs: [], lastReflectTick: -1e9 });

    runAISystem(w, { ...cfg, maxReflectionsPerTick: 1 }, stubProvider);
    const total = w.query(C_AGENT, C_MEMORY)
      .reduce((s, e) => s + w.getComponent<Memory>(e, C_MEMORY)!.beliefs.length, 0);
    expect(total).toBe(1);
  });

  it('is deterministic: same memories → same belief', () => {
    const r1 = soulWorld(); runAISystem(r1.w, cfg, stubProvider);
    const r2 = soulWorld(); runAISystem(r2.w, cfg, stubProvider);
    expect(w_belief(r1.w, r1.a)).toBe(w_belief(r2.w, r2.a));
  });
});

function w_belief(w: World, a: number): string {
  return w.getComponent<Memory>(a, C_MEMORY)!.beliefs[0]?.text ?? '';
}

// A non-deterministic "model": every call returns a different string. Recording
// must pin it so a replay reproduces the run exactly.
class FlakyProvider implements AIProvider {
  readonly name = 'flaky';
  completeSync(_prompt: string): string { return `belief#${Math.floor(Math.random() * 1e9)}`; }
  complete(p: string): Promise<string> { return Promise.resolve(this.completeSync(p)); }
  embed(t: string): number[] { return embedText(t); }
}

describe('deterministic replay of recorded LLM responses', () => {
  it('replaying recorded responses reproduces the beliefs of a non-deterministic run', () => {
    const content = testContent();
    const fast = { ...defaultConfig, seed: 8, reflectionIntervalDays: 1 };
    const TICKS = 6000;

    // Record run with a non-deterministic provider.
    const recSim = createSimulation(fast, content);
    runTicks(recSim.world, recSim.rng, fast, recSim.clockEntity, content, TICKS, new FlakyProvider());
    const record = recSim.world.getComponent<AIRecord>(recSim.world.query(C_AIRECORD)[0], C_AIRECORD)!;
    const recBeliefs = beliefsByEntity(recSim.world);
    expect(record.entries.length).toBeGreaterThan(0); // reflections happened

    // Replay run (same seed) reading the recording.
    const repSim = createSimulation(fast, content);
    runTicks(repSim.world, repSim.rng, fast, repSim.clockEntity, content, TICKS, new RecordedProvider(record));
    const repBeliefs = beliefsByEntity(repSim.world);

    expect(repBeliefs).toEqual(recBeliefs);
  }, 30_000);
});

function beliefsByEntity(w: World): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const e of w.query(C_AGENT, C_MEMORY)) {
    const b = w.getComponent<Memory>(e, C_MEMORY)!.beliefs.map(x => x.text);
    if (b.length) out[e] = b;
  }
  return out;
}
