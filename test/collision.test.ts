import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { createRNG } from '../src/sim/rng.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_RELATIONSHIPS } from '../src/sim/components.ts';
import type { Agent, Needs, Position, Relationships } from '../src/sim/components.ts';
import {
  Occupancy, buildOccupancy, makeEnterable, stepToward, wanderStep,
} from '../src/sim/systems/movementUtil.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { runSocialSystem } from '../src/sim/systems/SocialSystem.ts';
import { testContent } from './helpers.ts';

const open = () => true; // everywhere enterable (no map)

describe('Occupancy', () => {
  it('tracks counts and frees a tile only when the last leaves', () => {
    const o = new Occupancy(64);
    o.add(3, 3); o.add(3, 3);
    expect(o.occupied(3, 3)).toBe(true);
    o.remove(3, 3);
    expect(o.occupied(3, 3)).toBe(true); // one still there
    o.remove(3, 3);
    expect(o.occupied(3, 3)).toBe(false);
  });

  it('move shifts occupancy from one tile to another', () => {
    const o = new Occupancy(64);
    o.add(1, 1); o.move(1, 1, 2, 1);
    expect(o.occupied(1, 1)).toBe(false);
    expect(o.occupied(2, 1)).toBe(true);
  });
});

describe('movement respects occupancy', () => {
  it('wanderStep never lands on an occupied tile', () => {
    const occ = new Occupancy(8);
    occ.add(1, 0); occ.add(0, 1); // block right and down
    const rng = createRNG(5);
    const pos: Position = { x: 0, y: 0 };
    for (let i = 0; i < 50; i++) {
      wanderStep(pos, rng, makeEnterable({ ...defaultConfig, gridWidth: 8, gridHeight: 8 }, undefined), occ);
      expect(occ.occupied(pos.x, pos.y) && (pos.x !== 0 || pos.y !== 0)).toBe(false);
    }
  });

  it('stepToward will not move onto a tile held by another creature', () => {
    const occ = new Occupancy(8);
    occ.add(0, 0); occ.add(1, 0); // mover at (0,0), neighbour blocks (1,0)
    const pos: Position = { x: 0, y: 0 };
    const en = makeEnterable({ ...defaultConfig, gridWidth: 8, gridHeight: 8 }, undefined);
    stepToward(pos, 1, 0, createRNG(1), en, occ);
    expect(pos.x === 1 && pos.y === 0).toBe(false); // never stepped onto the occupied tile
  });
});

describe('collision in the live MovementSystem', () => {
  it('two folk never end a tick sharing a tile', () => {
    const content = testContent();
    const cfg = { ...defaultConfig, gridWidth: 6, gridHeight: 6 };
    const w = new World();
    const rng = createRNG(3);
    for (let i = 0; i < 2; i++) {
      const e = w.createEntity();
      w.addComponent<Position>(e, C_POSITION, { x: i, y: 0 });
      w.addComponent<Needs>(e, C_NEEDS, { hunger: 0.9, energy: 0.9, social: 0.9 });
      w.addComponent<Agent>(e, C_AGENT, { name: `A${i}`, action: 'wander', ticksAlive: 0, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
    }
    for (let t = 0; t < 120; t++) {
      runMovementSystem(w, cfg, rng, content);
      const ps = w.query(C_AGENT, C_POSITION).map(e => w.getComponent<Position>(e, C_POSITION)!);
      expect(`${ps[0].x},${ps[0].y}`).not.toBe(`${ps[1].x},${ps[1].y}`);
    }
  });

  it('buildOccupancy records every mobile', () => {
    const w = new World();
    for (const [x, y] of [[2, 2], [3, 4]]) {
      const e = w.createEntity();
      w.addComponent<Position>(e, C_POSITION, { x, y });
      w.addComponent<Agent>(e, C_AGENT, { name: 'M', action: 'wander', ticksAlive: 0, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    }
    const occ = buildOccupancy(w, 64, [C_AGENT]);
    expect(occ.occupied(2, 2)).toBe(true);
    expect(occ.occupied(3, 4)).toBe(true);
    expect(occ.occupied(0, 0)).toBe(false);
  });
});

describe('social happens between adjacent folk (not only same tile)', () => {
  it('two neighbours warm to each other and the lonely need lifts', () => {
    const w = new World();
    const rng = createRNG(1);
    const a = w.createEntity(), b = w.createEntity();
    for (const [e, x] of [[a, 2], [b, 3]] as const) {
      w.addComponent<Agent>(e, C_AGENT, { name: `N${x}`, action: 'socialize', ticksAlive: 0, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
      w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 0.3 });
      w.addComponent<Position>(e, C_POSITION, { x, y: 2 }); // adjacent, different tiles
      w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
    }
    for (let t = 0; t < 5; t++) runSocialSystem(w, { ...defaultConfig }, rng);

    expect(w.getComponent<Needs>(a, C_NEEDS)!.social).toBeGreaterThan(0.3); // company met the need
    expect(w.getComponent<Relationships>(a, C_RELATIONSHIPS)!.edges[b].sentiment).toBeGreaterThan(0);
  });
});
