// Heredity (M13): ability scores + physical traits are rolled for founders and passed down
// to children as the parental mean + variation — so they visibly run in families.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { createRNG } from '../src/sim/rng.ts';
import {
  rollBody, inheritBody, charismaWarmth, rollAlignment, inheritAlignment, alignmentName, alignmentWarmth,
  rollPersonality, inheritPersonality, traitGoalFactor,
} from '../src/sim/heredity.ts';
import {
  C_AGENT, C_MEMORY, C_CLOCK, C_AIRECORD, C_ALIGNMENT, C_PERSONALITY, C_NEEDS, C_JOB, C_WALLET,
} from '../src/sim/components.ts';
import type { Species } from '../src/content/schema.ts';
import type {
  Body, Alignment, Personality, Memory, MemoryEntry, AIRecord, Agent, Needs, Job, Wallet,
} from '../src/sim/components.ts';
import { runAISystem } from '../src/sim/systems/AISystem.ts';
import { runActionSystem } from '../src/sim/systems/ActionSystem.ts';
import { stubProvider } from '../src/ai/stubProvider.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const human: Species = {
  id: 'human', name: 'Human', lifespanYears: { min: 60, max: 90 }, size: 'medium', spawnWeight: 1,
  color: '#ffffff', tags: [], needs: { hunger: 1, energy: 1 }, magicAptitudeChance: 0, language: 'x', abilityMods: {},
};
const dwarf: Species = { ...human, id: 'dwarf', size: 'small', abilityMods: { con: 2, str: 1, dex: -1, cha: -1 } };

describe('rollBody', () => {
  it('rolls every ability in [3,18] and traits in [0,1]', () => {
    const rng = createRNG(1);
    for (let i = 0; i < 60; i++) {
      const b = rollBody(rng, human);
      for (const k of ABILITIES) { expect(b[k]).toBeGreaterThanOrEqual(3); expect(b[k]).toBeLessThanOrEqual(18); }
      for (const t of [b.build, b.eye, b.hair]) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1); }
      expect(b.heightCm).toBeGreaterThan(0);
    }
  });

  it('applies species ability modifiers (dwarves average hardier than humans)', () => {
    const rng = createRNG(7);
    const N = 500; let h = 0, d = 0;
    for (let i = 0; i < N; i++) { h += rollBody(rng, human).con; d += rollBody(rng, dwarf).con; }
    expect(d / N).toBeGreaterThan(h / N);   // the +2 CON mod shows up in the mean
  });
});

describe('inheritBody — traits run in families', () => {
  const mk = (over: Partial<Body>): Body =>
    ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, heightCm: 170, build: 0.5, eye: 0.5, hair: 0.5, ...over });

  it('light-eyed parents tend to light-eyed children (the DoD test)', () => {
    const rng = createRNG(3);
    const a = mk({ eye: 0.95 }), b = mk({ eye: 0.9 });
    let light = 0; const N = 300;
    for (let i = 0; i < N; i++) if (inheritBody(rng, a, b).eye > 0.7) light++;
    expect(light / N).toBeGreaterThan(0.9);   // overwhelmingly light-eyed
  });

  it('children regress toward the parental mean (strong parents → strong children)', () => {
    const rng = createRNG(4);
    const a = mk({ str: 16 }), b = mk({ str: 16 });
    let sum = 0; const N = 400;
    for (let i = 0; i < N; i++) sum += inheritBody(rng, a, b).str;
    expect(sum / N).toBeGreaterThan(14);      // not a fresh ~10.5 roll — they take after their parents
  });

  it('stays in bounds even at the extremes', () => {
    const rng = createRNG(5);
    const a = mk({ str: 18, eye: 1, build: 1 }), b = mk({ str: 18, eye: 1, build: 1 });
    for (let i = 0; i < 100; i++) {
      const c = inheritBody(rng, a, b);
      expect(c.str).toBeLessThanOrEqual(18);
      expect(c.eye).toBeLessThanOrEqual(1);
      expect(c.build).toBeLessThanOrEqual(1);
    }
  });
});

describe('charismaWarmth (the first ability-score coupling, D26)', () => {
  it('is ~1 at the average score, higher when magnetic, lower when charmless, bounded', () => {
    expect(charismaWarmth(10.5, 10.5)).toBeCloseTo(1, 6);
    expect(charismaWarmth(18, 18)).toBeGreaterThan(1);
    expect(charismaWarmth(3, 3)).toBeLessThan(1);
    expect(charismaWarmth(18, 18)).toBeLessThanOrEqual(1.3);
    expect(charismaWarmth(3, 3)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('alignment (M13)', () => {
  it('founders start neutral-leaning-good, both axes in [-1,1]', () => {
    const rng = createRNG(2);
    let goodSum = 0; const N = 300;
    for (let i = 0; i < N; i++) {
      const al = rollAlignment(rng);
      expect(al.good).toBeGreaterThanOrEqual(-1); expect(al.good).toBeLessThanOrEqual(1);
      expect(al.law).toBeGreaterThanOrEqual(-1); expect(al.law).toBeLessThanOrEqual(1);
      goodSum += al.good;
    }
    expect(goodSum / N).toBeGreaterThan(0);   // leans good on average
  });

  it('children inherit the parental lean (good parents → good-leaning children)', () => {
    const rng = createRNG(3);
    const a: Alignment = { good: 0.8, law: 0.5 }, b: Alignment = { good: 0.7, law: 0.4 };
    let sum = 0; const N = 300;
    for (let i = 0; i < N; i++) sum += inheritAlignment(rng, a, b).good;
    expect(sum / N).toBeGreaterThan(0.6);
  });

  it('maps to the classic 3×3 grid', () => {
    expect(alignmentName({ good: 0.9, law: 0.9 })).toBe('Lawful Good');
    expect(alignmentName({ good: -0.9, law: -0.9 })).toBe('Chaotic Evil');
    expect(alignmentName({ good: 0, law: 0 })).toBe('True Neutral');
    expect(alignmentName({ good: 0.9, law: 0 })).toBe('Neutral Good');
  });

  it('alignmentWarmth: neutral is a no-op, good cooperates more, evil less, bounded', () => {
    expect(alignmentWarmth(0, 0)).toBeCloseTo(1, 6);
    expect(alignmentWarmth(1, 1)).toBeGreaterThan(1);
    expect(alignmentWarmth(-1, -1)).toBeLessThan(1);
    expect(alignmentWarmth(1, 1)).toBeLessThanOrEqual(1.3);
  });

  it('alignment shifts with the life lived (the DoD test): bonds → good, loss → harder', () => {
    const cfg = defaultConfig;
    const make = (events: MemoryEntry[]) => {
      const w = new World();
      w.addComponent(w.createEntity(), C_CLOCK, { tick: 100_000, day: 0, hour: 0, isDay: true });
      w.addComponent<AIRecord>(w.createEntity(), C_AIRECORD, { entries: [] });
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 50_000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
      w.addComponent<Memory>(e, C_MEMORY, {
        events: [...events], summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
        utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9,
      });
      w.addComponent<Alignment>(e, C_ALIGNMENT, { good: 0, law: 0 });
      runAISystem(w, cfg, stubProvider);
      return w.getComponent<Alignment>(e, C_ALIGNMENT)!.good;
    };
    const bonds = make([
      { tick: 1, text: 'their child was born', importance: 0.85 },
      { tick: 2, text: 'befriended Pim', importance: 0.5 },
      { tick: 3, text: 'their child was born', importance: 0.85 },
    ]);
    const loss = make([
      { tick: 1, text: 'lost their parent', importance: 0.9 },
      { tick: 2, text: 'lost their spouse', importance: 0.9 },
      { tick: 3, text: 'lost their child', importance: 0.95 },
    ]);
    expect(bonds).toBeGreaterThan(0);   // a life of bonds leaned toward good
    expect(loss).toBeLessThan(0);       // a life of loss hardened
  });
});

describe('personality (M13)', () => {
  it('rolls a trait from the palette; the goal factor bends striving', () => {
    const rng = createRNG(9);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(rollPersonality(rng).trait);
    expect(seen.size).toBeGreaterThan(3);                 // a varied palette
    expect(traitGoalFactor('ambitious')).toBeGreaterThan(1);
    expect(traitGoalFactor('content')).toBeLessThan(1);
    expect(traitGoalFactor('loyal')).toBe(1);             // flavour traits don't bend the goal
  });

  it('children usually take after a parent', () => {
    const rng = createRNG(2);
    const a: Personality = { trait: 'ambitious' }, b: Personality = { trait: 'gentle' };
    let matched = 0; const N = 300;
    for (let i = 0; i < N; i++) { const t = inheritPersonality(rng, a, b).trait; if (t === 'ambitious' || t === 'gentle') matched++; }
    expect(matched / N).toBeGreaterThan(0.5);             // most resemble a parent
  });

  it('ambition changes behaviour: an ambitious agent works past where a content one rests', () => {
    const cfg = defaultConfig;
    const worker = (trait: string, gold: number): string => {
      const w = new World();
      const e = w.createEntity();
      const agent: Agent = { name: 'A', action: 'wander', ticksAlive: 30 * ticksPerYear(cfg), wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 };
      w.addComponent<Agent>(e, C_AGENT, agent);
      w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 1 });
      w.addComponent<Job>(e, C_JOB, { professionId: 'p', professionName: 'P', employer: 999, wagePerTick: 0.1, gathers: null });
      w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
      w.addComponent<Personality>(e, C_PERSONALITY, { trait });
      runActionSystem(w, cfg);
      return agent.action;
    };
    // gold 55, base goal 50: the ambitious (goal ×1.3 = 65) keep working; the content (×0.78 = 39) rest.
    expect(worker('ambitious', 55)).toBe('work');
    expect(worker('content', 55)).toBe('wander');
  });

  it('deep loss hardens a personality (mid-life trauma drift)', () => {
    const cfg = defaultConfig;
    const w = new World();
    w.addComponent(w.createEntity(), C_CLOCK, { tick: 100_000, day: 0, hour: 0, isDay: true });
    w.addComponent<AIRecord>(w.createEntity(), C_AIRECORD, { entries: [] });
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 50_000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
    w.addComponent<Memory>(e, C_MEMORY, {
      events: [
        { tick: 1, text: 'lost their child', importance: 0.95 },
        { tick: 2, text: 'lost their spouse', importance: 0.9 },
        { tick: 3, text: 'lost their parent', importance: 0.9 },
      ],
      summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
      utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9,
    });
    w.addComponent<Personality>(e, C_PERSONALITY, { trait: 'gentle' });
    runAISystem(w, cfg, stubProvider);
    expect(w.getComponent<Personality>(e, C_PERSONALITY)!.trait).toBe('hardened');
  });
});
