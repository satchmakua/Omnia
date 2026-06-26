// Social standing & class (M14's deferred class/reputation thread): standing derives from
// deeds & means, buckets into a class label, and warms how readily others seek one's company.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_WALLET, C_HOME, C_CRIME, C_CLOCK, C_ORGSTORE } from '../src/sim/components.ts';
import type { Agent, Wallet, Home, Crime, Clock } from '../src/sim/components.ts';
import { computeStanding, crimeWeight, socialClassOf, standingWarmth } from '../src/sim/society.ts';
import { runStatusSystem } from '../src/sim/systems/StatusSystem.ts';
import { createOrgStore, createOrg } from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';

const cfg = defaultConfig;
const base = { gold: 0, debt: 0, kills: 0, homesOwned: 0, crimes: 0, isLeader: false };

describe('computeStanding (M14)', () => {
  it('an ordinary soul sits at the centre; deeds & means lift, infamy & ruin sink', () => {
    expect(computeStanding(base)).toBeCloseTo(0.5, 6);
    expect(computeStanding({ ...base, isLeader: true })).toBeGreaterThan(0.5);
    expect(computeStanding({ ...base, homesOwned: 3 })).toBeGreaterThan(0.5);   // landlord
    expect(computeStanding({ ...base, kills: 4 })).toBeGreaterThan(0.5);        // valour
    expect(computeStanding({ ...base, gold: 300 })).toBeGreaterThan(0.5);       // means
    expect(computeStanding({ ...base, crimes: 5 })).toBeLessThan(0.5);          // infamy
    expect(computeStanding({ ...base, debt: 20 })).toBeLessThan(0.5);           // ruin
  });
  it('stays bounded in [0,1] at the extremes', () => {
    expect(computeStanding({ gold: 1e6, debt: 0, kills: 100, homesOwned: 9, crimes: 0, isLeader: true })).toBeLessThanOrEqual(1);
    expect(computeStanding({ gold: 0, debt: 99, kills: 0, homesOwned: 0, crimes: 99, isLeader: false })).toBeGreaterThanOrEqual(0);
  });
  it('crimeWeight punishes murder far more than theft', () => {
    expect(crimeWeight(5, 0, 0)).toBeLessThan(crimeWeight(0, 0, 2));   // 5 thefts < 2 murders
  });
});

describe('socialClassOf (M14)', () => {
  it('buckets standing into tiers and tags roles; an outlaw is an outcast', () => {
    expect(socialClassOf(0.9, false, false, false)).toBe('notable');
    expect(socialClassOf(0.5, false, false, false)).toBe('commoner');
    expect(socialClassOf(0.2, false, false, false)).toBe('lowly');
    expect(socialClassOf(0.9, false, true, false)).toBe('notable · chief');
    expect(socialClassOf(0.7, false, false, true)).toBe('respected · landlord');
    expect(socialClassOf(0.9, true, true, true)).toBe('outcast');   // crime overrides all
  });
});

describe('standingWarmth (M14, D26)', () => {
  it('the esteemed are sought out, the disgraced shunned, neutral is a no-op, bounded', () => {
    expect(standingWarmth(0.5, 0.5)).toBeCloseTo(1, 6);
    expect(standingWarmth(1, 1)).toBeGreaterThan(1);
    expect(standingWarmth(0, 0)).toBeLessThan(1);
    expect(standingWarmth(1, 1)).toBeLessThanOrEqual(1.2);
    expect(standingWarmth(0, 0)).toBeGreaterThanOrEqual(0.8);
  });
});

// ── StatusSystem integration ────────────────────────────────────────────────────────
describe('StatusSystem (M14)', () => {
  function person(w: World, gold: number, debt = 0): EntityId {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: `P${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Wallet>(e, C_WALLET, { gold, debt });
    return e;
  }
  it('a landed, leading, wealthy soul out-ranks a destitute outlaw', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const store = createOrgStore();
    w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE, store);
    const orgId = createOrg(store, 'Clan', { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 }, 0.5, 0);

    const grandee = person(w, 300);
    world_addHomes(w, grandee, 3);                 // a landlord
    store.byId[orgId].leader = grandee;            // and a chief
    const wretch = person(w, 0, 30);               // penniless and in debt
    w.addComponent<Crime>(wretch, C_CRIME, { thefts: 2, assaults: 1, murders: 1 });   // an outlaw

    runStatusSystem(w, cfg);
    const sg = w.getComponent<Agent>(grandee, C_AGENT)!.standing!;
    const sw = w.getComponent<Agent>(wretch, C_AGENT)!.standing!;
    expect(sg).toBeGreaterThan(0.7);
    expect(sw).toBeLessThan(0.3);
    expect(sg).toBeGreaterThan(sw);
  });

  function world_addHomes(w: World, owner: EntityId, n: number): void {
    for (let i = 0; i < n; i++) {
      const h = w.createEntity();
      w.addComponent<Home>(h, C_HOME, { owner, builtTick: 0 });
    }
  }
  // (homesOwned ≥2 → landlord bonus; one combat kill demonstrates valour too)
  it('does nothing off a day boundary', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay + 1, day: 1, hour: 0, isDay: true });
    const e = person(w, 100);
    runStatusSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.standing).toBeUndefined();
  });
});
