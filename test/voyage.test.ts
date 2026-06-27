// Inter-settlement trade & first contact (M25 s3): once the town can sail, a merchant voyages
// to the island, makes first contact (a one-time legend), and trades — the merchant profits and
// the island prospers. These tests pin dispatch, the seafaring gate, and arrival → contact+trade.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_POSITION, C_WALLET, C_VOYAGE, C_CHRONICLE, C_EVENTLOG, C_ORGSTORE, C_CLOCK,
} from '../src/sim/components.ts';
import type { Agent, Position, Wallet, Voyage, Clock } from '../src/sim/components.ts';
import { createOrgStore, createOrg } from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';
import { createChronicle } from '../src/history/chronicle.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import { runVoyageSystem } from '../src/sim/systems/VoyageSystem.ts';
import { createRNG } from '../src/sim/rng.ts';

const cfg = defaultConfig;

function base(tick: number): { w: World; store: OrgStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  w.addComponent(w.createEntity(), C_CHRONICLE, createChronicle());
  w.addComponent(w.createEntity(), C_EVENTLOG, createEventLog());
  const store = createOrgStore();
  w.addComponent(w.createEntity(), C_ORGSTORE, store);
  return { w, store };
}
function clan(store: OrgStoreData, over: Partial<{ seafaring: number; overseas: boolean }> = {}): string {
  const id = createOrg(store, 'Clan', { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, 0.6, 0);
  if (over.seafaring) store.byId[id].effects = { seafaring: over.seafaring };
  if (over.overseas) store.byId[id].overseas = true;
  return id;
}
function person(w: World, orgId: string, x: number, y: number, gold = 0): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `P${e}`, action: 'wander', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId });
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
  return e;
}
const gold = (w: World, e: EntityId) => w.getComponent<Wallet>(e, C_WALLET)!.gold;

describe('VoyageSystem — dispatch (M25)', () => {
  it('sends a seafaring mainlander to an unknown overseas settlement', () => {
    const { w, store } = base(cfg.ticksPerDay);
    const home = clan(store, { seafaring: 1 });
    const isle = clan(store, { overseas: true });
    const merchant = person(w, home, 5, 5);
    person(w, isle, 40, 40);   // an islander to sail to
    runVoyageSystem(w, cfg, createRNG(1));
    const v = w.getComponent<Voyage>(merchant, C_VOYAGE);
    expect(v).toBeDefined();
    expect(v!.orgId).toBe(isle);
  });

  it('does not sail if the town has no boats (no Seafaring tech)', () => {
    const { w, store } = base(cfg.ticksPerDay);
    const home = clan(store);   // no seafaring
    const isle = clan(store, { overseas: true });
    const merchant = person(w, home, 5, 5);
    person(w, isle, 40, 40);
    runVoyageSystem(w, cfg, createRNG(1));
    expect(w.getComponent<Voyage>(merchant, C_VOYAGE)).toBeUndefined();
  });
});

describe('VoyageSystem — arrival, first contact & trade (M25)', () => {
  it('a voyager who reaches the island makes contact and trades (both prosper)', () => {
    const { w, store } = base(7);   // a non-daily tick — arrival is checked every tick
    const home = clan(store, { seafaring: 1 });
    const isle = clan(store, { overseas: true });
    const merchant = person(w, home, 10, 10, 0);
    w.addComponent<Voyage>(merchant, C_VOYAGE, { tx: 10, ty: 11, orgId: isle });
    const islander = person(w, isle, 10, 11, 0);   // adjacent → landfall
    runVoyageSystem(w, cfg, createRNG(1));
    expect(store.byId[isle].discovered).toBe(true);          // first contact made
    expect(gold(w, merchant)).toBeGreaterThan(0);            // the merchant profited
    expect(gold(w, islander)).toBeGreaterThan(0);            // the island prospered
    expect(w.getComponent<Voyage>(merchant, C_VOYAGE)).toBeUndefined();   // voyage done — sails home
  });

  it('a voyager still far from the island just sails closer (no contact yet)', () => {
    const { w, store } = base(7);
    const home = clan(store, { seafaring: 1 });
    const isle = clan(store, { overseas: true });
    const merchant = person(w, home, 0, 0, 0);
    w.addComponent<Voyage>(merchant, C_VOYAGE, { tx: 40, ty: 40, orgId: isle });
    person(w, isle, 40, 40, 0);   // far away
    runVoyageSystem(w, cfg, createRNG(1));
    expect(store.byId[isle].discovered).toBeFalsy();
    expect(w.getComponent<Voyage>(merchant, C_VOYAGE)).toBeDefined();   // still at sea
  });
});
