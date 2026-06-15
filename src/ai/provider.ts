// The single seam all LLM use hides behind (ARCHITECTURE: `AIProvider`). The rest
// of the sim never knows which model is running. Two implementations exist:
// a deterministic stub (default — keeps the sim headless, fast, and reproducible)
// and an Ollama-backed provider (opt-in, async). Deterministic providers also
// expose `completeSync`, which the in-sim AISystem uses so reflection stays on a
// synchronous, replayable code path; async providers are driven off the hot path
// by the AIRunner and recorded for deterministic replay.
export interface AIProvider {
  readonly name: string;
  /** Async completion — the general path (used for the real model). */
  complete(prompt: string): Promise<string>;
  /** Deterministic, synchronous completion — present only on deterministic providers. */
  completeSync?(prompt: string): string;
  /** A small, cheap, deterministic embedding for memory-relevance scoring. */
  embed(text: string): number[];
}

// FNV-1a 32-bit string hash — stable across runs (no Math.random, no Date).
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A tiny deterministic embedding: bag-of-characters into a fixed-width vector,
// L2-normalised. Cheap and reproducible — good enough for relevance ranking.
export function embedText(text: string, dim = 24): number[] {
  const v = new Array(dim).fill(0);
  const t = text.toLowerCase();
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 97 || c > 122) continue; // a–z only
    v[c % dim] += 1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map(x => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // inputs are unit vectors
}
