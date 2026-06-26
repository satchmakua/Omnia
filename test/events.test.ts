// World events (M19 slice 1): the content-driven event pipeline — events load &
// validate (fail loud on a missing effect), the EventSystem fires them
// deterministically once a day under its trigger guards, effects mutate the world,
// and notable events reach the Chronicle while lesser ones stay feed-only.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, calendarOf } from '../src/sim/config.ts';
import {
  C_AGENT, C_CLOCK, C_FLORA, C_EVENTLOG, C_CHRONICLE, C_ORGSTORE,
} from '../src/sim/components.ts';
import type { Agent, Clock, Flora } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import { loadContent } from '../src/content/loader.ts';
import { loadContentFromDisk } from '../src/content/fsSource.ts';
import { Registry } from '../src/content/registry.ts';
import type { WorldEvent } from '../src/content/schema.ts';
import type { Content } from '../src/content/loader.ts';
import { runEventSystem } from '../src/sim/systems/EventSystem.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';
import { createChronicle } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { createOrgStore, createOrg } from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';

const cfg = defaultConfig;

// A fully-specified event (all schema fields), so tests construct intent directly.
function ev(over: Partial<WorldEvent>): WorldEvent {
  return {
    id: 'test_event', name: 'Test Event', category: 'fortune',
    chancePerDay: 1, importance: 0.6, effect: 'festival', message: 'a test event',
    minPopulation: 0, ...over,
  };
}
function content(events: WorldEvent[]): Content {
  return { events: new Registry<WorldEvent>(events) } as unknown as Content;
}

// A world with a clock parked on a day boundary, plus a feed.
function evWorld(tick = cfg.ticksPerDay): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: tick / cfg.ticksPerDay, hour: 0, isDay: true });
  w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
  return w;
}
function moodAgent(w: World, mood = 0.5): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood });
  return e;
}
function feed(w: World): EventLogData {
  return w.getComponent<EventLogData>(w.query(C_EVENTLOG)[0], C_EVENTLOG)!;
}

// ── Content loading (D9: definitions are data, effects are code) ────────────────
describe('events content (M19)', () => {
  it('the shipped events load and reference real effects', () => {
    const c = loadContentFromDisk('./content');
    const ids = c.events.all().map(e => e.id);
    expect(ids).toContain('festival');
    expect(ids).toContain('bountiful_harvest');
    expect(ids).toContain('great_discovery');
  });

  it('an event with an unimplemented effect fails loud, naming the file', () => {
    const SPECIES = `
id: "elf"
name: "Elf"
lifespanYears: { min: 300, max: 500 }
size: "medium"
color: "#88ff88"
needs: { hunger: 1.0, energy: 1.0 }
language: "old_vant"
`;
    const BAD_EVENT = `
id: "doom"
name: "Doom"
chancePerDay: 0.1
effect: "no_such_effect"
message: "the sky falls"
`;
    expect(() => loadContent(new Map([
      ['species/elf.yaml', SPECIES],
      ['events/doom.yaml', BAD_EVENT],
    ]))).toThrowError(/events\/doom.*no_such_effect/s);
  });
});

// ── Scheduling: deterministic, once a day, under guards ─────────────────────────
describe('EventSystem scheduling (M19)', () => {
  it('fires on a day boundary and applies its effect (a festival lifts the mood)', () => {
    const w = evWorld();
    const a = moodAgent(w, 0.5);
    runEventSystem(w, cfg, createRNG(1), content([ev({ effect: 'festival', chancePerDay: 1 })]));
    expect(w.getComponent<Agent>(a, C_AGENT)!.mood!).toBeCloseTo(0.65, 5);
    expect(feed(w).entries.some(e => e.kind === 'event')).toBe(true);
  });

  it('never fires at chancePerDay 0, and never off a day boundary', () => {
    const wZero = evWorld();
    const a0 = moodAgent(wZero, 0.5);
    runEventSystem(wZero, cfg, createRNG(1), content([ev({ chancePerDay: 0 })]));
    expect(wZero.getComponent<Agent>(a0, C_AGENT)!.mood).toBe(0.5);

    const wMid = evWorld(cfg.ticksPerDay + 1);   // not a day boundary
    const a1 = moodAgent(wMid, 0.5);
    runEventSystem(wMid, cfg, createRNG(1), content([ev({ chancePerDay: 1 })]));
    expect(wMid.getComponent<Agent>(a1, C_AGENT)!.mood).toBe(0.5);
  });

  it('respects the minPopulation trigger guard', () => {
    const w = evWorld();
    const a = moodAgent(w, 0.5);   // population 1
    runEventSystem(w, cfg, createRNG(1), content([ev({ chancePerDay: 1, minPopulation: 10 })]));
    expect(w.getComponent<Agent>(a, C_AGENT)!.mood).toBe(0.5);   // gated out
  });

  it('respects the season guard', () => {
    const w = evWorld();
    const here = calendarOf(cfg.ticksPerDay, cfg).season as WorldEvent['season'];
    const elsewhere: WorldEvent['season'] = here === 'Winter' ? 'Summer' : 'Winter';
    const a = moodAgent(w, 0.5);
    runEventSystem(w, cfg, createRNG(1), content([ev({ chancePerDay: 1, season: elsewhere })]));
    expect(w.getComponent<Agent>(a, C_AGENT)!.mood).toBe(0.5);   // wrong season → no fire

    runEventSystem(w, cfg, createRNG(1), content([ev({ chancePerDay: 1, season: here })]));
    expect(w.getComponent<Agent>(a, C_AGENT)!.mood!).toBeCloseTo(0.65, 5);  // right season → fires
  });
});

// ── Effects mutate the world (bounded, no RNG of their own) ──────────────────────
describe('event effects (M19)', () => {
  it('bountiful_harvest ripens the flora', () => {
    const w = evWorld();
    moodAgent(w);   // population floor
    const f = w.createEntity();
    w.addComponent<Flora>(f, C_FLORA, { speciesId: 'x', name: 'x', color: '#0f0', maturity: 0.2, growthPerTick: 0, edibleAt: 0.5, foodYield: 1, spreadChancePerTick: 0 });
    runEventSystem(w, cfg, createRNG(1), content([ev({ effect: 'bountiful_harvest', chancePerDay: 1 })]));
    expect(w.getComponent<Flora>(f, C_FLORA)!.maturity).toBeCloseTo(0.6, 5);
  });

  it('great_discovery quickens every living tribe’s research', () => {
    const w = evWorld();
    moodAgent(w);
    const store = createOrgStore();
    w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE, store);
    const org = createOrg(store, 'Clan', { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, 0.5, 0);
    runEventSystem(w, cfg, createRNG(1), content([ev({ effect: 'great_discovery', chancePerDay: 1 })]));
    expect(store.byId[org].research).toBeGreaterThan(0);
  });
});

// ── Importance gates the Chronicle (legends vs the daily feed) ───────────────────
describe('events reach the Chronicle by importance (M19)', () => {
  function withChronicle(): { w: World; ch: ChronicleData } {
    const w = evWorld();
    moodAgent(w);
    const ch = createChronicle();
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, ch);
    return { w, ch };
  }

  it('a notable event becomes a Chronicle legend', () => {
    const { w, ch } = withChronicle();
    runEventSystem(w, cfg, createRNG(1), content([ev({ importance: 0.7, message: 'a great discovery', chancePerDay: 1 })]));
    expect(ch.entries.some(e => e.text === 'a great discovery' && e.kind === 'event')).toBe(true);
  });

  it('a minor event stays in the feed but not the Chronicle', () => {
    const { w, ch } = withChronicle();
    // 0.5 < chronicleImportanceThreshold (0.6) → feed only
    runEventSystem(w, cfg, createRNG(1), content([ev({ importance: 0.5, message: 'a small festival', chancePerDay: 1 })]));
    expect(feed(w).entries.some(e => e.kind === 'event')).toBe(true);
    expect(ch.entries.length).toBe(0);
  });
});
