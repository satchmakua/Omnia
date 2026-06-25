// Mood & comfort (M11 slice 2): an agent's mood drifts toward a target set by their lot —
// a home and family lift it; debt, homelessness, illness lower it — and mood warms (or
// chills) friendship. Folk also head to their own bed to sleep, which rests them faster.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_HEALTH, C_LINEAGE, C_POSITION, C_HOME, C_CLOCK, C_RELATIONSHIPS, C_TILEMAP,
} from '../src/sim/components.ts';
import type {
  Agent, Needs, Wallet, Health, Lineage, Position, Clock, Relationships, Sex,
} from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { runMoodSystem, moodWarmth, MOOD_BASELINE } from '../src/sim/systems/MoodSystem.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { runSocialSystem } from '../src/sim/systems/SocialSystem.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const moodOf = (w: World, e: EntityId) => w.getComponent<Agent>(e, C_AGENT)!.mood!;

function worldAtDay(tick = cfg.ticksPerDay): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  return w;
}

function person(w: World, opts: { ageYears?: number; debt?: number; ill?: boolean } = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: 'A', action: 'wander', ticksAlive: Math.floor((opts.ageYears ?? 30) * ticksPerYear(cfg)),
    wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, mood: MOOD_BASELINE,
  });
  w.addComponent<Wallet>(e, C_WALLET, { gold: 10, debt: opts.debt ?? 0 });
  w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: opts.ill ?? false });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
  return e;
}

function giveHome(w: World, owner: EntityId): void {
  const h = w.createEntity();
  w.addComponent<Position>(h, C_POSITION, { x: 0, y: 0 });
  w.addComponent(h, C_HOME, { owner, builtTick: 0 });
}

describe('MoodSystem — circumstance sets the mood target (M11 s2)', () => {
  it('a homed adult with family drifts UP from baseline', () => {
    const w = worldAtDay();
    const a = person(w);
    const partner = person(w);
    w.getComponent<Lineage>(a, C_LINEAGE)!.partner = partner;   // living partner → family bonus
    giveHome(w, a);
    runMoodSystem(w, cfg);
    expect(moodOf(w, a)).toBeGreaterThan(MOOD_BASELINE);
  });

  it('a homeless, indebted, ill adult drifts DOWN from baseline', () => {
    const w = worldAtDay();
    const a = person(w, { debt: 20, ill: true });   // no home, in debt, sick
    runMoodSystem(w, cfg);
    expect(moodOf(w, a)).toBeLessThan(MOOD_BASELINE);
  });

  it('children are not penalised for homelessness (dependents)', () => {
    const w = worldAtDay();
    const kid = person(w, { ageYears: 8 });          // homeless but a child
    const adult = person(w, { ageYears: 30 });       // homeless adult
    runMoodSystem(w, cfg);
    expect(moodOf(w, kid)).toBeGreaterThan(moodOf(w, adult));
    expect(moodOf(w, kid)).toBe(MOOD_BASELINE);       // base, no penalties
  });

  it('mood stays bounded in [0,1] over many days at an extreme', () => {
    const w = worldAtDay(0);
    const a = person(w, { debt: 40, ill: true });
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= 60; d++) { clock.tick = d * cfg.ticksPerDay; runMoodSystem(w, cfg); }
    expect(moodOf(w, a)).toBeGreaterThanOrEqual(0);
    expect(moodOf(w, a)).toBeLessThan(MOOD_BASELINE);
  });

  it('only updates on a day boundary', () => {
    const w = worldAtDay(cfg.ticksPerDay + 1);        // not a boundary
    const a = person(w, { debt: 20, ill: true });
    runMoodSystem(w, cfg);
    expect(moodOf(w, a)).toBe(MOOD_BASELINE);          // unchanged
  });
});

describe('moodWarmth — friendship multiplier from mood', () => {
  it('is ~1 at baseline, higher when content, lower when low', () => {
    expect(moodWarmth(0.6, 0.6)).toBeCloseTo(1.0, 6);
    expect(moodWarmth(1, 1)).toBeGreaterThan(1);
    expect(moodWarmth(0.2, 0.2)).toBeLessThan(1);
  });
});

describe('mood → friendship warmth (D26)', () => {
  function addAgent(w: World, x: number, mood: number, sex: Sex = 'female'): EntityId {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, {
      name: `A${x}`, action: 'wander', ticksAlive: 30 * ticksPerYear(cfg),
      wealthGoal: 50, sex, lifespanTicks: 1e9, mood,
    });
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 0.5 });
    w.addComponent<Position>(e, C_POSITION, { x, y: 5 });
    w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
    w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
    return e;
  }

  it('a content pair warms faster than a low-mood pair', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
    const h1 = addAgent(w, 5, 0.95), h2 = addAgent(w, 6, 0.95);   // content, adjacent
    const l1 = addAgent(w, 20, 0.2), l2 = addAgent(w, 21, 0.2);   // low mood, adjacent
    const rng = createRNG(1);
    for (let i = 0; i < 12; i++) runSocialSystem(w, { ...cfg, marryChancePerDay: 0 }, rng);
    const sent = (p: EntityId, q: EntityId) => w.getComponent<Relationships>(p, C_RELATIONSHIPS)!.edges[q]?.sentiment ?? 0;
    expect(sent(h1, h2)).toBeGreaterThan(sent(l1, l2));
  });
});

describe('sleep at home (M11 s2)', () => {
  function passableMap(): TileMapData {
    return {
      width: cfg.gridWidth, height: cfg.gridHeight, biomeIndex: new Uint16Array(cfg.gridWidth * cfg.gridHeight),
      biomeIds: ['plain'], biomeNames: ['Plain'], colors: ['#000000'], passableByBiome: [true],
    };
  }
  function sleeper(w: World, x: number, y: number): EntityId {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'S', action: 'sleep', ticksAlive: 30 * ticksPerYear(cfg), wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, mood: MOOD_BASELINE });
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 0.5, social: 1 });
    w.addComponent<Position>(e, C_POSITION, { x, y });
    return e;
  }
  const content = testContent();

  it('a sleeper with a home steps toward it', () => {
    const w = new World();
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, passableMap());
    const a = sleeper(w, 5, 5);
    const h = w.createEntity();
    w.addComponent<Position>(h, C_POSITION, { x: 12, y: 5 });
    w.addComponent(h, C_HOME, { owner: a, builtTick: 0 });
    runMovementSystem(w, cfg, createRNG(1), content);
    expect(w.getComponent<Position>(a, C_POSITION)!.x).toBeGreaterThan(5);   // moved toward home
  });

  it('resting in one’s own home restores energy faster than rough sleeping', () => {
    const atHome = (() => {
      const w = new World();
      w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, passableMap());
      const a = sleeper(w, 5, 5);
      const h = w.createEntity(); w.addComponent<Position>(h, C_POSITION, { x: 5, y: 5 });
      w.addComponent(h, C_HOME, { owner: a, builtTick: 0 });
      runMovementSystem(w, cfg, createRNG(1), content);
      return w.getComponent<Needs>(a, C_NEEDS)!.energy;
    })();
    const homeless = (() => {
      const w = new World();
      w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, passableMap());
      const a = sleeper(w, 5, 5);
      runMovementSystem(w, cfg, createRNG(1), content);
      return w.getComponent<Needs>(a, C_NEEDS)!.energy;
    })();
    expect(atHome).toBeGreaterThan(homeless);
  });
});
