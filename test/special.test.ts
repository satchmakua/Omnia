// Special agents (M21): content-driven monsters & uncanny visitors that roam the map, menace or
// unsettle the folk, are slain or fade back into the wilds. They are NOT folk (Position + Health +
// Special only). These tests pin spawn/cap/despawn, predator pursuit + the mob slaying it (a kill
// credited to the killer), a predator felling an isolated soul, and a haunt unsettling the folk.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_CLOCK, C_SPECIAL, C_POSITION, C_HEALTH, C_BODY, C_COMBAT, C_MEMORY, C_TILEMAP, C_TOMBSTONE,
} from '../src/sim/components.ts';
import type { Agent, Clock, Special, Position, Health, Body, Combat, Memory } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { isWater } from '../src/world/tilemap.ts';
import type { Content } from '../src/content/loader.ts';
import { Registry } from '../src/content/registry.ts';
import type { Monster } from '../src/content/schema.ts';
import { runSpecialAgentSystem } from '../src/sim/systems/SpecialAgentSystem.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;

// A bare flat map so monsters can roam anywhere.
function flatMap(): TileMapData {
  return { width: cfg.gridWidth, height: cfg.gridHeight, biomeIndex: new Uint16Array(cfg.gridWidth * cfg.gridHeight), biomeIds: ['ground'], biomeNames: ['Ground'], colors: ['#333'], passableByBiome: [true] };
}

function baseWorld(tick: number): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, flatMap());
  return w;
}

// Content whose monster registry is exactly the given list (everything else from real content).
function contentWith(monsters: Monster[]): Content {
  return { ...testContent(), monsters: new Registry(monsters) };
}
function monster(over: Partial<Monster> = {}): Monster {
  return { id: 'fiend', name: 'a fiend', icon: 'monster', behavior: 'predator', aquatic: false, str: 13, dex: 10, con: 13, ferocity: 1.3, spawnChancePerDay: 1, despawnDays: 10, ...over };
}

function folk(w: World, x: number, y: number, over: Partial<Body> = {}, health = 1): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `F${e}`, action: 'wander', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Body>(e, C_BODY, { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, heightCm: 175, build: 0.5, eye: 0.5, hair: 0.5, ...over });
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Health>(e, C_HEALTH, { value: health, ill: false });
  return e;
}

function spawnSpecial(w: World, x: number, y: number, over: Partial<Special> = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
  w.addComponent<Special>(e, C_SPECIAL, {
    kind: 'fiend', name: 'a fiend', icon: 'monster', behavior: 'predator',
    str: 13, dex: 10, con: 13, ferocity: 1.3, spawnTick: 0, despawnTick: 1e9, ...over,
  });
  return e;
}
const specialsOf = (w: World) => w.query(C_SPECIAL, C_POSITION);

describe('SpecialAgentSystem — spawn & despawn (M21)', () => {
  it('a monster drifts in from the wilds on a daily tick', () => {
    const w = baseWorld(cfg.ticksPerDay);
    runSpecialAgentSystem(w, cfg, createRNG(1), contentWith([monster()]));
    const ss = specialsOf(w);
    expect(ss.length).toBe(1);
    const p = w.getComponent<Position>(ss[0], C_POSITION)!;
    const onEdge = p.x === 0 || p.y === 0 || p.x === cfg.gridWidth - 1 || p.y === cfg.gridHeight - 1;
    expect(onEdge).toBe(true);   // it comes in from the border
  });

  it('spawns at most one a day, and never beyond the concurrent cap', () => {
    const w = baseWorld(cfg.ticksPerDay);
    spawnSpecial(w, 0, 0); spawnSpecial(w, 0, 1); spawnSpecial(w, 0, 2);   // already at the cap (3)
    runSpecialAgentSystem(w, cfg, createRNG(1), contentWith([monster()]));
    expect(specialsOf(w).length).toBe(3);   // no fourth
  });

  it('a monster fades back into the wilds once its time is up', () => {
    const w = baseWorld(500);
    spawnSpecial(w, 10, 10, { despawnTick: 400 });   // already past its hour
    runSpecialAgentSystem(w, cfg, createRNG(1), contentWith([]));
    expect(specialsOf(w).length).toBe(0);
  });
});

describe('SpecialAgentSystem — predator (M21)', () => {
  it('a predator paths toward the nearest folk', () => {
    const w = baseWorld(7);   // not a spawn tick
    folk(w, 20, 20);
    const m = spawnSpecial(w, 4, 4);
    const dist = () => { const p = w.getComponent<Position>(m, C_POSITION)!; return Math.abs(p.x - 20) + Math.abs(p.y - 20); };
    const before = dist();
    const rng = createRNG(2);
    for (let t = 0; t < 5; t++) runSpecialAgentSystem(w, cfg, rng, contentWith([]));
    expect(dist()).toBeLessThan(before);   // closing on its prey
  });

  it('a mob of folk brings a wounded monster down — the killer earns the kill', () => {
    const w = baseWorld(7);
    // Four sturdy, capable folk surround the beast; the beast is already near death.
    const fighters = [folk(w, 5, 4, { str: 16, dex: 14, con: 14 }), folk(w, 5, 6, { str: 16, dex: 14, con: 14 }),
      folk(w, 4, 5, { str: 16, dex: 14, con: 14 }), folk(w, 6, 5, { str: 16, dex: 14, con: 14 })];
    spawnSpecial(w, 5, 5, { con: 8, despawnTick: 1e9 });
    w.getComponent<Health>(specialsOf(w)[0], C_HEALTH)!.value = 0.04;
    let slain = false;
    const rng = createRNG(3);
    for (let t = 0; t < 60 && !slain; t++) {
      runSpecialAgentSystem(w, cfg, rng, contentWith([]));
      slain = specialsOf(w).length === 0;
    }
    expect(slain).toBe(true);
    const totalKills = fighters.reduce((n, e) => n + (w.getComponent<Combat>(e, C_COMBAT)?.kills ?? 0), 0);
    expect(totalKills).toBeGreaterThanOrEqual(1);   // the killing blow was credited
  });

  it('a lone, frail soul can be slain by a fierce predator', () => {
    const w = baseWorld(7);
    const victim = folk(w, 5, 6, { str: 8, dex: 8, con: 8 }, 0.25);
    spawnSpecial(w, 5, 5, { str: 17, dex: 14, con: 16, ferocity: 1.5, despawnTick: 1e9 });
    let dead = false;
    const rng = createRNG(4);
    for (let t = 0; t < 300 && !dead; t++) {
      runSpecialAgentSystem(w, cfg, rng, contentWith([]));
      dead = w.hasComponent(victim, C_TOMBSTONE) || !w.hasComponent(victim, C_AGENT);
    }
    expect(dead).toBe(true);
  });
});

describe('SpecialAgentSystem — haunt (M21)', () => {
  it('a haunt unsettles nearby folk — a mood dip + an eerie memory, once a day', () => {
    const w = baseWorld(7);
    const e = folk(w, 5, 6);
    w.getComponent<Agent>(e, C_AGENT)!.mood = 0.8;
    w.addComponent<Memory>(e, C_MEMORY, { events: [], summaries: [], beliefs: [], lastReflectTick: 0, lastRollupTick: 0, utterances: [], lastSpokeTick: 0, lastDreamTick: 0 });
    spawnSpecial(w, 5, 5, { behavior: 'haunt', name: 'a ghost', icon: 'ghost' });

    runSpecialAgentSystem(w, cfg, createRNG(5), contentWith([]));
    const moodAfterFirst = w.getComponent<Agent>(e, C_AGENT)!.mood!;
    expect(moodAfterFirst).toBeLessThan(0.8);
    expect(w.getComponent<Memory>(e, C_MEMORY)!.events.length).toBe(1);

    // Same day → throttled (no further dip).
    runSpecialAgentSystem(w, cfg, createRNG(5), contentWith([]));
    expect(w.getComponent<Agent>(e, C_AGENT)!.mood!).toBe(moodAfterFirst);
  });

  it('a haunt draws no blood — nearby folk keep their health', () => {
    const w = baseWorld(7);
    const e = folk(w, 5, 6);
    spawnSpecial(w, 5, 5, { behavior: 'haunt', name: 'a ghost', icon: 'ghost' });
    const rng = createRNG(6);
    for (let t = 0; t < 30; t++) runSpecialAgentSystem(w, cfg, rng, contentWith([]));
    expect(w.getComponent<Health>(e, C_HEALTH)!.value).toBe(1);
  });
});

// A coastal map: the left half is land, the right half (x ≥ HALF) is water.
const HALF = Math.floor(cfg.gridWidth / 2);
function pondWorld(tick: number): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  const W = cfg.gridWidth, H = cfg.gridHeight;
  const biomeIndex = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) biomeIndex[y * W + x] = x >= HALF ? 1 : 0;
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, {
    width: W, height: H, biomeIndex, biomeIds: ['g', 's'], biomeNames: ['G', 'S'], colors: ['#333', '#258'], passableByBiome: [true, false],
  });
  return w;
}
const krakenMon = (over: Partial<Monster> = {}): Monster =>
  monster({ id: 'kraken', name: 'a kraken', icon: 'kraken', aquatic: true, spawnChancePerDay: 1, ...over });

describe('SpecialAgentSystem — sea beasts (M24)', () => {
  it('an aquatic monster rises in the water (not on land)', () => {
    const w = pondWorld(cfg.ticksPerDay);
    runSpecialAgentSystem(w, cfg, createRNG(1), contentWith([krakenMon()]));
    const ss = specialsOf(w);
    expect(ss.length).toBe(1);
    const p = w.getComponent<Position>(ss[0], C_POSITION)!;
    const map = w.getComponent<TileMapData>(w.query(C_TILEMAP)[0], C_TILEMAP)!;
    expect(isWater(map, p.x, p.y)).toBe(true);   // it spawned in the sea
  });

  it('a sea beast never crawls onto land', () => {
    const w = pondWorld(7);
    folk(w, HALF - 1, 10);   // a coastal soul to lure it shoreward
    const k = spawnSpecial(w, HALF + 2, 10, { aquatic: true, name: 'a kraken', icon: 'kraken' });
    const map = w.getComponent<TileMapData>(w.query(C_TILEMAP)[0], C_TILEMAP)!;
    const rng = createRNG(2);
    for (let t = 0; t < 200; t++) {
      runSpecialAgentSystem(w, cfg, rng, contentWith([]));
      if (!w.hasComponent(k, C_SPECIAL)) break;   // (it may be slain; that's fine)
      const p = w.getComponent<Position>(k, C_POSITION)!;
      expect(isWater(map, p.x, p.y), `kraken on land at (${p.x},${p.y})`).toBe(true);
    }
  });

  it('a sea beast menaces the coast — a frail soul at the water’s edge can be taken', () => {
    const w = pondWorld(7);
    const victim = folk(w, HALF - 1, 10, { str: 8, dex: 8, con: 8 }, 0.25);   // frail, on the shore
    spawnSpecial(w, HALF, 10, { aquatic: true, name: 'a kraken', icon: 'kraken', str: 18, dex: 12, con: 17, ferocity: 1.5 });
    let dead = false;
    const rng = createRNG(3);
    for (let t = 0; t < 300 && !dead; t++) {
      runSpecialAgentSystem(w, cfg, rng, contentWith([]));
      dead = !w.hasComponent(victim, C_AGENT);
    }
    expect(dead).toBe(true);   // the deep took them
  });
});
