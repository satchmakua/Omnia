import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_MEMORY, C_CLOCK, C_AIRECORD, C_EVENTLOG } from '../src/sim/components.ts';
import type { Agent, Memory, MemoryEntry, AIRecord } from '../src/sim/components.ts';
import { runAISystem } from '../src/sim/systems/AISystem.ts';
import type { AIProvider } from '../src/ai/provider.ts';
import { hashString, embedText } from '../src/ai/provider.ts';
import { RecordedProvider } from '../src/ai/recording.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';

const cfg = defaultConfig;
const NOW = 100_000;
// Deliberately mundane (all below the decision threshold) so only reflection fires —
// keeps the belief/record counts to exactly one per run.
const familyMemories: MemoryEntry[] = [
  { tick: 10, text: 'took work as a Miner', importance: 0.3 },
  { tick: 20, text: 'wandered the open plains', importance: 0.2 },
  { tick: 30, text: 'a long, quiet day', importance: 0.2 },
];

// An async-only provider (like Ollama) — no completeSync. Deterministic per prompt
// here only so the test can assert; a real model would vary (the recording pins it).
class MockAsync implements AIProvider {
  readonly name = 'mock';
  complete(p: string): Promise<string> { return Promise.resolve(`LLM(${hashString(p)})`); }
  embed(t: string): number[] { return embedText(t); }
}

function soulWorld(name = 'Mara') {
  const w = new World();
  w.addComponent(w.createEntity(), C_CLOCK, { tick: NOW, day: 0, hour: 0, isDay: true });
  const rec = w.createEntity();
  w.addComponent<AIRecord>(rec, C_AIRECORD, { entries: [] });
  w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
  const a = w.createEntity();
  w.addComponent<Agent>(a, C_AGENT, { name, action: 'wander', ticksAlive: 50_000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
  w.addComponent<Memory>(a, C_MEMORY, {
    events: [...familyMemories], summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
    utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9,
  });
  return { w, a, rec };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('async live-model path (M7.5)', () => {
  it('submits off the hot path, then applies + records the result on a later tick', async () => {
    const { w, a, rec } = soulWorld();
    const provider = new MockAsync();

    // First tick: eligible → submitted (not applied yet), throttle set so it won't re-submit.
    runAISystem(w, cfg, provider);
    expect(w.getComponent<Memory>(a, C_MEMORY)!.beliefs.length).toBe(0);   // nothing applied yet
    expect(w.getComponent<Memory>(a, C_MEMORY)!.lastReflectTick).toBe(NOW); // but throttled

    await flush();                                  // the model call resolves off the hot path

    // Next tick: the finished call is drained, applied, and recorded.
    runAISystem(w, cfg, provider);
    const mem = w.getComponent<Memory>(a, C_MEMORY)!;
    expect(mem.beliefs.length).toBe(1);
    expect(mem.beliefs[0].text).toMatch(/^LLM\(/);
    expect(w.getComponent<AIRecord>(rec, C_AIRECORD)!.entries.length).toBe(1);
  });

  it('the recorded async run replays identically via RecordedProvider (the sync path)', async () => {
    const { w, a, rec } = soulWorld();
    const provider = new MockAsync();
    runAISystem(w, cfg, provider);
    await flush();
    runAISystem(w, cfg, provider);
    const liveBelief = w.getComponent<Memory>(a, C_MEMORY)!.beliefs[0].text;
    const record = w.getComponent<AIRecord>(rec, C_AIRECORD)!;
    expect(record.entries.length).toBe(1);

    // Replay a fresh, identical world reading the recording (RecordedProvider is sync).
    const replay = soulWorld();
    runAISystem(replay.w, cfg, new RecordedProvider(record));
    const replayBelief = replay.w.getComponent<Memory>(replay.a, C_MEMORY)!.beliefs[0].text;
    expect(replayBelief).toBe(liveBelief);          // same belief, reproduced from the recording
  });

  it('never stalls: an agent that already submitted does not re-submit while in flight', async () => {
    const { w, a, rec } = soulWorld();
    const provider = new MockAsync();
    runAISystem(w, cfg, provider);    // submit
    runAISystem(w, cfg, provider);    // same tick-ish; already pending → no second submit
    runAISystem(w, cfg, provider);
    await flush();
    runAISystem(w, cfg, provider);    // drain + apply once
    expect(w.getComponent<Memory>(a, C_MEMORY)!.beliefs.length).toBe(1);
    expect(w.getComponent<AIRecord>(rec, C_AIRECORD)!.entries.length).toBe(1);
  });
});
