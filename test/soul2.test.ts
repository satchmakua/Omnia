import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_MEMORY, C_POSITION, C_RELATIONSHIPS, C_CLOCK, C_AIRECORD, C_EVENTLOG,
} from '../src/sim/components.ts';
import type {
  Agent, Memory, MemoryEntry, Position, Relationships, RelationEdge, Clock, AIRecord, AgentAction, Sex,
} from '../src/sim/components.ts';
import { runAISystem } from '../src/sim/systems/AISystem.ts';
import { stubProvider } from '../src/ai/stubProvider.ts';
import {
  buildReflectionPrompt, buildDreamPrompt, buildDialoguePrompt, buildDecisionPrompt,
} from '../src/ai/memory.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';

const cfg = defaultConfig;
const NOW = 100_000;

function quietEvents(n = 3, base = 10): MemoryEntry[] {
  return Array.from({ length: n }, (_, i) => ({ tick: base + i, text: 'wandered the open plains', importance: 0.2 }));
}
const familyEvents: MemoryEntry[] = [
  { tick: 1, text: 'their child was born', importance: 0.85 },
  { tick: 2, text: 'their child was born', importance: 0.85 },
];

interface AgentOpts {
  name: string; action?: AgentAction; sex?: Sex; events?: MemoryEntry[];
  pos?: Position; edges?: Record<number, RelationEdge>; reflectTick?: number;
}

function scaffold(tick = NOW, isDay = true) {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: Math.floor(tick / 240), hour: 0, isDay });
  const rec = w.createEntity();
  w.addComponent<AIRecord>(rec, C_AIRECORD, { entries: [] });
  const log = w.createEntity();
  w.addComponent<EventLogData>(log, C_EVENTLOG, createEventLog());
  return { w, rec };
}

function addAgent(w: World, o: AgentOpts): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: o.name, action: o.action ?? 'wander', ticksAlive: 50_000, wealthGoal: 50,
    sex: o.sex ?? 'female', lifespanTicks: 1e9,
  });
  w.addComponent<Memory>(e, C_MEMORY, {
    events: [...(o.events ?? [])], beliefs: [], lastReflectTick: o.reflectTick ?? NOW, // suppress reflection by default
    utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9,
  });
  if (o.pos) w.addComponent<Position>(e, C_POSITION, o.pos);
  if (o.edges) w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: o.edges });
  return e;
}

const mem = (w: World, e: EntityId) => w.getComponent<Memory>(e, C_MEMORY)!;
const records = (w: World, rec: EntityId) => w.getComponent<AIRecord>(rec, C_AIRECORD)!.entries.length;

// ── stub registers ──────────────────────────────────────────────────────────────

describe('StubProvider registers (dialogue / dream / decision)', () => {
  it('answers each prompt in its own voice, themed and deterministic', () => {
    const dreamP = buildDreamPrompt('Mara', 5, familyEvents);
    expect(stubProvider.completeSync(dreamP).startsWith('dreamed')).toBe(true);
    expect(stubProvider.completeSync(dreamP)).toBe(stubProvider.completeSync(dreamP)); // deterministic

    const sayP = buildDialoguePrompt('Mara', 'Tovic', 5, familyEvents);
    expect(['How are the little ones?', 'Our family is everything to me.', 'Stay close — kin is all we have.'])
      .toContain(stubProvider.completeSync(sayP));

    const decP = buildDecisionPrompt('Mara', 'their child was born', 5, familyEvents);
    expect(['vowed to put family above all else', 'resolved to keep their kin safe', 'swore to give their children a better life'])
      .toContain(stubProvider.completeSync(decP));

    // Regression: the part-1 reflection register still produces a belief.
    expect(['treasures family above all', 'lives for their kin', 'finds meaning in their children'])
      .toContain(stubProvider.completeSync(buildReflectionPrompt('Mara', 5, familyEvents)));
  });
});

// ── dreams ────────────────────────────────────────────────────────────────────

describe('AISystem dreams', () => {
  it('a sleeping agent at night dreams, recorded and throttled', () => {
    const { w, rec } = scaffold(NOW, /* isDay */ false);
    const a = addAgent(w, { name: 'Mara', action: 'sleep', events: quietEvents() });
    runAISystem(w, cfg, stubProvider);

    const m = mem(w, a);
    expect(m.utterances.length).toBe(1);
    expect(m.utterances[0].kind).toBe('dream');
    expect(m.utterances[0].text.startsWith('dreamed')).toBe(true);
    expect(m.lastDreamTick).toBe(NOW);
    expect(records(w, rec)).toBe(1);

    // Within the interval, no second dream.
    runAISystem(w, cfg, stubProvider);
    expect(mem(w, a).utterances.length).toBe(1);
  });

  it('does not dream during the day', () => {
    const { w } = scaffold(NOW, /* isDay */ true);
    const a = addAgent(w, { name: 'Mara', action: 'sleep', events: quietEvents() });
    runAISystem(w, cfg, stubProvider);
    expect(mem(w, a).utterances.length).toBe(0);
  });

  it('does not dream while awake at night', () => {
    const { w } = scaffold(NOW, false);
    const a = addAgent(w, { name: 'Mara', action: 'wander', events: quietEvents() });
    runAISystem(w, cfg, stubProvider);
    expect(mem(w, a).utterances.length).toBe(0);
  });
});

// ── decisions ───────────────────────────────────────────────────────────────────

describe('AISystem decisions', () => {
  it('a fresh turning-point memory prompts a resolution', () => {
    const { w, rec } = scaffold();
    const a = addAgent(w, { name: 'Mara', events: [{ tick: 5, text: 'took work', importance: 0.3 }, ...familyEvents] });
    runAISystem(w, cfg, stubProvider);

    const m = mem(w, a);
    expect(m.utterances.length).toBe(1);
    expect(m.utterances[0].kind).toBe('decide');
    expect(m.lastSpokeTick).toBe(NOW);
    expect(records(w, rec)).toBe(1);
  });

  it('a mundane recent memory is not a turning point', () => {
    const { w } = scaffold();
    const a = addAgent(w, { name: 'Mara', events: [...quietEvents(), { tick: 99, text: 'took work', importance: 0.3 }] });
    runAISystem(w, cfg, stubProvider);
    expect(mem(w, a).utterances.length).toBe(0);
  });
});

// ── dialogue ─────────────────────────────────────────────────────────────────────

describe('AISystem dialogue', () => {
  it('co-located bonded agents exchange a line (spoken by the first)', () => {
    const { w, rec } = scaffold();
    // Mara is created first → lower id → the speaker.
    const mara = addAgent(w, { name: 'Mara', events: quietEvents(), pos: { x: 5, y: 5 } });
    const tovic = addAgent(w, { name: 'Tovic', sex: 'male', events: quietEvents(), pos: { x: 5, y: 5 } });
    w.addComponent<Relationships>(mara, C_RELATIONSHIPS, { edges: { [tovic]: { type: 'partner', sentiment: 0.8 } } });
    w.addComponent<Relationships>(tovic, C_RELATIONSHIPS, { edges: { [mara]: { type: 'partner', sentiment: 0.8 } } });

    runAISystem(w, cfg, stubProvider);

    const sm = mem(w, mara);
    expect(sm.utterances.length).toBe(1);
    expect(sm.utterances[0].kind).toBe('say');
    expect(sm.utterances[0].text).toContain('to Tovic');
    expect(mem(w, tovic).utterances.length).toBe(0); // listener doesn't also speak
    expect(records(w, rec)).toBe(1);
  });

  it('strangers on the same tile do not converse', () => {
    const { w } = scaffold();
    const a = addAgent(w, { name: 'Mara', events: quietEvents(), pos: { x: 5, y: 5 } });
    const b = addAgent(w, { name: 'Tovic', sex: 'male', events: quietEvents(), pos: { x: 5, y: 5 } });
    w.addComponent<Relationships>(a, C_RELATIONSHIPS, { edges: {} });
    w.addComponent<Relationships>(b, C_RELATIONSHIPS, { edges: {} });
    runAISystem(w, cfg, stubProvider);
    expect(mem(w, a).utterances.length + mem(w, b).utterances.length).toBe(0);
  });
});

// ── budget, bound & determinism ──────────────────────────────────────────────────

describe('AISystem expression budget & bounds', () => {
  it('respects the per-tick expression cap across the town', () => {
    const { w } = scaffold();
    addAgent(w, { name: 'Mara', events: [...familyEvents] });
    addAgent(w, { name: 'Bryn', sex: 'male', events: [...familyEvents] });
    addAgent(w, { name: 'Cael', sex: 'male', events: [...familyEvents] });
    runAISystem(w, { ...cfg, maxExpressionsPerTick: 1 }, stubProvider);

    const total = w.query(C_AGENT, C_MEMORY).reduce((s, e) => s + mem(w, e).utterances.length, 0);
    expect(total).toBe(1);
  });

  it('keeps each agent’s utterance list bounded', () => {
    const small = { ...cfg, maxUtterances: 2 };
    const { w } = scaffold(0, false);
    const a = addAgent(w, { name: 'Mara', action: 'sleep', events: quietEvents(), reflectTick: 0 });
    const clk = w.query(C_CLOCK)[0];
    const interval = small.expressionIntervalDays * small.ticksPerDay;
    for (let k = 0; k < 5; k++) {
      w.getComponent<Clock>(clk, C_CLOCK)!.tick = k * (interval + 1);
      runAISystem(w, small, stubProvider);
    }
    expect(mem(w, a).utterances.length).toBe(small.maxUtterances);
  });

  it('is deterministic: identical setups → identical utterances', () => {
    function run() {
      const { w } = scaffold();
      const a = addAgent(w, { name: 'Mara', events: [...familyEvents] });
      runAISystem(w, cfg, stubProvider);
      return mem(w, a).utterances.map(u => `${u.kind}:${u.text}`);
    }
    expect(run()).toEqual(run());
  });
});
