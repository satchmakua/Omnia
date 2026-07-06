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
//
// M13 s2 — the ALIGNMENT VOICE: a grown soul swears its vow in its own moral register. The
// same life-theme (kin, hardship, loss, toil) resolves into nine different oaths across the
// alignment grid — and the oath is CAUSAL, not costume: AISystem records the AlignKey it was
// sworn under (`Memory.vowAlign`), whose poles drive the vow riders — a good-sworn vow gives
// ALMS (VowSystem), an evil-sworn one feeds MALICE (CrimeSystem), a lawful oath is STEADFAST
// (MentalStateSystem), a chaotic one a FREE SPIRIT (ActionSystem). True Neutral keeps the
// original vocabulary — balance is the baseline, and old saves/tests read unchanged.
type VowTheme = 'none' | 'bonds' | 'grit' | 'loss' | 'toil';
const ALIGN_ADULT_VOWS: Record<string, Record<VowTheme, string>> = {
  LG: {
    none:  'to do right by every soul under this sky',
    bonds: 'to shield their kin as long as they stand',
    grit:  'to stand between the weak and the dark',
    loss:  'to honour the dead by guarding the living',
    toil:  'to build honestly, and leave good work behind',
  },
  NG: {
    none:  'to leave things kinder than they found them',
    bonds: 'to see the ones they love want for nothing',
    grit:  'to spend their spared days helping others through',
    loss:  'to soften the grief of others, knowing their own',
    toil:  'to work so that others might rest',
  },
  CG: {
    none:  'to live free and share the road with any who need it',
    bonds: 'to keep their loved ones free, whatever it costs',
    grit:  'to live loud in spite of everything',
    loss:  'to outlive sorrow and taste what days remain',
    toil:  'to make something no rule could have made',
  },
  LN: {
    none:  'to keep their word, whatever the day brings',
    bonds: 'to keep the family name in good order',
    grit:  'to endure, and keep the rules that kept them',
    loss:  'to keep the rites and tend the graves',
    toil:  'to master the craft and keep its standards',
  },
  TN: {   // the original vocabulary — balance is the baseline
    none:  'to take each day as it comes',
    bonds: 'to provide for those they love',
    grit:  'to live fully while they can',
    loss:  'to guard against the hard times',
    toil:  'to make something of themselves',
  },
  CN: {
    none:  'to follow the wind and owe the world nothing',
    bonds: 'to love fiercely and answer to no one for it',
    grit:  'to survive by wit and whim, as they always have',
    loss:  'to owe grief nothing and roam where it cannot follow',
    toil:  'to work when it suits them and wander when it does not',
  },
  LE: {
    none:  'to keep the ledger, and collect what it shows',
    bonds: 'to bind the family fortunes to their own hand',
    grit:  'to never again be weak enough to suffer',
    loss:  'to make loss a debt the world repays with interest',
    toil:  'to own the fruits of other hands in time',
  },
  NE: {
    none:  'to look out for themselves, first and last',
    bonds: 'to keep their own fed, and let the rest fend',
    grit:  'to make sure the next blow lands on someone else',
    loss:  'to lose nothing more, whatever it takes',
    toil:  'to get their share, and a little of everyone else’s',
  },
  CE: {
    none:  'to take what they please and let the rest burn',
    bonds: 'to make the world fear touching what is theirs',
    grit:  'to pay the world back for every scar',
    loss:  'to see the world grieve as they have grieved',
    toil:  'to answer to no master and no wage',
  },
};
const CHILD_VOWS = {
  none:  'to see what the world holds',
  bonds: 'to make a true friend',
  grit:  'to be brave',
  loss:  'to stay close to family',
  toil:  'to learn all they can',
} as const;
/** The child vows, for detecting a coming-of-age (a child vow giving way to an adult one). */
export const CHILD_VOW_SET: ReadonlySet<string> = new Set(Object.values(CHILD_VOWS));
/** Every adult vow across the nine-cell grid (content-coverage tests + UI). */
export const ALIGN_VOW_TABLE: Readonly<Record<string, Record<VowTheme, string>>> = ALIGN_ADULT_VOWS;

// Distil a life into a CAUSAL drive (M10 slice 3, D26). Deterministic — no LLM — so it
// can steer behaviour without breaking replay. Weighs the agent's memories by theme:
// bonds (family/friends) and toil (work/prosperity) pull toward striving, grit (hardship
// survived) toward seizing the day, and loss (death/illness) toward grief/withdrawal. The
// dominant theme sets a bounded `purpose` and names the `vow` it implies. `grit` is tested
// before `loss` so "survived a grave illness" reads as resilience, not just another loss.
// `isChild` selects the child vow vocabulary — same drives, age-appropriate words.
// `align` (M13 s2) selects the grown voice: the same theme swears differently across the
// nine-cell grid (defaults to TN — the original vocabulary — when absent, e.g. in tests).
export function distill(events: MemoryEntry[], isChild = false, align = 'TN'): { purpose: number; vow: string } {
  let bonds = 0, grit = 0, loss = 0, toil = 0;
  for (const ev of events) {
    const t = ev.text;
    if (/child|wed|born|befriend/.test(t)) bonds += ev.importance;
    else if (/survived|overcame|pulled through/.test(t)) grit += ev.importance;
    else if (/lost|ill/.test(t)) loss += ev.importance;
    else if (/work|prosper/.test(t)) toil += ev.importance;
  }
  const V = isChild ? CHILD_VOWS : (ALIGN_ADULT_VOWS[align] ?? ALIGN_ADULT_VOWS.TN);
  const drive = (w: number) => Math.min(0.4, 0.15 + w * 0.1);
  if (bonds + grit + loss + toil < 0.1) return { purpose: 0, vow: V.none };
  // Dominant theme wins; ties resolve love → grit → loss → toil.
  const top = Math.max(bonds, grit, loss, toil);
  if (top === bonds) return { purpose: drive(bonds), vow: V.bonds };
  if (top === grit) return { purpose: drive(grit) * 0.7, vow: V.grit };
  if (top === loss) return { purpose: -drive(loss), vow: V.loss };
  return { purpose: drive(toil), vow: V.toil };
}

// The soul cue (M13 s2): every prompt names the agent's alignment in plain words, so BOTH
// providers condition on it — the stub parses `soul leans <name>` to pick an alignment-
// voiced pool, and a live model reads it as natural grounding. Omitted for the unaligned
// (bare test worlds): the cue simply isn't there and the theme tables carry the line.
export function soulCue(alignmentNameLower?: string): string {
  return alignmentNameLower ? ` Their soul leans ${alignmentNameLower}.` : '';
}

export function buildReflectionPrompt(name: string, tick: number, memories: MemoryEntry[], soul = ''): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] Reflecting on the life of ${name} so far:${soul}\n${lines}\n` +
    `In a short phrase, what does ${name} now believe or value?`;
}

// The three M5-part-2 prompt shapes. Each carries a distinctive cue word ("dream",
// "resolve", "say to") so a provider — the deterministic stub or a real model —
// can answer in the right register. Memories ground the line in the agent's life.
export function buildDreamPrompt(name: string, tick: number, memories: MemoryEntry[], soul = ''): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] ${name} sleeps, their mind drifting over:${soul}\n${lines}\n` +
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
  name: string, moment: string, tick: number, memories: MemoryEntry[], soul = '',
): string {
  const lines = memories.map(m => `- ${m.text}`).join('\n');
  return `[t${tick}] ${name} reaches a turning point — ${moment}. Their life so far:${soul}\n${lines}\n` +
    `In one short line, what does ${name} resolve to do?`;
}
