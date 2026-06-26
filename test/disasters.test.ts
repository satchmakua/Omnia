// Disasters (M19 slice 2): famine / plague / earthquake — the first events with real
// negative (but survivable) consequences. The effects harm the world in bounded ways,
// and a disaster reaches the Chronicle as a legend with its own alarming feed kind.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_HEALTH, C_FLORA, C_POSITION, C_TILEMAP, C_HOME, C_CULTURESTORE,
  C_CLOCK, C_EVENTLOG, C_CHRONICLE,
} from '../src/sim/components.ts';
import type { Agent, Health, Flora, Position, Home, Clock } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
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
import type { CultureStoreData, RuntimeCulture } from '../src/culture/cultureStore.ts';

const cfg = defaultConfig;
const ctx = (world: World) => ({ world, cfg, rng: createRNG(1) });

function openMap(w: number, h: number): TileMapData {
  return {
    width: w, height: h, biomeIndex: new Uint16Array(w * h),
    biomeIds: ['ground'], biomeNames: ['Ground'], colors: ['#333'], passableByBiome: [true],
  };
}
function agent(w: World, over: Partial<Agent> = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, ...over });
  return e;
}
function healthAgent(w: World, x: number, y: number, value = 1): EntityId {
  const e = agent(w);
  w.addComponent<Health>(e, C_HEALTH, { value, ill: false });
  w.addComponent<Position>(e, C_POSITION, { x, y });
  return e;
}
function cultureStore(w: World): CultureStoreData {
  const c: RuntimeCulture = { id: 'a', name: 'A', language: 'l', values: { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, practices: [], cohesion: 0.5 };
  const store: CultureStoreData = { byId: { a: c }, lastEvolveTick: 0 };
  w.addComponent<CultureStoreData>(w.createEntity(), C_CULTURESTORE, store);
  return store;
}

// ── Famine ──────────────────────────────────────────────────────────────────────
describe('famine (M19)', () => {
  it('withers the flora and pulls cultures toward communal (the famine→thrift hook)', () => {
    const w = new World();
    const f = w.createEntity();
    w.addComponent<Flora>(f, C_FLORA, { speciesId: 'x', name: 'x', color: '#0f0', maturity: 1, growthPerTick: 0, edibleAt: 0.5, foodYield: 1, spreadChancePerTick: 0 });
    const store = cultureStore(w);
    EVENT_EFFECTS.famine(ctx(w));
    expect(w.getComponent<Flora>(f, C_FLORA)!.maturity).toBeCloseTo(0.4, 5);
    expect(store.byId.a.values.communal).toBeCloseTo(0.54, 5);   // thriftier in hardship
  });
});

// ── Plague ──────────────────────────────────────────────────────────────────────
describe('plague (M19)', () => {
  it('sickens about half the town, sparing the rest (bounded, deterministic)', () => {
    const w = new World();
    const folk: EntityId[] = [];
    for (let i = 0; i < 20; i++) folk.push(healthAgent(w, i, 0, 1));
    EVENT_EFFECTS.plague(ctx(w));
    const afflicted = folk.filter(e => w.getComponent<Health>(e, C_HEALTH)!.ill);
    expect(afflicted.length).toBeGreaterThan(0);
    expect(afflicted.length).toBeLessThan(folk.length);   // not everyone — a sweep, not a wipe
    for (const e of afflicted) expect(w.getComponent<Health>(e, C_HEALTH)!.value).toBeCloseTo(0.7, 5);
    for (const e of folk) expect(w.getComponent<Health>(e, C_HEALTH)!.value).toBeGreaterThanOrEqual(0);  // bounded
  });
});

// ── Earthquake ──────────────────────────────────────────────────────────────────
describe('earthquake (M19)', () => {
  it('hurts folk near the epicenter and topples the nearest home', () => {
    const w = new World();
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, openMap(3, 3));   // small → all within blast
    const victim = healthAgent(w, 1, 1, 1);
    const home = w.createEntity();
    w.addComponent<Position>(home, C_POSITION, { x: 0, y: 0 });
    w.addComponent<Home>(home, C_HOME, { owner: victim, builtTick: 0 });
    EVENT_EFFECTS.earthquake(ctx(w));
    expect(w.getComponent<Health>(victim, C_HEALTH)!.ill).toBe(true);
    expect(w.getComponent<Health>(victim, C_HEALTH)!.value).toBeCloseTo(0.7, 5);
    expect(w.hasComponent(home, C_HOME)).toBe(false);   // toppled to ruin
  });

  it('does nothing structural when there are no homes (just shakes)', () => {
    const w = new World();
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, openMap(3, 3));
    const e = healthAgent(w, 1, 1, 1);
    expect(() => EVENT_EFFECTS.earthquake(ctx(w))).not.toThrow();
    expect(w.getComponent<Health>(e, C_HEALTH)!.value).toBeLessThan(1);   // still hurt
  });
});

// ── Pipeline integration: disasters are legends with their own feed kind ──────────
function content(events: WorldEvent[]): Content {
  return { events: new Registry<WorldEvent>(events) } as unknown as Content;
}
describe('disaster pipeline (M19)', () => {
  it('a disaster reaches the Chronicle and emits the alarming feed kind', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
    const ch = createChronicle();
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, ch);
    cultureStore(w);
    for (let i = 0; i < 10; i++) { const f = w.createEntity(); w.addComponent<Flora>(f, C_FLORA, { speciesId: 'x', name: 'x', color: '#0f0', maturity: 1, growthPerTick: 0, edibleAt: 0.5, foodYield: 1, spreadChancePerTick: 0 }); }
    agent(w); agent(w);  // population for the floor

    const famine: WorldEvent = { id: 'famine', name: 'Famine', category: 'disaster', chancePerDay: 1, importance: 0.85, effect: 'famine', message: 'a famine struck', minPopulation: 0 };
    runEventSystem(w, cfg, createRNG(1), content([famine]));

    const log = w.getComponent<EventLogData>(w.query(C_EVENTLOG)[0], C_EVENTLOG)!;
    expect(log.entries.some(e => e.kind === 'disaster' && e.text === 'a famine struck')).toBe(true);
    expect(ch.entries.some(e => e.text === 'a famine struck')).toBe(true);   // a legend (0.85 ≥ threshold)
  });
});
