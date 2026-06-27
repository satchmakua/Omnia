// Functional civic buildings (M21): some civic buildings now act on the folk nearby — an
// infirmary heals the sick within reach, a tavern lifts spirits, a watch-house suppresses crime.
// These tests pin the content, the heal/cheer effects (and their radius falloff), and the
// watch-house ward factor the CrimeSystem reads.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { createSimulation } from '../src/sim/world.ts';
import {
  C_CIVIC, C_AGENT, C_POSITION, C_NEEDS, C_HEALTH, C_CLOCK,
} from '../src/sim/components.ts';
import type { Civic, Agent, Needs, Health, Clock, Position } from '../src/sim/components.ts';
import { runCivicSystem, wardFactor } from '../src/sim/systems/CivicSystem.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

function world(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  return w;
}
function building(w: World, x: number, y: number, c: Civic): void {
  const e = w.createEntity();
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Civic>(e, C_CIVIC, c);
}
function folk(w: World, x: number, y: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Agent>(e, C_AGENT, { name: `F${e}`, action: 'wander', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood: 0.5 });
  w.addComponent<Needs>(e, C_NEEDS, { hunger: 0.9, energy: 0.9, social: 0.4 });
  w.addComponent<Health>(e, C_HEALTH, { value: 0.5, ill: true });
  return e;
}

describe('civic building content (M21)', () => {
  it('ships the landmarks + the three functional buildings', () => {
    const ids = content.buildings.all().map(b => b.id);
    for (const id of ['town_hall', 'town_well', 'old_shrine', 'infirmary', 'tavern', 'watch_house']) {
      expect(ids).toContain(id);
    }
    expect(content.buildings.require('infirmary').effect).toBe('heal');
    expect(content.buildings.require('tavern').effect).toBe('cheer');
    expect(content.buildings.require('watch_house').effect).toBe('ward');
  });

  it('a real town raises the functional buildings as civic entities', () => {
    const { world: w } = createSimulation({ ...cfg, seed: 11 }, content);
    const effects = w.query(C_CIVIC).map(e => w.getComponent<Civic>(e, C_CIVIC)!.effect).filter(Boolean);
    expect(effects).toContain('heal');
    expect(effects).toContain('cheer');
    expect(effects).toContain('ward');
  });
});

describe('CivicSystem — heal (infirmary, M21)', () => {
  it('the sick near an infirmary mend (and recover once healthy); the distant do not', () => {
    const w = world();
    building(w, 10, 10, { kind: 'infirmary', name: 'Infirmary', effect: 'heal', radius: 5, magnitude: 0.18 });
    const near = folk(w, 12, 11);   // within 5
    const far = folk(w, 30, 30);    // out of reach
    runCivicSystem(w, cfg);
    const hn = w.getComponent<Health>(near, C_HEALTH)!;
    expect(hn.value).toBeGreaterThan(0.5);   // tended
    expect(hn.ill).toBe(false);              // 0.5 + 0.18 = 0.68 ≥ 0.6 → recovered
    const hf = w.getComponent<Health>(far, C_HEALTH)!;
    expect(hf.value).toBe(0.5);              // untouched
    expect(hf.ill).toBe(true);
  });
});

describe('CivicSystem — cheer (tavern, M21)', () => {
  it('folk near a tavern gain social need + mood; the distant do not', () => {
    const w = world();
    building(w, 10, 10, { kind: 'tavern', name: 'The Tavern', effect: 'cheer', radius: 5, magnitude: 0.2 });
    const near = folk(w, 8, 9);
    const far = folk(w, 40, 40);
    runCivicSystem(w, cfg);
    expect(w.getComponent<Needs>(near, C_NEEDS)!.social).toBeCloseTo(0.6, 5);
    expect(w.getComponent<Agent>(near, C_AGENT)!.mood).toBeCloseTo(0.6, 5);   // 0.5 + 0.2*0.5
    expect(w.getComponent<Needs>(far, C_NEEDS)!.social).toBe(0.4);
  });

  it('only acts once a day (not on a non-daily tick)', () => {
    const w = world();
    w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!.tick = cfg.ticksPerDay + 1;   // mid-day
    building(w, 10, 10, { kind: 'tavern', name: 'The Tavern', effect: 'cheer', radius: 5, magnitude: 0.2 });
    const near = folk(w, 10, 11);
    runCivicSystem(w, cfg);
    expect(w.getComponent<Needs>(near, C_NEEDS)!.social).toBe(0.4);   // untouched off-schedule
  });
});

describe('CivicSystem — ward (watch-house, M21)', () => {
  it('crime chance is cut under the watch, unaffected beyond its reach', () => {
    const w = world();
    building(w, 20, 20, { kind: 'watch', name: 'Watch-house', effect: 'ward', radius: 7, magnitude: 0.6 });
    expect(wardFactor(w, 22, 23)).toBeCloseTo(0.4, 5);   // within 7 → 1 - 0.6
    expect(wardFactor(w, 0, 0)).toBe(1);                 // far off → no effect
  });

  it('a plain landmark wards nothing', () => {
    const w = world();
    building(w, 5, 5, { kind: 'hall', name: 'Town Hall' });   // no effect
    expect(wardFactor(w, 5, 6)).toBe(1);
  });
});
