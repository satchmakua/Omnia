// Institutions (M14): the Organization store + the OrgSystem (leadership succession,
// extinction, schism) + founding tribes seeded at world-gen.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_ORGSTORE } from '../src/sim/components.ts';
import type { Agent, Clock } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import {
  createOrgStore, createOrg, forkOrg, getOrg, orgHue, governmentOf, pruneOrgs,
} from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';
import { runOrgSystem } from '../src/sim/systems/OrgSystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const VALUES = { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 };

describe('orgStore helpers (M14)', () => {
  it('hues are spaced and never red', () => {
    for (let i = 0; i < 60; i++) {
      const h = orgHue(i);
      expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThanOrEqual(360);
      expect(h < 16 || h > 344).toBe(false);   // outside the red band
    }
  });

  it('government emerges from values', () => {
    expect(governmentOf({ ...VALUES, martial: 0.8 })).toBe('chiefdom');
    expect(governmentOf({ ...VALUES, traditional: 0.8, martial: 0.2 })).toBe('theocracy');
    expect(governmentOf({ ...VALUES, communal: 0.8, martial: 0.2, traditional: 0.2 })).toBe('council');
    expect(governmentOf({ communal: 0.2, martial: 0.2, traditional: 0.2, open: 0.2 })).toBe('gerontocracy');
  });

  it('createOrg + forkOrg: distinct colours, descent, nudged values', () => {
    const s = createOrgStore();
    const a = createOrg(s, 'Alpha', VALUES, 0.6, 0);
    const b = forkOrg(s, a, 'Beta', 1000, 0.2, createRNG(1));
    expect(getOrg(s, a)!.color).not.toBe(getOrg(s, b)!.color);
    expect(getOrg(s, b)!.parent).toBe(a);
    expect(s.created).toBe(2);
  });

  it('pruneOrgs drops the oldest extinct beyond the cap, never the living', () => {
    const s = createOrgStore();
    for (let i = 0; i < 6; i++) { const id = createOrg(s, `T${i}`, VALUES, 0.5, i); if (i < 4) { s.byId[id].extinct = true; s.byId[id].diedTick = i; } }
    pruneOrgs(s, 3);
    expect(Object.keys(s.byId).length).toBe(3);
    expect(Object.values(s.byId).filter(o => !o.extinct).length).toBe(2);   // both living kept
  });
});

// ── OrgSystem ─────────────────────────────────────────────────────────────────────
function orgWorld(tick: number): { w: World; store: OrgStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  const store = createOrgStore();
  w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE, store);
  return { w, store };
}
function member(w: World, orgId: string, ageYears: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: `M${e}`, action: 'wander', ticksAlive: Math.floor(ageYears * ticksPerYear(cfg)),
    wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, orgId,
  });
  return e;
}

describe('OrgSystem (M14)', () => {
  it('elects the eldest as leader, and re-elects when the leader is gone', () => {
    const { w, store } = orgWorld(cfg.ticksPerDay);
    const org = createOrg(store, 'Korvu', VALUES, 0.6, 0);
    member(w, org, 20); const elder = member(w, org, 60); member(w, org, 30);
    runOrgSystem(w, cfg, createRNG(1));
    expect(getOrg(store, org)!.leader).toBe(elder);   // the eldest leads
    w.removeComponent(elder, C_AGENT);                 // the leader dies
    runOrgSystem(w, cfg, createRNG(1));
    const newLeader = getOrg(store, org)!.leader!;
    expect(newLeader).not.toBe(elder);
    expect(w.hasComponent(newLeader, C_AGENT)).toBe(true);
  });

  it('a tribe with no living members falls (extinct)', () => {
    const { w, store } = orgWorld(cfg.ticksPerDay);
    const org = createOrg(store, 'Lone', VALUES, 0.6, 0);
    const only = member(w, org, 40);
    runOrgSystem(w, cfg, createRNG(1));
    expect(getOrg(store, org)!.extinct).toBeFalsy();
    w.removeComponent(only, C_AGENT);
    runOrgSystem(w, cfg, createRNG(1));
    expect(getOrg(store, org)!.extinct).toBe(true);
  });

  it('a large, loose tribe schisms — a faction breaks away with its own leader', () => {
    const era = cfg.evolutionIntervalDays * cfg.ticksPerDay;
    const { w, store } = orgWorld(era);                // an era boundary
    const org = createOrg(store, 'Big', VALUES, 0, 0); // cohesion 0 → schism-prone
    for (let i = 0; i < 10; i++) member(w, org, 20 + i);
    runOrgSystem(w, { ...cfg, schismChancePerEra: 1, minSchismMembers: 8 }, createRNG(1));
    const daughters = Object.values(store.byId).filter(o => o.parent === org);
    expect(daughters.length).toBe(1);
    const d = daughters[0];
    const inParent = w.query(C_AGENT).filter(e => w.getComponent<Agent>(e, C_AGENT)!.orgId === org).length;
    const inDaughter = w.query(C_AGENT).filter(e => w.getComponent<Agent>(e, C_AGENT)!.orgId === d.id).length;
    expect(inParent).toBeGreaterThan(0);
    expect(inDaughter).toBeGreaterThan(0);
    expect(d.leader).not.toBeNull();
  });
});

describe('seedTribes through world-gen (M14)', () => {
  it('splits founders into a few tribes; partners share one; children would inherit', () => {
    const { world } = createSimulation({ ...defaultConfig, seed: 3 }, testContent());
    const adults = world.query(C_AGENT).filter(e => world.getComponent<Agent>(e, C_AGENT)!.orgId !== undefined);
    expect(adults.length).toBeGreaterThan(0);
    const orgs = new Set(adults.map(e => world.getComponent<Agent>(e, C_AGENT)!.orgId));
    expect(orgs.size).toBeLessThanOrEqual(defaultConfig.initialTribes);
    expect(orgs.size).toBeGreaterThan(0);
  });
});
