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

// Append a memory to an agent's stream (no-op if it carries no Memory). Pure append:
// the scheduled multi-resolution rollup (MemorySystem, M6) is the sole authority that
// bounds the stream, folding old/trivial events into episodic summaries rather than
// dropping them blindly (which would flatten the story — D4).
export function remember(
  world: World, e: EntityId, tick: number, text: string, importance: number,
): void {
  const mem = world.getComponent<Memory>(e, C_MEMORY);
  if (!mem) return;
  mem.events.push({ tick, text, importance });
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

// The vow each theme names — one vocabulary for grown folk, one for children (the Kids
// Pass). A child's inner life is age-appropriate (friends, courage, family, wonder); when
// they come of age the same themes resolve into adult vows instead, so you watch a mind
// grow up (AISystem fires a "comes of age" line on the switch).
const ADULT_VOWS = {
  none:  'to take each day as it comes',
  bonds: 'to provide for those they love',
  grit:  'to live fully while they can',
  loss:  'to guard against the hard times',
  toil:  'to make something of themselves',
} as const;
const CHILD_VOWS = {
  none:  'to see what the world holds',
  bonds: 'to make a true friend',
  grit:  'to be brave',
  loss:  'to stay close to family',
  toil:  'to learn all they can',
} as const;
/** The child vows, for detecting a coming-of-age (a child vow giving way to an adult one). */
export const CHILD_VOW_SET: ReadonlySet<string> = new Set(Object.values(CHILD_VOWS));

// Distil a life into a CAUSAL drive (M10 slice 3, D26). Deterministic — no LLM — so it
// can steer behaviour without breaking replay. Weighs the agent's memories by theme:
// bonds (family/friends) and toil (work/prosperity) pull toward striving, grit (hardship
// survived) toward seizing the day, and loss (death/illness) toward grief/withdrawal. The
// dominant theme sets a bounded `purpose` and names the `vow` it implies. `grit` is tested
// before `loss` so "survived a grave illness" reads as resilience, not just another loss.
// `isChild` selects the child vow vocabulary — same drives, age-appropriate words.
export function distill(events: MemoryEntry[], isChild = false): { purpose: number; vow: string } {
  let bonds = 0, grit = 0, loss = 0, toil = 0;
  for (const ev of events) {
    const t = ev.text;
    if (/child|wed|born|befriend/.test(t)) bonds += ev.importance;
    else if (/survived|overcame|pulled through/.test(t)) grit += ev.importance;
    else if (/lost|ill/.test(t)) loss += ev.importance;
    else if (/work|prosper/.test(t)) toil += ev.importance;
  }
  const V = isChild ? CHILD_VOWS : ADULT_VOWS;
  const drive = (w: number) => Math.min(0.4, 0.15 + w * 0.1);
  if (bonds + grit + loss + toil < 0.1) return { purpose: 0, vow: V.none };
  // Dominant theme wins; ties resolve love → grit → loss → toil.
  const top = Math.max(bonds, grit, loss, toil);
  if (top === bonds) return { purpose: drive(bonds), vow: V.bonds };
  if (top === grit) return { purpose: drive(grit) * 0.7, vow: V.grit };
  if (top === loss) return { purpose: -drive(loss), vow: V.loss };
  return { purpose: drive(toil), vow: V.toil };
}

export function buildReflectionPrompt(name: string, tick: number, memories: MemoryEntry[]): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] Reflecting on the life of ${name} so far:\n${lines}\n` +
    `In a short phrase, what does ${name} now believe or value?`;
}

// The three M5-part-2 prompt shapes. Each carries a distinctive cue word ("dream",
// "resolve", "say to") so a provider — the deterministic stub or a real model —
// can answer in the right register. Memories ground the line in the agent's life.
export function buildDreamPrompt(name: string, tick: number, memories: MemoryEntry[]): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] ${name} sleeps, their mind drifting over:\n${lines}\n` +
    `Describe ${name}'s dream in one vivid line.`;
}

export function buildDialoguePrompt(
  name: string, other: string, tick: number, memories: MemoryEntry[],
): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] ${name} stands with ${other}. From ${name}'s life:\n${lines}\n` +
    `Give one short line ${name} might say to ${other}.`;
}

export function buildDecisionPrompt(
  name: string, moment: string, tick: number, memories: MemoryEntry[],
): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] ${name} reaches a turning point — ${moment}. Their life so far:\n${lines}\n` +
    `In one short line, what does ${name} resolve to do?`;
}
