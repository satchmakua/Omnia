// Wonders (M20 s3b): the town raises tech-gated mega-projects over time, completing as a
// WonderSite landmark + a monumental legend. The content loads; the WonderSystem begins/builds/
// finishes one at a time.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_WONDERS, C_WONDERSITE, C_TILEMAP, C_ORGSTORE, C_CHRONICLE } from '../src/sim/components.ts';
import type { Agent, Clock, WondersData, WonderSite } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { createWonders, runWonderSystem } from '../src/sim/systems/WonderSystem.ts';
import { createChronicle } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { createOrgStore, createOrg } from '../src/org/orgStore.ts';
import { loadContentFromDisk } from '../src/content/fsSource.ts';
import type { Content } from '../src/content/loader.ts';

const cfg = defaultConfig;
const content = loadContentFromDisk('./content');

describe('wonders content (M20 s3b)', () => {
  it('ships the tech-ladder of wonders, ending in the space elevator', () => {
    const ids = content.wonders.all().map(w => w.id);
    expect(ids).toContain('great_spire');
    expect(ids).toContain('sky_elevator');
    expect(content.wonders.get('sky_elevator')!.minTier).toBe(7);   // the sci-fi capstone
  });
});

function wonderWorld(): { w: World; data: WondersData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  const map: TileMapData = { width: 8, height: 8, biomeIndex: new Uint16Array(64), biomeIds: ['g'], biomeNames: ['G'], colors: ['#333'], passableByBiome: [true] };
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, map);
  const data = createWonders();
  w.addComponent<WondersData>(w.createEntity(), C_WONDERS, data);
  return { w, data };
}
function townAt(w: World, tier: number, pop: number): void {
  const store = createOrgStore();
  const id = createOrg(store, 'Clan', { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, 0.5, 0);
  store.byId[id].tier = tier;
  w.addComponent(w.createEntity(), C_ORGSTORE, store);
  const ids: EntityId[] = [];
  for (let i = 0; i < pop; i++) {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: id });
    ids.push(e);
  }
}

describe('WonderSystem (M20 s3b)', () => {
  it('a town below the tech gate builds nothing', () => {
    const { w, data } = wonderWorld();
    townAt(w, 2, 60);                  // tier 2 — below even the Great Spire (tier 4)
    runWonderSystem(w, cfg, content);
    expect(data.current).toBeUndefined();
  });

  it('begins the lowest eligible wonder, builds it daily, and completes it as a landmark', () => {
    const { w, data } = wonderWorld();
    townAt(w, 4, 100);                 // tier 4 unlocks the Great Spire
    runWonderSystem(w, cfg, content);
    expect(data.current).toBe('great_spire');
    expect(data.progress.great_spire).toBe(100);   // one day's workforce

    // pour effort until it completes (cost 2600, +100/day)
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 2; d <= 30; d++) { clock.tick = d * cfg.ticksPerDay; runWonderSystem(w, cfg, content); }
    expect(data.built.great_spire).toBeGreaterThan(0);   // completed
    expect(data.current).toBeUndefined();               // and freed for the next
    const sites = w.query(C_WONDERSITE).map(e => w.getComponent<WonderSite>(e, C_WONDERSITE)!);
    expect(sites.some(s => s.wonderId === 'great_spire')).toBe(true);   // a landmark rose
  });

  it('a completed wonder is raised in memory of a real Chronicle event (M33 s2, S140)', () => {
    const { w, data } = wonderWorld();
    townAt(w, 4, 100);
    // A loud legend in the town's past for the wonder to commemorate.
    const ch = createChronicle();
    ch.entries.push({ tick: 10, importance: 0.9, kind: 'war', text: 'The Clan War set the valley ablaze.' });
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, ch);

    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= 30; d++) { clock.tick = d * cfg.ticksPerDay; runWonderSystem(w, cfg, content); }

    const site = w.query(C_WONDERSITE).map(e => w.getComponent<WonderSite>(e, C_WONDERSITE)!).find(s => s.wonderId === 'great_spire')!;
    expect(site.depicts).toBe('The Clan War set the valley ablaze');   // the loud legend, trailing '.' trimmed
  });

  it('a wonder raised in a town with no notable history depicts nothing (graceful)', () => {
    const { w, data } = wonderWorld();
    townAt(w, 4, 100);
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, createChronicle());   // empty history
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= 30; d++) { clock.tick = d * cfg.ticksPerDay; runWonderSystem(w, cfg, content); }
    const site = w.query(C_WONDERSITE).map(e => w.getComponent<WonderSite>(e, C_WONDERSITE)!).find(s => s.wonderId === 'great_spire')!;
    expect(site.depicts).toBeUndefined();
  });
});

// content typing sanity (the registry is part of Content)
const _typecheck: Content['wonders'] = content.wonders;
void _typecheck;
