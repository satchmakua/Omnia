// Archaeology (M20 s2b): ruins rise for fallen clans & lost relics, and wandering folk
// discover them — entering them into the histories and rediscovering lost relics.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_POSITION, C_CLOCK, C_TILEMAP, C_RUIN, C_ORGSTORE, C_ARTIFACTS,
} from '../src/sim/components.ts';
import type { Agent, Clock, Ruin, ArtifactsData } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { createOrgStore, createOrg } from '../src/org/orgStore.ts';
import { createArtifacts, enshrineArtifact } from '../src/history/artifacts.ts';
import { runArchaeologySystem } from '../src/sim/systems/ArchaeologySystem.ts';

const cfg = defaultConfig;

function openMap(w: number, h: number): TileMapData {
  return { width: w, height: h, biomeIndex: new Uint16Array(w * h), biomeIds: ['ground'], biomeNames: ['Ground'], colors: ['#333'], passableByBiome: [true] };
}
function archWorld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, openMap(10, 10));
  return w;
}
function adult(w: World, x: number, y: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}
const ruins = (w: World): Ruin[] => w.query(C_RUIN).map(e => w.getComponent<Ruin>(e, C_RUIN)!);

describe('ArchaeologySystem — ruins rise (M20 s2b)', () => {
  it('a fallen clan leaves a ruin, once', () => {
    const w = archWorld();
    const store = createOrgStore();
    const id = createOrg(store, 'Drass clan', { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, 0.5, 0);
    store.byId[id].extinct = true;
    w.addComponent(w.createEntity(), C_ORGSTORE, store);
    runArchaeologySystem(w, cfg);
    expect(ruins(w).some(r => /ruins of the Drass clan/.test(r.what))).toBe(true);
    expect(store.byId[id].ruined).toBe(true);
    runArchaeologySystem(w, cfg);                 // not placed twice
    expect(w.query(C_RUIN).length).toBe(1);
  });

  it('a lost relic leaves a cairn', () => {
    const w = archWorld();
    const arts: ArtifactsData = createArtifacts();
    enshrineArtifact(arts, { id: 'a1', name: 'Robtu', kind: 'weapon', power: 3, bearer: null, forgedBy: 'X', forgedTick: 0, deeds: 'a blade', lost: true, lostTick: 10 });
    w.addComponent<ArtifactsData>(w.createEntity(), C_ARTIFACTS, arts);
    runArchaeologySystem(w, cfg);
    expect(ruins(w).some(r => r.relicName === 'Robtu')).toBe(true);
    expect(arts.artifacts[0].ruined).toBe(true);
  });
});

describe('ArchaeologySystem — discovery (M20 s2b)', () => {
  it('a folk near a buried site uncovers it; a cairn yields its rediscovered relic', () => {
    const w = archWorld();
    const arts: ArtifactsData = createArtifacts();
    enshrineArtifact(arts, { id: 'a1', name: 'Robtu', kind: 'weapon', power: 3, bearer: null, forgedBy: 'X', forgedTick: 0, deeds: 'a blade', lost: true, lostTick: 10, ruined: true });
    w.addComponent<ArtifactsData>(w.createEntity(), C_ARTIFACTS, arts);
    // a buried cairn, with a folk standing beside it
    const re = w.createEntity();
    w.addComponent<Ruin>(re, C_RUIN, { what: 'a cairn where Robtu was lost', discovered: false, sinceTick: 0, relicName: 'Robtu' });
    w.addComponent(re, C_POSITION, { x: 5, y: 5 });
    adult(w, 6, 5);

    runArchaeologySystem(w, cfg);
    expect(w.getComponent<Ruin>(re, C_RUIN)!.discovered).toBe(true);
    expect(arts.artifacts[0].lost).toBe(false);                  // rediscovered
    expect(arts.artifacts[0].rediscoveredTick).toBe(cfg.ticksPerDay);
  });

  it('an unattended site stays buried', () => {
    const w = archWorld();
    const re = w.createEntity();
    w.addComponent<Ruin>(re, C_RUIN, { what: 'the ruins of the Old clan', discovered: false, sinceTick: 0 });
    w.addComponent(re, C_POSITION, { x: 1, y: 1 });
    adult(w, 9, 9);   // far away
    runArchaeologySystem(w, cfg);
    expect(w.getComponent<Ruin>(re, C_RUIN)!.discovered).toBe(false);
  });
});
