// Multi-resolution memory compression (M6, SIMULATION_MODEL Mechanisms 1 & 2).
// "Fidelity ∝ importance × recency": the most-recent raw events stay sharp, older
// ones are rolled up into episodic summaries (high-importance events kept named,
// trivia dissolved into a count), and the rawest of the old are discarded. Older
// summaries themselves merge into coarser eras, so a whole life stays bounded.
//
// Pure and deterministic (no RNG, no clock, no model) — the scheduling lives in
// MemorySystem; this module is the mechanism.
import type { Memory, MemoryEntry, EpisodicSummary } from '../sim/components.ts';

const MAX_NAMED = 3; // how many notable events a single digest names before the rest fold to a count

function plural(n: number, w: string): string {
  return `${n} ${w}${n === 1 ? '' : 's'}`;
}

// Roll a block of (older) raw events into one episodic digest. Notable events are
// named; everything else dissolves into "and N quieter days".
export function summarizeBlock(block: MemoryEntry[], threshold: number): EpisodicSummary {
  const notable = block.filter(e => e.importance >= threshold);
  const named = notable.slice(0, MAX_NAMED).map(e => e.text);
  const rest = block.length - named.length; // un-named notable + all trivia

  let text: string;
  if (named.length && rest > 0) text = `${named.join('; ')}; and ${plural(rest, 'quieter day')}`;
  else if (named.length) text = named.join('; ');
  else text = `${plural(block.length, 'quiet, unremarkable day')}`;

  return {
    fromTick: block[0].tick,
    toTick: block[block.length - 1].tick,
    text,
    importance: block.reduce((m, e) => Math.max(m, e.importance), 0),
    count: block.length,
  };
}

// Merge two adjacent summaries (a older than b) into one coarser era. The more
// notable era keeps its words; the less notable blurs to its span and count — the
// downsampling that keeps deep history cheap without flattening the vivid bits.
export function mergeSummaries(a: EpisodicSummary, b: EpisodicSummary): EpisodicSummary {
  const keep = a.importance >= b.importance ? a : b;
  return {
    fromTick: Math.min(a.fromTick, b.fromTick),
    toTick: Math.max(a.toTick, b.toTick),
    text: keep.text,
    importance: Math.max(a.importance, b.importance),
    count: a.count + b.count,
  };
}

// Apply one rollup to an agent's memory if its working set has overgrown. Returns
// whether anything changed. Mutates `mem` in place.
export function consolidateMemory(
  mem: Memory, workingMemorySize: number, retain: number, threshold: number, maxSummaries: number,
): boolean {
  if (mem.events.length <= workingMemorySize) return false;

  // Digest everything past the most-recent `retain` raw events.
  const block = mem.events.splice(0, mem.events.length - retain);
  mem.summaries.push(summarizeBlock(block, threshold));

  // Keep the digest thread bounded: merge the two oldest into a coarser era.
  while (mem.summaries.length > maxSummaries) {
    const merged = mergeSummaries(mem.summaries[0], mem.summaries[1]);
    mem.summaries.splice(0, 2, merged);
  }
  return true;
}
