import { describe, it, expect, vi } from 'vitest';
import { AIRunner } from '../src/ai/aiRunner.ts';
import type { AIProvider } from '../src/ai/provider.ts';
import { embedText } from '../src/ai/provider.ts';

// A provider whose completions we resolve/reject manually, to drive the runner.
class ControlledProvider implements AIProvider {
  readonly name = 'controlled';
  resolvers: ((v: string) => void)[] = [];
  rejecters: ((e: unknown) => void)[] = [];
  complete(_prompt: string): Promise<string> {
    return new Promise((res, rej) => { this.resolvers.push(res); this.rejecters.push(rej); });
  }
  embed(t: string): number[] { return embedText(t); }
}

describe('AIRunner', () => {
  it('runs at most `concurrency` calls at once and queues the rest', () => {
    const p = new ControlledProvider();
    const runner = new AIRunner(p, 2);
    runner.submit('a', 'pa');
    runner.submit('b', 'pb');
    runner.submit('c', 'pc');
    expect(runner.inFlightCount).toBe(2);
    expect(runner.queuedCount).toBe(1);
  });

  it('starts a queued call when an in-flight one completes', async () => {
    const p = new ControlledProvider();
    const runner = new AIRunner(p, 1);
    runner.submit('a', 'pa');
    runner.submit('b', 'pb');
    expect(runner.inFlightCount).toBe(1);
    p.resolvers[0]('done-a');
    await Promise.resolve(); await Promise.resolve(); // let microtasks settle
    expect(runner.inFlightCount).toBe(1); // b started
    const results = runner.drain();
    expect(results).toEqual([{ id: 'a', text: 'done-a', timedOut: false }]);
  });

  it('falls back (and never hangs) when a call rejects', async () => {
    const p = new ControlledProvider();
    const runner = new AIRunner(p, 2);
    runner.submit('a', 'pa', 'FALLBACK');
    p.rejecters[0](new Error('boom'));
    await Promise.resolve(); await Promise.resolve();
    expect(runner.drain()).toEqual([{ id: 'a', text: 'FALLBACK', timedOut: true }]);
  });

  it('times out a slow call with the fallback', () => {
    vi.useFakeTimers();
    try {
      const p = new ControlledProvider(); // never resolved
      const runner = new AIRunner(p, 2, 5000);
      runner.submit('a', 'pa', 'TIMED_OUT');
      vi.advanceTimersByTime(5001);
      const results = runner.drain();
      expect(results).toEqual([{ id: 'a', text: 'TIMED_OUT', timedOut: true }]);
      expect(runner.inFlightCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a duplicate id already in flight', () => {
    const p = new ControlledProvider();
    const runner = new AIRunner(p, 2);
    expect(runner.submit('a', 'pa')).toBe(true);
    expect(runner.submit('a', 'pa')).toBe(false);
  });
});
