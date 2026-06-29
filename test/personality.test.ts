// Multi-trait personality (M28 slice 3). Each soul carries a small SET of heritable traits: a
// dominant one (the M13 wealth-goal/crime couplings) plus secondaries that shape who they befriend,
// what lifts/sours their mood, and how readily they break. These tests pin the trait-set model
// (expansion + heritability, both RNG-free), the pure behavioural hooks, and one end-to-end mood shift.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_PERSONALITY, C_WALLET, C_CLOCK } from '../src/sim/components.ts';
import type { Agent, Personality, Wallet, Clock } from '../src/sim/components.ts';
import {
  expandPersonality, traitsOf, hasTrait, traitBondFactor, traitMoodBias, traitBreakFactor, traitAggressive,
} from '../src/sim/heredity.ts';
import { runMoodSystem, MOOD_BASELINE } from '../src/sim/systems/MoodSystem.ts';

const cfg = defaultConfig;
const ADULT = Math.floor(25 * ticksPerYear(cfg));
const P = (...ts: string[]): Personality => ({ trait: ts[0], traits: ts });

describe('the trait set: expansion + heritability (RNG-free) (M28 s3)', () => {
  it('expands a dominant trait into a 2–3 trait set that includes it', () => {
    const p = expandPersonality(7, 'loyal');
    expect(p.trait).toBe('loyal');
    expect(p.traits!.length).toBeGreaterThanOrEqual(2);
    expect(p.traits!).toContain('loyal');
    expect(new Set(p.traits!).size).toBe(p.traits!.length);   // no duplicates
  });

  it('is deterministic by entity id (no RNG) — same id → same set', () => {
    expect(expandPersonality(42, 'brave')).toEqual(expandPersonality(42, 'brave'));
  });

  it('a child draws its extra traits from its parents’ pooled traits (heritable)', () => {
    const pool = ['ambitious', 'gregarious'];   // the parents' combined traits
    const child = expandPersonality(99, 'ambitious', pool);
    for (const t of child.traits!) expect(['ambitious', 'gregarious']).toContain(t);
  });

  it('a pre-M28 personality (no `traits`) reads as just its dominant trait', () => {
    expect(traitsOf({ trait: 'curious' })).toEqual(['curious']);
    expect(hasTrait({ trait: 'curious' }, 'curious')).toBe(true);
  });
});

describe('friendship: who they befriend (M28 s3)', () => {
  it('the gregarious & like-minded warm faster; the solitary cool', () => {
    const gregarious = traitBondFactor(P('gregarious'), P('gregarious'));
    const solitary   = traitBondFactor(P('solitary'), P('solitary'));
    const strangers  = traitBondFactor(P('curious'), P('content'));
    expect(gregarious).toBeGreaterThan(1);
    expect(solitary).toBeLessThan(1);
    expect(gregarious).toBeGreaterThan(solitary);
    // shared traits add rapport on top.
    expect(traitBondFactor(P('loyal', 'curious'), P('loyal', 'curious'))).toBeGreaterThan(
      traitBondFactor(P('loyal', 'curious'), P('loyal', 'gentle')));
  });
});

describe('hardship: how they bear it (M28 s3)', () => {
  it('the tough resist breaks, the volatile crack easily', () => {
    expect(traitBreakFactor(P('content'))).toBeLessThan(1);
    expect(traitBreakFactor(P('cheerful'))).toBeLessThan(1);
    expect(traitBreakFactor(P('hot-headed'))).toBeGreaterThan(1);
    expect(traitBreakFactor(P('nervous'))).toBeGreaterThan(1);
  });
  it('aggression (rage over despair) reads off the whole set', () => {
    expect(traitAggressive(P('gentle', 'brave'))).toBe(true);    // a secondary aggressive trait counts
    expect(traitAggressive(P('gentle', 'content'))).toBe(false);
  });
});

describe('mood: what lifts/sours it (M28 s3)', () => {
  it('cheerful lifts, nervous lowers; debt sours the ambitious, loneliness the gregarious', () => {
    const calm = { inDebt: false, noFamily: false };
    expect(traitMoodBias(P('cheerful'), calm)).toBeGreaterThan(0);
    expect(traitMoodBias(P('nervous'), calm)).toBeLessThan(0);
    expect(traitMoodBias(P('ambitious'), { inDebt: true, noFamily: false }))
      .toBeLessThan(traitMoodBias(P('ambitious'), calm));
    expect(traitMoodBias(P('gregarious'), { inDebt: false, noFamily: true }))
      .toBeLessThan(traitMoodBias(P('gregarious'), calm));
  });

  it('DoD — a cheerful and a nervous soul end the day at measurably different moods', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const make = (traits: string[]): EntityId => {
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood: MOOD_BASELINE });
      w.addComponent<Personality>(e, C_PERSONALITY, P(...traits));
      w.addComponent<Wallet>(e, C_WALLET, { gold: 50, debt: 0 });
      return e;
    };
    const cheerful = make(['cheerful']);
    const nervous  = make(['nervous']);
    for (let d = 0; d < 5; d++) runMoodSystem(w, cfg);   // a few days to settle toward target
    expect(w.getComponent<Agent>(cheerful, C_AGENT)!.mood!).toBeGreaterThan(
      w.getComponent<Agent>(nervous, C_AGENT)!.mood! + 0.05);
  });
});
