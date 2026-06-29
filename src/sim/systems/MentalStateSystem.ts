// Mental states / breaks (M28 slice 2) — mood made causal. When an agent's mood bottoms out they
// crack into a procedural break (RimWorld-style, deterministic, never the LLM): a **despair** that
// withdraws, or — for the aggressive — an **anger** that lashes out; when mood peaks they may slip
// into **elation** and celebrate. A break overrides ordinary life (ActionSystem) but never survival,
// is short-lived, and passes with a little catharsis so folk don't immediately re-break. Anger also
// loosens the hand to crime (read live by the CrimeSystem). Runs after MoodSystem so it reads fresh
// mood; expiry is checked every tick, new breaks are rolled once a day.
//
// The break "roll" is a deterministic hash of (agent id, day) — NOT a draw from the shared sim RNG.
// This is replay-exact like the rest, but consumes no RNG, so an inner-life break never perturbs the
// ecology/combat streams (the predator–prey equilibrium is bistable and RNG-sensitive — D32). Breaks
// are deliberately rare, so they read as notable events, not a constant background.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_PERSONALITY, C_ALIGNMENT, C_CLOCK } from '../components.ts';
import type { Agent, Personality, Alignment, Clock, MentalState } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { traitAggressive, traitBreakFactor } from '../heredity.ts';
import { emitEvent } from '../../history/eventlog.ts';

const DESPAIR_AT = 0.20;   // mood ≤ this → misery may break the soul (rare — a thriving town seldom sinks here)
const ELATION_AT = 0.97;   // mood ≥ this → joy may overflow into celebration (only the euphoric)
const BREAK_CHANCE = 0.20; // per day, when miserable
const ELATION_CHANCE = 0.04; // per day, when euphoric — kept low so celebration is occasional
const CATHARSIS = 0.15;    // mood lifts this much when a break passes (a vent / a comedown)
const DAYS: Record<MentalState, number> = { despair: 1.0, anger: 0.5, elation: 0.5 };

// A deterministic float in [0,1) from (entity, day) — a hash, not the sim RNG (see header).
function roll01(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// The aggressive crack outward (anger), the rest inward (despair) — read off the whole trait
// set (M28 s3), plus a chaotic streak.
function proneToAnger(world: World, e: EntityId): boolean {
  if (traitAggressive(world.getComponent<Personality>(e, C_PERSONALITY))) return true;
  const law = world.getComponent<Alignment>(e, C_ALIGNMENT)?.law ?? 0;
  return law < -0.2;   // the chaotic rage rather than mope
}

const FEED: Record<MentalState, (name: string) => string> = {
  despair: (n) => `${n} is overcome by despair, and withdraws.`,
  anger: (n) => `${n} flies into a rage.`,
  elation: (n) => `${n} is overjoyed, and celebrates.`,
};

export function runMentalStateSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const tick = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick;

  // Expire passed states every tick (precise), with a little catharsis so mood isn't still at the
  // floor the instant they recover.
  for (const e of world.query(C_AGENT)) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    if (a.mentalState && (a.mentalUntil ?? 0) <= tick) {
      a.mentalState = undefined;
      a.mentalUntil = undefined;
      if (a.mood !== undefined) a.mood = Math.min(1, a.mood + CATHARSIS);
    }
  }

  // Roll for new breaks once a day.
  if (tick === 0 || tick % cfg.ticksPerDay !== 0) return;
  const day = Math.floor(tick / cfg.ticksPerDay);
  for (const e of world.query(C_AGENT)) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    if (a.mentalState || a.mood === undefined) continue;   // already broken, or no inner life
    let kind: MentalState | null = null;
    // Temperament colours how readily a soul cracks under misery (M28 s3): the tough resist, the
    // volatile break easily. (Elation isn't a hardship break, so it's left unscaled.)
    if (a.mood <= DESPAIR_AT && roll01(e, day) < BREAK_CHANCE * traitBreakFactor(world.getComponent<Personality>(e, C_PERSONALITY))) {
      kind = proneToAnger(world, e) ? 'anger' : 'despair';
    } else if (a.mood >= ELATION_AT && roll01(e, day) < ELATION_CHANCE) kind = 'elation';
    if (!kind) continue;
    a.mentalState = kind;
    a.mentalUntil = tick + Math.round(DAYS[kind] * cfg.ticksPerDay);
    emitEvent(world, 'decide', FEED[kind](a.name));
  }
}
