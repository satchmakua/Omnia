import { describe, it, expect } from 'vitest';
import { createRNG } from '../src/sim/rng.ts';
import { Registry } from '../src/content/registry.ts';
import type { Biome } from '../src/content/schema.ts';
import { generateTileMap } from '../src/world/worldgen.ts';
import {
  tileIdx, inBounds, isPassable, biomeIdAt, biomeNameAt, colorAt,
} from '../src/world/tilemap.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { World } from '../src/sim/ecs.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_POSITION, C_NEEDS, C_FOOD, C_TILEMAP,
} from '../src/sim/components.ts';
import type { Position, Needs, Agent, Food } from '../src/sim/components.ts';
import { testContent } from './helpers.ts';

const content = testContent();

function biomeReg(...biomes: Partial<Biome>[]): Registry<Biome> {
  const full = biomes.map((b, i): Biome => ({
    id: b.id ?? `b${i}`, name: b.name ?? `Biome ${i}`,
    climate: 'temperate', terrain: 'plains', color: b.color ?? '#445566',
    passable: b.passable ?? true, genWeight: b.genWeight ?? 1,
  }));
  return new Registry(full);
}

// ── World generation ──────────────────────────────────────────────────────────

describe('generateTileMap', () => {
  const reg = biomeReg(
    { id: 'grass', color: '#446644', passable: true, genWeight: 5 },
    { id: 'lake', color: '#224466', passable: false, genWeight: 2 },
  );

  it('is deterministic for a given seed', () => {
    const a = generateTileMap(createRNG(5), 32, 32, reg, 10);
    const b = generateTileMap(createRNG(5), 32, 32, reg, 10);
    expect(Array.from(a.biomeIndex)).toEqual(Array.from(b.biomeIndex));
  });

  it('differs across seeds', () => {
    const a = generateTileMap(createRNG(1), 32, 32, reg, 10);
    const b = generateTileMap(createRNG(2), 32, 32, reg, 10);
    expect(Array.from(a.biomeIndex)).not.toEqual(Array.from(b.biomeIndex));
  });

  it('fills every tile with a valid biome index', () => {
    const map = generateTileMap(createRNG(9), 40, 24, reg, 12);
    expect(map.biomeIndex.length).toBe(40 * 24);
    for (const idx of map.biomeIndex) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(map.biomeIds.length);
    }
  });

  it('produces at least some passable tiles', () => {
    const map = generateTileMap(createRNG(3), 32, 32, reg, 14);
    let passable = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        if (isPassable(map, x, y)) passable++;
    expect(passable).toBeGreaterThan(0);
  });

  it('indexes biomes by sorted id (deterministic mapping)', () => {
    const map = generateTileMap(createRNG(1), 8, 8, reg, 4);
    expect(map.biomeIds).toEqual(['grass', 'lake']); // sorted
  });

  it('throws when there are no biomes', () => {
    expect(() => generateTileMap(createRNG(1), 8, 8, new Registry<Biome>([]), 4))
      .toThrowError(/at least one biome/);
  });
});

// ── TileMap accessors ─────────────────────────────────────────────────────────

describe('tilemap helpers', () => {
  const map: TileMapData = {
    width: 3, height: 2,
    biomeIndex: new Uint16Array([0, 1, 0, 0, 0, 1]),
    biomeIds: ['land', 'water'],
    biomeNames: ['Land', 'Water'],
    colors: ['#aabbcc', '#001122'],
    passableByBiome: [true, false],
  };

  it('tileIdx maps (x,y) to row-major index', () => {
    expect(tileIdx(map, 0, 0)).toBe(0);
    expect(tileIdx(map, 2, 1)).toBe(5);
  });

  it('inBounds rejects out-of-range coords', () => {
    expect(inBounds(map, 0, 0)).toBe(true);
    expect(inBounds(map, -1, 0)).toBe(false);
    expect(inBounds(map, 3, 0)).toBe(false);
    expect(inBounds(map, 0, 2)).toBe(false);
  });

  it('isPassable reflects the biome and treats OOB as impassable', () => {
    expect(isPassable(map, 0, 0)).toBe(true);  // land
    expect(isPassable(map, 1, 0)).toBe(false); // water
    expect(isPassable(map, 99, 99)).toBe(false);
  });

  it('id/name/colour accessors resolve through the biome index', () => {
    expect(biomeIdAt(map, 1, 0)).toBe('water');
    expect(biomeNameAt(map, 1, 0)).toBe('Water');
    expect(colorAt(map, 0, 0)).toBe('#aabbcc');
  });
});

// ── Movement respects terrain ─────────────────────────────────────────────────

describe('movement and terrain', () => {
  // 5x5 map with an impassable column at x=2.
  function blockedMap(): TileMapData {
    const w = 5, h = 5;
    const biomeIndex = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) biomeIndex[y * w + 2] = 1;
    return {
      width: w, height: h, biomeIndex,
      biomeIds: ['ground', 'wall'], biomeNames: ['Ground', 'Wall'],
      colors: ['#333', '#000'], passableByBiome: [true, false],
    };
  }

  it('wandering agents never stand on an impassable tile', () => {
    const w = new World();
    const map = blockedMap();
    const me = w.createEntity();
    w.addComponent<TileMapData>(me, C_TILEMAP, map);

    const cfg = { ...defaultConfig, gridWidth: 5, gridHeight: 5 };
    const rng = createRNG(7);
    for (let i = 0; i < 8; i++) {
      const e = w.createEntity();
      w.addComponent<Position>(e, C_POSITION, { x: 0, y: i % 5 });
      w.addComponent<Needs>(e, C_NEEDS, { hunger: 0.9, energy: 0.9 });
      w.addComponent<Agent>(e, C_AGENT, { name: `A${i}`, action: 'wander', ticksAlive: 0 });
    }

    for (let t = 0; t < 300; t++) runMovementSystem(w, cfg, rng, content);

    for (const e of w.query(C_AGENT, C_POSITION)) {
      const p = w.getComponent<Position>(e, C_POSITION)!;
      expect(isPassable(map, p.x, p.y)).toBe(true);
    }
  });

  it('a food-seeker routes around a wall without standing on it', () => {
    const w = new World();
    const map = blockedMap();
    const me = w.createEntity();
    w.addComponent<TileMapData>(me, C_TILEMAP, map);

    const cfg = { ...defaultConfig, gridWidth: 5, gridHeight: 5 };
    const rng = createRNG(2);

    // Food at (4,0); agent at (0,0); wall column x=2 between them.
    const fe = w.createEntity();
    w.addComponent<Position>(fe, C_POSITION, { x: 4, y: 0 });
    w.addComponent<Food>(fe, C_FOOD, { amount: 1, regenPerTick: 0 });

    const ae = w.createEntity();
    w.addComponent<Position>(ae, C_POSITION, { x: 0, y: 0 });
    w.addComponent<Needs>(ae, C_NEEDS, { hunger: 0.2, energy: 0.9 });
    w.addComponent<Agent>(ae, C_AGENT, { name: 'Seeker', action: 'seek_food', ticksAlive: 0 });

    for (let t = 0; t < 60; t++) {
      const p = w.getComponent<Position>(ae, C_POSITION)!;
      expect(isPassable(map, p.x, p.y)).toBe(true); // never on the wall
      runMovementSystem(w, cfg, rng, content);
    }
  });
});

// ── Integration: createSimulation places everything on passable land ──────────

describe('createSimulation with terrain', () => {
  it('spawns the tilemap and keeps all agents + food on passable tiles', () => {
    const cfg = { ...defaultConfig, seed: 11 };
    const { world } = createSimulation(cfg, content);

    const map = world.getComponent<TileMapData>(world.query(C_TILEMAP)[0], C_TILEMAP)!;
    expect(map.width).toBe(cfg.gridWidth);

    for (const e of world.query(C_AGENT, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      expect(isPassable(map, p.x, p.y)).toBe(true);
    }
    for (const e of world.query(C_FOOD, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      expect(isPassable(map, p.x, p.y)).toBe(true);
    }
  });
});
