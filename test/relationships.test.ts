// Opinions with reasons (M29 slice 1). Relationship edges now carry the *why* behind the opinion —
// "robbed them", "murdered their child Korga", "a long friendship". These tests pin the opine helper,
// the crime-driven grudges (incl. the emergent kin-grudge that seeds a feud), and back-compat.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_ALIGNMENT, C_WALLET, C_POSITION, C_HEALTH, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK, C_CHRONICLE, C_EVENTLOG,
} from '../src/sim/components.ts';
import type { Agent, Alignment, Wallet, Health, Relationships, Lineage, Clock, Position, MentalState } from '../src/sim/components.ts';
import { opine } from '../src/sim/relationships.ts';
import { runCrimeSystem } from '../src/sim/systems/CrimeSystem.ts';
import { createChronicle } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';
import { createRNG } from '../src/sim/rng.ts';

const ADULT = Math.floor(25 * ticksPerYear(defaultConfig));

describe('opine — set an opinion with a reason (M29 s1)', () => {
  it('creates an edge, sets type + reason, clamps sentiment, latest reason wins', () => {
    const rel: Relationships = { edges: {} };
    opine(rel, 5, 'rival', -0.5, 'robbed them');
    expect(rel.edges[5]).toMatchObject({ type: 'rival', sentiment: -0.5, reason: 'robbed them' });
    opine(rel, 5, 'rival', -0.9, 'assaulted them');   // deepens & updates the reason
    expect(rel.edges[5].sentiment).toBe(-1);          // clamped
    expect(rel.edges[5].reason).toBe('assaulted them');
  });
  it('a pre-M29 edge with no reason still reads fine', () => {
    const rel: Relationships = { edges: { 9: { type: 'friend', sentiment: 0.8 } } };
    expect(rel.edges[9].reason).toBeUndefined();
  });
});

describe('crime records why folk turn on the wrongdoer (M29 s1)', () => {
  const forceCrime = { ...defaultConfig, crimeChancePerDay: 1 };

  function world(): { w: World } {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: forceCrime.ticksPerDay, day: 1, hour: 0, isDay: true });
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, createChronicle());
    w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
    return { w };
  }
  function person(w: World, x: number, opts: { good?: number; health?: number; state?: MentalState; lineage?: Partial<Lineage> } = {}): EntityId {
    const e = w.createEntity();
    w.addComponent<Position>(e, C_POSITION, { x, y: 5 });
    w.addComponent<Agent>(e, C_AGENT, { name: `P${e}`, action: 'wander', ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood: 0.5, mentalState: opts.state });
    w.addComponent<Alignment>(e, C_ALIGNMENT, { good: opts.good ?? 0.8, law: 0 });
    w.addComponent<Wallet>(e, C_WALLET, { gold: 20, debt: 0 });
    w.addComponent<Health>(e, C_HEALTH, { value: opts.health ?? 1, ill: false });
    w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
    w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0, ...opts.lineage });
    return e;
  }

  it('a theft victim records "robbed them" against the thief', () => {
    const { w } = world();
    const thief = person(w, 5, { good: -0.5 });   // wicked → theft (not aggressive → no assault)
    const victim = person(w, 6);
    runCrimeSystem(w, forceCrime, createRNG(2));
    const edge = w.getComponent<Relationships>(victim, C_RELATIONSHIPS)!.edges[thief];
    expect(edge).toBeDefined();
    expect(edge.type).toBe('rival');
    expect(edge.reason).toBe('robbed them');
  });

  it('a murder makes the victim’s living kin loathe the killer (the feud seed)', () => {
    const { w } = world();
    const killer = person(w, 5, { state: 'anger' });          // enraged → assault → murder
    const victim = person(w, 6, { health: 0.02 });            // frail → the first blow kills
    const parent = person(w, 30, {});                          // the victim's living parent, far off
    // wire the family both ways
    w.getComponent<Lineage>(victim, C_LINEAGE)!.parents = [parent];
    w.getComponent<Lineage>(parent, C_LINEAGE)!.children = [victim];
    runCrimeSystem(w, forceCrime, createRNG(2));
    expect(w.hasComponent(victim, C_AGENT)).toBe(false);       // slain
    const grudge = w.getComponent<Relationships>(parent, C_RELATIONSHIPS)!.edges[killer];
    expect(grudge).toBeDefined();
    expect(grudge.type).toBe('rival');
    expect(grudge.reason).toMatch(/^murdered their child P\d+$/);   // labelled from the parent's side
    expect(grudge.sentiment).toBeLessThan(0);
  });
});
