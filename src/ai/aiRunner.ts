// Drives async LLM calls OFF the simulation's hot path (ARCHITECTURE invariant:
// "never block the tick on the LLM"). Requests are queued and run at most
// `concurrency` at a time; each call has a timeout, after which a deterministic
// fallback string is used so a slow or dead model never stalls anything. Results
// land in a buffer the AISystem drains on a later tick. The stub path doesn't use
// this (it's synchronous); this is for the real, async Ollama provider.
import type { AIProvider } from './provider.ts';

interface Job { id: string; prompt: string; fallback: string; }

export interface RunnerResult { id: string; text: string; timedOut: boolean; }

export class AIRunner {
  private queue: Job[] = [];
  private inFlight = 0;
  private readonly done = new Map<string, RunnerResult>();
  private readonly pending = new Set<string>();

  constructor(
    private readonly provider: AIProvider,
    private readonly concurrency = 2,
    private readonly timeoutMs = 8000,
  ) {}

  /** Enqueue a request; returns false if one with this id is already queued/running. */
  submit(id: string, prompt: string, fallback = ''): boolean {
    if (this.pending.has(id) || this.done.has(id)) return false;
    this.pending.add(id);
    this.queue.push({ id, prompt, fallback });
    this.pump();
    return true;
  }

  /** Remove and return any completed results (for the AISystem to apply + record). */
  drain(): RunnerResult[] {
    const out = [...this.done.values()];
    this.done.clear();
    return out;
  }

  get queuedCount(): number { return this.queue.length; }
  get inFlightCount(): number { return this.inFlight; }

  private pump(): void {
    while (this.inFlight < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.inFlight++;
      this.run(job);
    }
  }

  private run(job: Job): void {
    let settled = false;
    const finish = (text: string, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      this.inFlight--;
      this.pending.delete(job.id);
      this.done.set(job.id, { id: job.id, text, timedOut });
      this.pump();
    };
    const timer = setTimeout(() => finish(job.fallback, true), this.timeoutMs);
    this.provider.complete(job.prompt)
      .then(text => finish(text, false))
      .catch(() => finish(job.fallback, true));
  }
}
