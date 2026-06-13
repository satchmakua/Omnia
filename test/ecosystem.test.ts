import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { createRNG } from '../src/sim/rng.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_FLORA, C_FAUNA, C_RESOURCE, C_POSITION, C_TILEMAP,
} from '../src/sim/components.ts';
import type { Flora, Fauna, Resource, Position } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { runFloraSystem }    from '../src/sim/systems/FloraSystem.ts';
import { runFaunaSystem }    from '../src/sim/systems/FaunaSystem.ts';
import { runResourceSystem } from '../src/sim/systems/ResourceSystem.ts';

const cfg = defaultConfig;

function openMap(w: number, h: number): TileMapData {
  return {
    width: w, height: h,
    biomeIndex: new Uint16Array(w * h),
    biomeIds: ['ground'], biomeNames: ['Ground'], colors: ['#333'], passableByBiome: [true],
  };
}

function addFlora(world: World, x: number, y: number, over: Partial<Flora> = {}) {
  const e = world.createEntity();
  world.addComponent<Position>(e, C_POSITION, { x, y });
  world.addComponent<Flora>(e, C_FLORA, {
    speciesId: 'ash_grass', name: 'Ash Grass', color: '#9fb86a',
    maturity: 0.5, growthPerTick: 0.01, edibleAt: 0.4, foodYield: 0.35, spreadChancePerTick: 0,
    ...over,
  });
  return e;
}

function addFauna(world: World, x: number, y: number, over: Partial<Fauna> = {}) {
  const e = world.createEntity();
  world.addComponent<Position>(e, C_POSITION, { x, y });
  world.addComponent<Fauna>(e, C_FAUNA, {
    speciesId: 'moth_grazer', name: 'Moth Grazer', color: '#d9c27a', size: 'small',
    hunger: 0.8, hungerDecayPerTick: 0.01, breedThreshold: 0.7, breedCooldownTicks: 0, ticksAlive: 0,
    ...over,
  });
  return e;
}

// ── FloraSystem ───────────────────────────────────────────────────────────────

describe('FloraSystem', () => {
  it('grows flora toward maturity, capped at 1', () => {
    const w = new World();
    const e = addFlora(w, 1, 1, { maturity: 0.5, growthPerTick: 0.1 });
    runFloraSystem(w, cfg, createRNG(1));
    expect(w.getComponent<Flora>(e, C_FLORA)!.maturity).toBeCloseTo(0.6);

    const e2 = addFlora(w, 2, 2, { maturity: 0.98, growthPerTick: 0.1 });
    runFloraSystem(w, cfg, createRNG(1));
    expect(w.getComponent<Flora>(e2, C_FLORA)!.maturity).toBe(1);
  });

  it('mature flora spreads to an adjacent empty passable tile', () => {
    const w = new World();
    const me = w.createEntity();
    w.addComponent<TileMapData>(me, C_TILEMAP, openMap(8, 8));
    addFlora(w, 4, 4, { maturity: 1, spreadChancePerTick: 1 }); // always spreads

    const before = w.query(C_FLORA).length;
    runFloraSystem(w, cfg, createRNG(3));
    expect(w.query(C_FLORA).length).toBe(before + 1);
  });

  it('never spreads beyond cfg.maxFlora', () => {
    const w = new World();
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, openMap(40, 40));
    for (let i = 0; i < 5; i++) addFlora(w, i, 0, { maturity: 1, spreadChancePerTick: 1 });

    const tiny = { ...cfg, maxFlora: 5 };
    for (let t = 0; t < 20; t++) runFloraSystem(w, tiny, createRNG(t + 1));
    expect(w.query(C_FLORA).length).toBeLessThanOrEqual(5);
  });
});

// ── FaunaSystem ───────────────────────────────────────────────────────────────

describe('FaunaSystem', () => {
  it('grazes ripe flora on its tile: flora resets, fauna feeds', () => {
    const w = new World();
    const fl = addFlora(w, 3, 3, { maturity: 1, foodYield: 0.4 });
    const fa = addFauna(w, 3, 3, { hunger: 0.3 });   // hungry → will graze
    runFaunaSystem(w, cfg, createRNG(1));
    expect(w.getComponent<Flora>(fl, C_FLORA)!.maturity).toBe(0);
    expect(w.getComponent<Fauna>(fa, C_FAUNA)!.hunger).toBeGreaterThan(0.3);
  });

  it('starves a fauna whose hunger bottoms out', () => {
    const w = new World();
    const fa = addFauna(w, 0, 0, { hunger: 0.005, hungerDecayPerTick: 0.01 });
    runFaunaSystem(w, cfg, createRNG(1));
    expect(w.isAlive(fa)).toBe(false);
  });

  it('a fed, off-cooldown fauna breeds (population grows)', () => {
    const w = new World();
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, openMap(8, 8));
    addFauna(w, 4, 4, { hunger: 1, breedCooldownTicks: 0 });
    const fast = { ...cfg, faunaBreedChancePerDay: cfg.ticksPerDay }; // breedChance = 1/tick

    runFaunaSystem(w, fast, createRNG(2));
    expect(w.query(C_FAUNA).length).toBe(2);
  });

  it('an overgrazed population with no food crashes to zero (detectable in metrics)', () => {
    const w = new World();
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, openMap(10, 10));
    // 25 fauna, no flora at all → they cannot feed.
    for (let i = 0; i < 25; i++) addFauna(w, i % 10, Math.floor(i / 10), { hunger: 0.2 });

    const peak = w.query(C_FAUNA).length;
    for (let t = 0; t < 300; t++) runFaunaSystem(w, cfg, createRNG(t + 1));
    const after = w.query(C_FAUNA).length;

    expect(peak).toBe(25);
    expect(after).toBe(0); // starved out — a population crash, visible by counting
  });
});

// ── ResourceSystem ────────────────────────────────────────────────────────────

describe('ResourceSystem', () => {
  function addResource(world: World, over: Partial<Resource>) {
    const e = world.createEntity();
    world.addComponent<Resource>(e, C_RESOURCE, {
      typeId: 'x', name: 'X', color: '#fff', amount: 0.5, renewable: true, regenPerTick: 0.1, ...over,
    });
    return e;
  }

  it('regrows renewable resources toward full', () => {
    const w = new World();
    const e = addResource(w, { amount: 0.5, renewable: true, regenPerTick: 0.1 });
    runResourceSystem(w);
    expect(w.getComponent<Resource>(e, C_RESOURCE)!.amount).toBeCloseTo(0.6);
  });

  it('does not regrow finite resources', () => {
    const w = new World();
    const e = addResource(w, { amount: 0.5, renewable: false, regenPerTick: 0.1 });
    runResourceSystem(w);
    expect(w.getComponent<Resource>(e, C_RESOURCE)!.amount).toBe(0.5);
  });

  it('caps renewable amount at 1', () => {
    const w = new World();
    const e = addResource(w, { amount: 0.95, renewable: true, regenPerTick: 0.1 });
    runResourceSystem(w);
    expect(w.getComponent<Resource>(e, C_RESOURCE)!.amount).toBe(1);
  });
});
