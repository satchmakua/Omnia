import { describe, it, expect } from 'vitest';
import { hashString, embedText, cosine } from '../src/ai/provider.ts';
import { stubProvider } from '../src/ai/stubProvider.ts';
import { retrieve, buildReflectionPrompt } from '../src/ai/memory.ts';
import { RecordedProvider, recordResponse } from '../src/ai/recording.ts';
import { World } from '../src/sim/ecs.ts';
import { C_AIRECORD } from '../src/sim/components.ts';
import type { Memory, AIRecord } from '../src/sim/components.ts';

// ── provider primitives ───────────────────────────────────────────────────────

describe('provider primitives', () => {
  it('hashString is deterministic and varies by input', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });

  it('embedText is deterministic and unit-normalised', () => {
    const v = embedText('the quick brown fox');
    expect(v).toEqual(embedText('the quick brown fox'));
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('cosine is 1 for identical text, lower for different', () => {
    const a = embedText('mining ore in the hills');
    expect(cosine(a, a)).toBeCloseTo(1, 5);
    expect(cosine(a, embedText('zzz'))).toBeLessThan(1);
  });
});

// ── stub provider ─────────────────────────────────────────────────────────────

describe('StubProvider', () => {
  it('completeSync is deterministic for a given prompt', () => {
    const p = 'Reflecting on Mara: their child was born; they wed Tovic.';
    expect(stubProvider.completeSync(p)).toBe(stubProvider.completeSync(p));
  });

  it('themes the belief from the memories in the prompt', () => {
    const family = stubProvider.completeSync('memories: a child was born; another child was born');
    expect(['treasures family above all', 'lives for their kin', 'finds meaning in their children']).toContain(family);
    const grief = stubProvider.completeSync('memories: lost their spouse; their parent died');
    expect(['carries old grief quietly', 'has learned that all things pass', 'guards their heart against loss']).toContain(grief);
  });

  it('complete() resolves to the same text as completeSync', async () => {
    const p = 'took work as a Miner';
    expect(await stubProvider.complete(p)).toBe(stubProvider.completeSync(p));
  });
});

// ── memory retrieval ──────────────────────────────────────────────────────────

describe('memory retrieval', () => {
  const mem: Memory = {
    beliefs: [], lastReflectTick: 0,
    events: [
      { tick: 1, text: 'took work as a Laborer', importance: 0.3 },
      { tick: 50, text: 'their child was born', importance: 0.9 },
      { tick: 90, text: 'wandered the plains', importance: 0.1 },
    ],
  };

  it('returns at most n, the highest-scoring first', () => {
    const top = retrieve(mem, 'family and children', stubProvider, 2);
    expect(top.length).toBe(2);
    // The important, relevant birth memory should outrank the trivial wander.
    expect(top[0].text).toBe('their child was born');
  });

  it('buildReflectionPrompt names the agent and lists the memories', () => {
    const prompt = buildReflectionPrompt('Mara', 123, mem.events);
    expect(prompt).toContain('Mara');
    expect(prompt).toContain('their child was born');
  });
});

// ── recording / replay ────────────────────────────────────────────────────────

describe('recording & RecordedProvider', () => {
  it('records responses and replays them by prompt', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent<AIRecord>(e, C_AIRECORD, { entries: [] });
    recordResponse(w, 10, hashString('prompt one'), 'belief one');

    const rec = new RecordedProvider(w.getComponent<AIRecord>(e, C_AIRECORD)!);
    expect(rec.completeSync('prompt one')).toBe('belief one');
    expect(rec.completeSync('unseen prompt')).toBe(''); // nothing recorded
  });
});
