// Tech effects (M25 slice 1): climbing the ages now *matters*. Each formerly-inert tech grants a
// tribe-wide effect — `farming` (more food per farmer), `tools` (more gather yield), `industry`
// (richer businesses, town-wide), `research` (faster research). These tests pin the helpers and
// each wiring with a with/without comparison.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_JOB, C_BUSINESS, C_RESOURCE, C_POSITION, C_MARKET, C_ORGSTORE, C_CLOCK,
} from '../src/sim/components.ts';
import type { Agent, Job, Business, Resource, Position, Clock } from '../src/sim/components.ts';
import { createOrgStore, createOrg, effectOf, maxEffect } from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';
import { createMarket, measureSupplyDemand } from '../src/sim/market.ts';
import { runGatherSystem } from '../src/sim/systems/GatherSystem.ts';
import { runResearchSystem } from '../src/sim/systems/ResearchSystem.ts';
import { ensureInventory, itemCount } from '../src/sim/inventory.ts';
import { Registry } from '../src/content/registry.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;

function withOrgStore(w: World): OrgStoreData {
  const store = createOrgStore();
  w.addComponent(w.createEntity(), C_ORGSTORE, store);
  return store;
}
function org(store: OrgStoreData, effects: Record<string, number> = {}): string {
  const id = createOrg(store, 'Clan', { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, 0.6, 0);
  store.byId[id].effects = effects;
  return id;
}

describe('org effect helpers (M25)', () => {
  it('effectOf reads a tribe’s tag level; maxEffect takes the town-wide max', () => {
    const w = new World();
    const store = withOrgStore(w);
    const a = org(store, { industry: 1 });
    const b = org(store, { industry: 3, farming: 2 });
    expect(effectOf(store, a, 'industry')).toBe(1);
    expect(effectOf(store, b, 'farming')).toBe(2);
    expect(effectOf(store, a, 'farming')).toBe(0);   // absent tag → 0
    expect(effectOf(store, undefined, 'industry')).toBe(0);
    expect(maxEffect(store, 'industry')).toBe(3);     // the most advanced tribe sets the base
  });
});

describe('farming → more food per farmer (M25)', () => {
  function farmTown(farming: number): number {
    const w = new World();
    const store = withOrgStore(w);
    const clanId = org(store, farming ? { farming } : {});
    w.addComponent(w.createEntity(), C_MARKET, createMarket(cfg));
    const farm = w.createEntity();
    w.addComponent<Business>(farm, C_BUSINESS, { professionId: 'farmer', professionName: 'Farmer', color: '#8b6', balance: 50, maxEmployees: 5, wagePerTick: 0.03, revenuePerWorkerPerTick: 0.04, requiresAptitude: false, gathers: null, producesFood: true });
    for (let i = 0; i < 3; i++) {
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, { name: `F${e}`, action: 'work', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: clanId });
      w.addComponent<Job>(e, C_JOB, { professionId: 'farmer', professionName: 'Farmer', employer: farm, wagePerTick: 0.03, gathers: null });
    }
    return measureSupplyDemand(w, cfg).supply;
  }
  it('a tribe that knows Agriculture grows more food', () => {
    expect(farmTown(2)).toBeGreaterThan(farmTown(0));
  });
});

describe('tools → more gather yield (M25)', () => {
  function dig(tools: number): number {
    const w = new World();
    const store = withOrgStore(w);
    const clanId = org(store, tools ? { tools } : {});
    const node = w.createEntity();
    w.addComponent<Position>(node, C_POSITION, { x: 2, y: 2 });
    w.addComponent<Resource>(node, C_RESOURCE, { typeId: 'ore', name: 'Ore', color: '#888', amount: 1, renewable: false, regenPerTick: 0 });
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'M', action: 'work', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: clanId });
    w.addComponent<Job>(e, C_JOB, { professionId: 'miner', professionName: 'Miner', employer: -1 as EntityId, wagePerTick: 0.03, gathers: 'ore' });
    w.addComponent<Position>(e, C_POSITION, { x: 2, y: 2 });
    runGatherSystem(w, cfg);
    return itemCount(ensureInventory(w, e), 'ore');
  }
  it('a tribe with better tools banks more material from the same dig', () => {
    expect(dig(3)).toBeGreaterThan(dig(0));
  });
});

describe('industry → richer businesses, town-wide (M25)', () => {
  it('maxEffect drives the town-wide industry base (the most advanced tribe)', () => {
    const w = new World();
    const store = withOrgStore(w);
    org(store, { industry: 1 });
    org(store, { industry: 4 });
    expect(maxEffect(store, 'industry')).toBe(4);   // EconomySystem scales revenue by 1 + 0.06×this
  });
});

describe('research → faster research (M25)', () => {
  function gained(research: number): number {
    const w = new World();
    const store = withOrgStore(w);
    const clanId = org(store, research ? { research } : {});
    store.byId[clanId].research = 0;
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'S', action: 'wander', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: clanId });
    // One unaffordable tech → research accumulates but nothing unlocks (isolate the rate).
    const dear = { id: 'dear', name: 'Dear', tier: 1, era: 'Tribal Age', cost: 1e9, prerequisites: [], effects: [], blurb: '' };
    const content = { ...testContent(), tech: new Registry([dear]) };
    runResearchSystem(w, cfg, content);
    return store.byId[clanId].research ?? 0;
  }
  it('a learned tribe accumulates research faster', () => {
    expect(gained(2)).toBeGreaterThan(gained(0));
  });
});
