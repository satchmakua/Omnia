// Boats (M24 slice 3): the Seafaring tech grants a tribe boats, so its folk treat water as
// crossable. A seafaring folk paths across a water channel a land-bound folk cannot.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_QUEST, C_TILEMAP, C_ORGSTORE,
} from '../src/sim/components.ts';
import type { Agent, Needs, Position, Quest } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { makeEnterable } from '../src/sim/systems/movementUtil.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { createOrgStore, createOrg } from '../src/org/orgStore.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

// A 9×5 map split by a one-tile water channel at x = 4 (land either side).
function channelMap(): TileMapData {
  const W = 9, H = 5;
  const biomeIndex = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) biomeIndex[y * W + x] = x === 4 ? 1 : 0;
  return { width: W, height: H, biomeIndex, biomeIds: ['g', 's'], biomeNames: ['G', 'S'], colors: ['#333', '#258'], passableByBiome: [true, false] };
}

describe('Seafaring tech + the water-allowing enterable (M24)', () => {
  it('ships a seafaring tech whose effect unlocks boats', () => {
    const t = content.tech.require('seafaring');
    expect(t.effects).toContain('seafaring');
    expect(content.tech.get(t.prerequisites[0])!.tier).toBeLessThan(t.tier);   // prereq is earlier
  });

  it('makeEnterable only crosses water when allowWater is set', () => {
    const map = channelMap();
    const land = makeEnterable({ ...cfg, gridWidth: 9, gridHeight: 5 }, map);
    const sea = makeEnterable({ ...cfg, gridWidth: 9, gridHeight: 5 }, map, true);
    expect(land(4, 2)).toBe(false);   // the water channel
    expect(sea(4, 2)).toBe(true);     // a boat crosses it
    expect(land(1, 2)).toBe(true);    // both walk on land
    expect(sea(1, 2)).toBe(true);
  });
});

describe('MovementSystem — boats cross water (M24)', () => {
  // A folk on the left shore (1,2) with an explore-quest target on the right shore (7,2);
  // the only route is across the water channel at x = 4.
  function shoreWorld(seafaring: boolean): { w: World; e: EntityId } {
    const w = new World();
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, channelMap());
    const store = createOrgStore();
    const org = createOrg(store, 'Testers', { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, 0.5, 0);
    if (seafaring) store.byId[org].effects = { seafaring: 1 };
    w.addComponent(w.createEntity(), C_ORGSTORE, store);
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'Sailor', action: 'wander', ticksAlive: 1e6, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: org });
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 0.9, energy: 0.9, social: 0.9 });
    w.addComponent<Position>(e, C_POSITION, { x: 1, y: 2 });
    w.addComponent<Quest>(e, C_QUEST, { kind: 'explore', text: 'seek the far shore', sinceTick: 0, tx: 7, ty: 2 });
    return { w, e };
  }
  const cfg9 = { ...cfg, gridWidth: 9, gridHeight: 5 };

  it('a seafaring folk crosses the channel to the far shore', () => {
    const { w, e } = shoreWorld(true);
    const rng = createRNG(1);
    for (let t = 0; t < 60; t++) runMovementSystem(w, cfg9, rng, content);
    expect(w.getComponent<Position>(e, C_POSITION)!.x).toBeGreaterThanOrEqual(5);   // reached the far side
  });

  it('a land-bound folk never crosses the water', () => {
    const { w, e } = shoreWorld(false);
    const rng = createRNG(1);
    for (let t = 0; t < 60; t++) runMovementSystem(w, cfg9, rng, content);
    expect(w.getComponent<Position>(e, C_POSITION)!.x).toBeLessThanOrEqual(3);   // stuck on the near shore
  });
});
