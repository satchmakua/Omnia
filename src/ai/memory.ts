// Memory capture and retrieval (SIMULATION_MODEL Part 1). Salient happenings are
// written to an agent's stream with an importance score; when the agent reflects,
// memories are retrieved by a blend of recency × importance × relevance (embedding
// similarity), and only the top few feed the prompt — keeping it small.
import type { World, EntityId } from '../sim/ecs.ts';
import { C_MEMORY } from '../sim/components.ts';
import type { Memory, MemoryEntry } from '../sim/components.ts';
import type { AIProvider } from './provider.ts';
import { cosine } from './provider.ts';

export interface RetrievalWeights { recency: number; importance: number; relevance: number; }
const DEFAULT_WEIGHTS: RetrievalWeights = { recency: 1, importance: 1.5, relevance: 1 };

// Append a memory to an agent's stream (no-op if it carries no Memory). Bounded to
// `cap` most-recent entries — multi-resolution rollup of the rest is M6.
export function remember(
  world: World, e: EntityId, tick: number, text: string, importance: number, cap = 40,
): void {
  const mem = world.getComponent<Memory>(e, C_MEMORY);
  if (!mem) return;
  mem.events.push({ tick, text, importance });
  if (mem.events.length > cap) mem.events.shift();
}

// Top-n memories for a query, scored by recency × importance × relevance.
export function retrieve(
  mem: Memory, query: string, provider: AIProvider, n: number,
  weights: RetrievalWeights = DEFAULT_WEIGHTS,
): MemoryEntry[] {
  if (mem.events.length === 0) return [];
  const qv = provider.embed(query);
  let minT = Infinity, maxT = -Infinity;
  for (const ev of mem.events) { if (ev.tick < minT) minT = ev.tick; if (ev.tick > maxT) maxT = ev.tick; }
  const span = (maxT - minT) || 1;

  return mem.events
    .map(ev => {
      const recency = (ev.tick - minT) / span;
      const relevance = cosine(qv, provider.embed(ev.text));
      return { ev, score: weights.recency * recency + weights.importance * ev.importance + weights.relevance * relevance };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(s => s.ev);
}

export function buildReflectionPrompt(name: string, tick: number, memories: MemoryEntry[]): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] Reflecting on the life of ${name} so far:\n${lines}\n` +
    `In a short phrase, what does ${name} now believe or value?`;
}
