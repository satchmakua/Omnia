// The Storyteller — an adaptive event director (M32, D54). Drama should be *paced*, not random: a
// placid, thriving town can bear a disaster or an uncanny night; a reeling town has earned respite
// and a turn of fortune. Each day the director reads the world's health into a single **calm** signal
// in [0,1] (high = placid & thriving, low = in crisis), and the EventSystem scales each event's daily
// chance by it — boosting calamity when calm, fortune when reeling. The result is a negative-feedback
// loop that keeps the town in a bounded "drama band": quiet earns escalation, crisis earns relief.
//
// Pure reads + a deterministic running state (no RNG), so a given seed still replays identically — the
// director only *biases the dice* the EventSystem already rolls, it draws none of its own.
import type { World } from '../sim/ecs.ts';
import { C_AGENT, C_STORYTELLER } from '../sim/components.ts';
import type { Agent } from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';

// Selectable temperaments (M32 s2), à la RimWorld's storytellers — a knob on how hard the world
// pushes. `measured` is the default keel (byte-identical to s1).
export type Temperament = 'measured' | 'calm' | 'harsh' | 'capricious';
export interface Storyteller {
  lastDramaTick: number;   // when the last calamity/uncanny event fired (drives the "drama drought")
  lastPop: number;         // last day's population (for the trend signal)
  calm: number;            // the last computed calm in [0,1] (for legibility)
  temperament: Temperament;
}

// Each temperament tunes the swing (`intensity`/`maxBoost`), a baseline lean toward calamity or calm
// (`bias`), how long respite lasts after a blow (`recoveryDays`), and — for the Capricious — a
// deterministic day-to-day `jitter` in the calm read.
interface Temper { intensity: number; maxBoost: number; bias: number; recoveryDays: number; jitter: number; }
const TEMPERAMENTS: Record<Temperament, Temper> = {
  measured:   { intensity: 1.6, maxBoost: 3,   bias: 0,     recoveryDays: 12, jitter: 0 },     // the keel (s1, unchanged)
  calm:       { intensity: 1.0, maxBoost: 1.8, bias: -0.18, recoveryDays: 20, jitter: 0 },     // Calm Chronicler — gentle, longer respite
  harsh:      { intensity: 2.1, maxBoost: 4,   bias: 0.18,  recoveryDays: 7,  jitter: 0 },     // Hard Times — relentless, brief respite
  capricious: { intensity: 2.2, maxBoost: 4,   bias: 0,     recoveryDays: 10, jitter: 0.35 },  // Capricious — a strong hand that swings
};
export const TEMPERAMENT_IDS: Temperament[] = ['measured', 'calm', 'harsh', 'capricious'];
export function asTemperament(s: string): Temperament {
  return (TEMPERAMENT_IDS as string[]).includes(s) ? (s as Temperament) : 'measured';
}

const TREND_NORM = 6;       // a day's population swing of this size saturates the trend signal
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
// A deterministic per-day swing in [0,1) for the Capricious temperament (no sim RNG — replay-safe).
function jitterAt(tick: number): number {
  let h = (tick * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function createStoryteller(pop = 0, temperament: Temperament = 'measured'): Storyteller {
  return { lastDramaTick: 0, lastPop: pop, calm: 0.5, temperament };
}
export function getStoryteller(world: World): Storyteller | undefined {
  const e = world.query(C_STORYTELLER)[0];
  return e !== undefined ? world.getComponent<Storyteller>(e, C_STORYTELLER) : undefined;
}

// Fold the day's world-health into the calm signal, and update the running state (lastPop, calm).
// Calm rises with the folk's **mood**, a **growing** population, and a **drought of drama**; it falls
// when the town is unhappy, shrinking, or freshly battered.
export function updateDirector(world: World, cfg: SimConfig, st: Storyteller, tick: number, pop: number): number {
  let moodSum = 0, moodN = 0;
  for (const e of world.query(C_AGENT)) {
    const m = world.getComponent<Agent>(e, C_AGENT)!.mood;
    if (m !== undefined) { moodSum += m; moodN++; }
  }
  const t = TEMPERAMENTS[st.temperament] ?? TEMPERAMENTS.measured;
  const mood = moodN ? moodSum / moodN : 0.5;
  const trend = clamp01(0.5 + (pop - st.lastPop) / TREND_NORM);
  // Two halves: how *recovered* the town is since the last calamity (0 right after → 1 once a full
  // recovery window of quiet has passed), and its current *vitality* (mood + whether it's growing).
  // A fresh calamity, a mood slump, or a shrinking population all pull calm down into "relief" — so
  // the world earns respite, then climbs back to placid and earns its next bout of drama.
  const recovery = clamp01((tick - st.lastDramaTick) / (t.recoveryDays * cfg.ticksPerDay));
  const vitality = clamp01(0.6 * mood + 0.4 * trend);
  let calm = 0.5 * recovery + 0.5 * vitality;
  if (t.jitter > 0) calm += (jitterAt(tick) - 0.5) * 2 * t.jitter;   // the Capricious: an unpredictable hand
  calm = clamp01(calm);
  st.calm = calm;
  st.lastPop = pop;
  return calm;
}

// The factor to scale an event's daily chance by, given the world's calm. A placid world (calm high)
// invites disaster & the uncanny and stays fortune's hand; a reeling world (calm low) earns fortune
// and is spared calamity. Seasonal events are the steady turning of the year — unmodulated.
export function eventChanceMultiplier(category: string, calm: number, st: Storyteller): number {
  const t = TEMPERAMENTS[st.temperament] ?? TEMPERAMENTS.measured;
  const lift = (signal: number): number => Math.max(0.2, Math.min(t.maxBoost, 1 + t.intensity * signal));
  // `bias` leans the whole world: + toward calamity (Hard Times), − toward calm (Calm Chronicler).
  if (category === 'disaster' || category === 'paranormal') return lift((calm - 0.5) + t.bias);
  if (category === 'fortune') return lift((0.5 - calm) - t.bias);
  return 1;   // seasonal — the turning year, unmodulated
}
