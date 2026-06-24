import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_JOB, C_WALLET, C_MEMORY, C_POSITION, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK,
} from '../src/sim/components.ts';
import type {
  Agent, Needs, Job, Wallet, Memory, Position, Relationships, Lineage, Clock, Sex,
} from '../src/sim/components.ts';
import { runActionSystem } from '../src/sim/systems/ActionSystem.ts';
import { runSocialSystem } from '../src/sim/systems/SocialSystem.ts';
import { createRNG } from '../src/sim/rng.ts';
import { distill } from '../src/ai/memory.ts';

const cfg = defaultConfig;
const mem = (purpose = 0): Memory => ({
  events: [], summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
  utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9, purpose,
});

describe('distill: memories → a causal drive + vow (D26)', () => {
  it('reads the dominant theme of a life', () => {
    expect(distill([{ tick: 1, text: 'their child Mara was born', importance: 0.85 }]).vow).toMatch(/provide/);
    expect(distill([{ tick: 1, text: 'lost their spouse Tovic', importance: 0.9 }]).vow).toMatch(/guard/);
    expect(distill([{ tick: 1, text: 'took work as a farmer', importance: 0.3 }]).vow).toMatch(/something of themselves/);
    expect(distill([{ tick: 1, text: 'survived a grave illness', importance: 0.45 }]).vow).toMatch(/live fully/);
    expect(distill([]).vow).toMatch(/each day/);
  });

  it('surviving hardship reads as resilience, not loss (grit beats the “ill” cue)', () => {
    // "survived a grave illness" contains the loss cue "ill" but must be scored as grit.
    const d = distill([{ tick: 1, text: 'survived a grave illness', importance: 0.45 }]);
    expect(d.vow).toMatch(/live fully/);
    expect(d.purpose).toBeGreaterThan(0);          // resilience strives, it does not withdraw
  });

  it('bonds drive striving (+), loss drives withdrawal (−)', () => {
    expect(distill([{ tick: 1, text: 'their child was born', importance: 0.85 }]).purpose).toBeGreaterThan(0);
    expect(distill([{ tick: 1, text: 'lost their parent', importance: 0.9 }]).purpose).toBeLessThan(0);
    expect(Math.abs(distill([{ tick: 1, text: 'wed Tovic', importance: 0.7 }]).purpose)).toBeLessThanOrEqual(0.4);
  });
});

describe('ActionSystem: the vow bends how hard folk work (D26)', () => {
  function worker(purpose: number, gold: number): { w: World; agent: Agent } {
    const w = new World();
    const e = w.createEntity();
    const agent: Agent = { name: 'A', action: 'wander', ticksAlive: 30 * ticksPerYear(cfg), wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 };
    w.addComponent<Agent>(e, C_AGENT, agent);
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 1 });   // comfortable
    w.addComponent<Job>(e, C_JOB, { professionId: 'p', professionName: 'P', employer: 999, wagePerTick: 0.1, gathers: null });
    w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
    w.addComponent<Memory>(e, C_MEMORY, mem(purpose));
    return { w, agent };
  }

  it('a driven agent works past where a content one would stop', () => {
    // gold 55, base goal 50: content (purpose 0) is satisfied → wanders; a vow to
    // provide (purpose 0.4 ⇒ effective goal 60) keeps them working.
    const driven = worker(0.4, 55);
    runActionSystem(driven.w, cfg);
    expect(driven.agent.action).toBe('work');

    const content = worker(0, 55);
    runActionSystem(content.w, cfg);
    expect(content.agent.action).toBe('wander');
  });
});

describe('SocialSystem: forming a friendship is a remembered life event (M10 slice 3)', () => {
  function addAgent(w: World, x: number, y: number, sex: Sex = 'female'): EntityId {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: `F${e}`, action: 'wander', ticksAlive: 30 * ticksPerYear(cfg), wealthGoal: 50, sex, lifespanTicks: 1e9 });
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 0.5 });
    w.addComponent<Position>(e, C_POSITION, { x, y });
    w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
    w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
    w.addComponent<Memory>(e, C_MEMORY, mem());
    return e;
  }

  it('two folk who become friends each gain a "befriended" memory', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
    const a = addAgent(w, 5, 5), b = addAgent(w, 6, 5);   // adjacent
    const rng = createRNG(1);
    const noMarry = { ...cfg, marryChancePerDay: 0 };
    for (let i = 0; i < 30; i++) runSocialSystem(w, noMarry, rng);   // sentiment climbs past friendSentiment

    const aMem = w.getComponent<Memory>(a, C_MEMORY)!;
    const bMem = w.getComponent<Memory>(b, C_MEMORY)!;
    expect(aMem.events.some(ev => ev.text.startsWith('befriended'))).toBe(true);
    expect(bMem.events.some(ev => ev.text.startsWith('befriended'))).toBe(true);
    // and only once (the transition fires a single time)
    expect(aMem.events.filter(ev => ev.text.startsWith('befriended')).length).toBe(1);
  });
});
