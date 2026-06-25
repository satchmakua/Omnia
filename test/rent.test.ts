// Landlords & rent (M11 slice 2): a homeless adult shelters in a landlord's spare home for
// a daily rent — making "landlord" a real economic role and giving the tenant a (rented) roof.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_WALLET, C_POSITION, C_HOME, C_CLOCK } from '../src/sim/components.ts';
import type { Agent, Wallet, Clock } from '../src/sim/components.ts';
import { runRentSystem } from '../src/sim/systems/RentSystem.ts';

const cfg = defaultConfig;
const rentsFrom = (w: World, e: EntityId) => w.getComponent<Agent>(e, C_AGENT)!.rentsFrom;

function town(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  return w;
}
function adult(w: World, gold: number, ageYears = 30): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: 'A', action: 'wander', ticksAlive: Math.floor(ageYears * ticksPerYear(cfg)),
    wealthGoal: 50, sex: 'female', lifespanTicks: 1e9,
  });
  w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
  return e;
}
function giveHomes(w: World, owner: EntityId, n: number): void {
  for (let i = 0; i < n; i++) {
    const h = w.createEntity();
    w.addComponent(h, C_POSITION, { x: i, y: 0 });
    w.addComponent(h, C_HOME, { owner, builtTick: 0 });
  }
}

describe('RentSystem (M11 slice 2)', () => {
  it('a homeless adult rents a landlord’s spare home; rent flows landlord-ward', () => {
    const w = town();
    const lord = adult(w, 100); giveHomes(w, lord, 2);   // lives in one, one to let
    const tenant = adult(w, 10);
    runRentSystem(w, cfg);
    expect(rentsFrom(w, tenant)).toBe(lord);
    expect(w.getComponent<Wallet>(tenant, C_WALLET)!.gold).toBe(10 - cfg.rentPerDay);
    expect(w.getComponent<Wallet>(lord, C_WALLET)!.gold).toBe(100 + cfg.rentPerDay);
  });

  it('a one-home owner has no spare, so a homeless adult finds no rental', () => {
    const w = town();
    const owner = adult(w, 100); giveHomes(w, owner, 1);
    const homeless = adult(w, 10);
    runRentSystem(w, cfg);
    expect(rentsFrom(w, homeless)).toBeUndefined();
  });

  it('children do not rent', () => {
    const w = town();
    const lord = adult(w, 100); giveHomes(w, lord, 2);
    const kid = adult(w, 10, 8);
    runRentSystem(w, cfg);
    expect(rentsFrom(w, kid)).toBeUndefined();
  });

  it('spare capacity is limited: one spare home houses exactly one tenant', () => {
    const w = town();
    const lord = adult(w, 100); giveHomes(w, lord, 2);   // one spare
    const t1 = adult(w, 10), t2 = adult(w, 10);
    runRentSystem(w, cfg);
    expect([t1, t2].filter(t => rentsFrom(w, t) === lord).length).toBe(1);
  });

  it('rent never pushes a tenant past the debt cap', () => {
    const w = town();
    const lord = adult(w, 100); giveHomes(w, lord, 2);
    const tenant = adult(w, 0);
    w.getComponent<Wallet>(tenant, C_WALLET)!.debt = cfg.maxDebt;   // already maximally poor
    runRentSystem(w, cfg);
    expect(rentsFrom(w, tenant)).toBe(lord);
    expect(w.getComponent<Wallet>(tenant, C_WALLET)!.debt).toBeLessThanOrEqual(cfg.maxDebt);
  });

  it('tenancy ends when the landlord no longer has a spare home', () => {
    const w = town();
    const lord = adult(w, 100); giveHomes(w, lord, 2);
    const tenant = adult(w, 10);
    runRentSystem(w, cfg);
    expect(rentsFrom(w, tenant)).toBe(lord);
    w.destroyEntity(w.query(C_HOME)[0]);                 // landlord drops to one home → no spare
    runRentSystem(w, cfg);
    expect(rentsFrom(w, tenant)).toBeUndefined();
  });
});
