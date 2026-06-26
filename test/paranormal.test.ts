// Paranormal (M19 slice 4): uncommon, eerie events with real consequences — an abduction
// that marks a soul, a haunting that dampens the town's mood, a wild-magic surge that
// overcharges the mages. All bounded; legends with their own ✺ feed kind.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_MEMORY, C_MAGIC, C_CLOCK, C_EVENTLOG, C_CHRONICLE,
} from '../src/sim/components.ts';
import type { Agent, Memory, Magic, Clock } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import { EVENT_EFFECTS } from '../src/event/effects.ts';
import { runEventSystem } from '../src/sim/systems/EventSystem.ts';
import { Registry } from '../src/content/registry.ts';
import type { WorldEvent } from '../src/content/schema.ts';
import type { Content } from '../src/content/loader.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';
import { createChronicle } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';

const cfg = defaultConfig;
const ctx = (world: World) => ({ world, cfg, rng: createRNG(3), tick: cfg.ticksPerDay });

function emptyMemory(): Memory {
  return { events: [], beliefs: [], summaries: [], utterances: [] } as unknown as Memory;
}
function folk(w: World, over: Partial<Agent> = {}, withMemory = true): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood: 0.7, ...over });
  if (withMemory) w.addComponent<Memory>(e, C_MEMORY, emptyMemory());
  return e;
}

// ── Abduction: marks one adult with an impossible memory + a jolt of unease ───────
describe('abduction (M19)', () => {
  it('takes one adult and returns them changed (a memory + a mood dip), losing no one', () => {
    const w = new World();
    const folks: EntityId[] = [];
    for (let i = 0; i < 8; i++) folks.push(folk(w, { mood: 0.8 }));
    EVENT_EFFECTS.abduction(ctx(w));
    expect(w.query(C_AGENT).length).toBe(8);   // no one is lost
    const marked = folks.filter(e => w.getComponent<Memory>(e, C_MEMORY)!.events.length > 0);
    expect(marked.length).toBe(1);             // exactly one abductee
    expect(w.getComponent<Memory>(marked[0], C_MEMORY)!.events[0].text).toMatch(/lights in the sky/);
    expect(w.getComponent<Agent>(marked[0], C_AGENT)!.mood).toBeCloseTo(0.55, 5);   // unsettled
  });

  it('does nothing when there are no adults', () => {
    const w = new World();
    folk(w, { ticksAlive: 100 });   // a child
    expect(() => EVENT_EFFECTS.abduction(ctx(w))).not.toThrow();
    expect(w.query(C_AGENT).length).toBe(1);
  });
});

// ── Haunting: a town-wide dread ───────────────────────────────────────────────────
describe('haunting (M19)', () => {
  it('dampens every soul’s mood, bounded', () => {
    const w = new World();
    const a = folk(w, { mood: 0.5 });
    const b = folk(w, { mood: 0.0 });   // already glum → stays bounded at 0
    EVENT_EFFECTS.haunting(ctx(w));
    expect(w.getComponent<Agent>(a, C_AGENT)!.mood).toBeCloseTo(0.38, 5);
    expect(w.getComponent<Agent>(b, C_AGENT)!.mood).toBe(0);
  });
});

// ── Wild magic surge: overcharges the mages ───────────────────────────────────────
describe('wild magic surge (M19)', () => {
  it('refills every mage’s mana to full and marks them', () => {
    const w = new World();
    const mage = folk(w);
    w.addComponent<Magic>(mage, C_MAGIC, { mana: 10, maxMana: 100, manaRegenPerTick: 0.04 });
    EVENT_EFFECTS.wild_magic(ctx(w));
    expect(w.getComponent<Magic>(mage, C_MAGIC)!.mana).toBe(100);
    expect(w.getComponent<Memory>(mage, C_MEMORY)!.events.some(m => /surge of magic/.test(m.text))).toBe(true);
  });

  it('is a harmless portent when there are no mages', () => {
    const w = new World();
    folk(w);
    expect(() => EVENT_EFFECTS.wild_magic(ctx(w))).not.toThrow();
  });
});

// ── Pipeline: paranormal events are legends with the ✺ feed kind ──────────────────
function content(events: WorldEvent[]): Content {
  return { events: new Registry<WorldEvent>(events) } as unknown as Content;
}
describe('paranormal pipeline (M19)', () => {
  it('a paranormal event reaches the Chronicle with the paranormal feed kind', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
    const ch = createChronicle();
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, ch);
    folk(w); folk(w);

    const haunting: WorldEvent = { id: 'haunting', name: 'A Haunting', category: 'paranormal', chancePerDay: 1, importance: 0.75, effect: 'haunting', message: 'a dread settled', minPopulation: 0 };
    runEventSystem(w, cfg, createRNG(1), content([haunting]));

    const log = w.getComponent<EventLogData>(w.query(C_EVENTLOG)[0], C_EVENTLOG)!;
    expect(log.entries.some(e => e.kind === 'paranormal' && e.text === 'a dread settled')).toBe(true);
    expect(ch.entries.some(e => e.text === 'a dread settled')).toBe(true);
  });
});
