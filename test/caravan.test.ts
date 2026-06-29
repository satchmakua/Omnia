// Caravans & territory (M31 slice 2): clans hold a seat (centroid of their folk); friendly mainland
// clans run overland trade caravans between seats, shaped by diplomacy (allies trade, rivals don't)
// and bounded by distance; the profit spreads through the clan, not to one hoarder.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_POSITION, C_WALLET, C_ORGSTORE, C_ALIGNMENT } from '../src/sim/components.ts';
import type { Agent, Clock, Position, Wallet, Alignment } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import { ticksPerYear } from '../src/sim/config.ts';
import { createOrgStore, createOrg, adjustStanding, standingBetween } from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';
import { runOrgSystem } from '../src/sim/systems/OrgSystem.ts';
import { runCaravanSystem } from '../src/sim/systems/CaravanSystem.ts';
import { runCrimeSystem } from '../src/sim/systems/CrimeSystem.ts';

const cfg = defaultConfig;
const tpd = cfg.ticksPerDay;
const VALUES = { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 };
// A caravan reckoning falls on a day divisible by caravanIntervalDays; force the pace so a friendly
// near pair always trades (the hash-pacing is exercised by the soak, not pinned here).
const tcfg = { ...cfg, caravanChancePerInterval: 1 };
const reckoningTick = cfg.caravanIntervalDays * tpd * 5;   // some caravan-reckoning day

function world(tick: number): { w: World; store: OrgStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  const store = createOrgStore();
  w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE, store);
  return { w, store };
}
function clanWithFolk(w: World, store: OrgStoreData, name: string, seat: Position, n: number, gold = 0): { id: string; folk: EntityId[] } {
  const id = createOrg(store, name, VALUES, 0.95, 0);
  store.byId[id].seat = { ...seat };
  const folk: EntityId[] = [];
  for (let i = 0; i < n; i++) {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: `${name}${e}`, action: 'wander', ticksAlive: 5000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: id });
    w.addComponent<Position>(e, C_POSITION, { x: seat.x, y: seat.y });
    w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
    folk.push(e);
  }
  store.byId[id].leader = folk[0];
  return { id, folk };
}
const clanGold = (w: World, folk: EntityId[]): number =>
  folk.reduce((s, e) => s + (w.getComponent<Wallet>(e, C_WALLET)?.gold ?? 0), 0);

describe('clan seats — the territory model (M31 s2)', () => {
  it('a clan is seated at the centroid of its folk', () => {
    const { w, store } = world(tpd);
    const id = createOrg(store, 'A', VALUES, 0.95, 0);
    for (const [x, y] of [[10, 10], [20, 10], [10, 20], [20, 20]]) {
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, { name: `M${e}`, action: 'wander', ticksAlive: 5000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: id });
      w.addComponent<Position>(e, C_POSITION, { x, y });
    }
    runOrgSystem(w, cfg, createRNG(1));
    expect(store.byId[id].seat).toEqual({ x: 15, y: 15 });   // centroid of the four
  });
});

describe('caravans — diplomacy-shaped overland trade (M31 s2)', () => {
  it('friendly, nearby clans trade — both prosper', () => {
    const { w, store } = world(reckoningTick);
    const a = clanWithFolk(w, store, 'A', { x: 10, y: 10 }, 3);
    const b = clanWithFolk(w, store, 'B', { x: 16, y: 14 }, 3);   // within caravanMaxDistance
    adjustStanding(store, a.id, b.id, 0.6, 0);                    // allied
    runCaravanSystem(w, tcfg);
    expect(clanGold(w, a.folk)).toBeGreaterThan(0);
    expect(clanGold(w, b.folk)).toBeGreaterThan(0);
  });

  it('rivals keep no caravans', () => {
    const { w, store } = world(reckoningTick);
    const a = clanWithFolk(w, store, 'A', { x: 10, y: 10 }, 3);
    const b = clanWithFolk(w, store, 'B', { x: 16, y: 14 }, 3);
    adjustStanding(store, a.id, b.id, -0.6, 0);                   // rivals
    runCaravanSystem(w, tcfg);
    expect(clanGold(w, a.folk)).toBe(0);
    expect(clanGold(w, b.folk)).toBe(0);
  });

  it('a route cannot span more than the overland reach', () => {
    const { w, store } = world(reckoningTick);
    const a = clanWithFolk(w, store, 'A', { x: 2, y: 2 }, 3);
    const b = clanWithFolk(w, store, 'B', { x: 60, y: 60 }, 3);   // > caravanMaxDistance apart
    adjustStanding(store, a.id, b.id, 0.6, 0);
    runCaravanSystem(w, tcfg);
    expect(clanGold(w, a.folk) + clanGold(w, b.folk)).toBe(0);
  });

  it('the trade is deterministic — the same world yields the same flow', () => {
    const build = () => {
      const { w, store } = world(reckoningTick);
      const a = clanWithFolk(w, store, 'A', { x: 10, y: 10 }, 4);
      const b = clanWithFolk(w, store, 'B', { x: 16, y: 14 }, 4);
      adjustStanding(store, a.id, b.id, 0.6, 0);
      runCaravanSystem(w, tcfg);
      return clanGold(w, a.folk) + clanGold(w, b.folk);
    };
    expect(build()).toBe(build());
    expect(build()).toBeGreaterThan(0);
  });
});

describe('faction reputation — deeds ripple to clan standing (M31 s2)', () => {
  it('a wrongdoer preying on another clan sours the two clans’ standing', () => {
    const { w, store } = world(0);
    const a = createOrg(store, 'A', { ...VALUES, martial: 0.2 }, 0.95, 0);
    const b = createOrg(store, 'B', { ...VALUES, martial: 0.2 }, 0.95, 0);
    // A wicked soul of clan A, beside a gold-laden mark of clan B.
    const off = w.createEntity();
    w.addComponent<Agent>(off, C_AGENT, { name: 'Outlaw', action: 'wander', ticksAlive: 30 * ticksPerYear(cfg), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: a });
    w.addComponent<Alignment>(off, C_ALIGNMENT, { good: -1, law: 0 });
    w.addComponent<Position>(off, C_POSITION, { x: 10, y: 10 });
    w.addComponent<Wallet>(off, C_WALLET, { gold: 0, debt: 0 });
    const vic = w.createEntity();
    w.addComponent<Agent>(vic, C_AGENT, { name: 'Mark', action: 'wander', ticksAlive: 30 * ticksPerYear(cfg), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: b });
    w.addComponent<Position>(vic, C_POSITION, { x: 10, y: 11 });
    w.addComponent<Wallet>(vic, C_WALLET, { gold: 5000, debt: 0 });
    const clk = w.query(C_CLOCK)[0];
    const rng = createRNG(7);
    expect(standingBetween(store, a, b)).toBe(0);
    for (let d = 1; d <= 400; d++) { w.getComponent<Clock>(clk, C_CLOCK)!.tick = d * tpd; runCrimeSystem(w, cfg, rng); }
    expect(standingBetween(store, a, b)).toBeLessThan(0);   // the offender's clan is regarded the worse for it
  });
});
