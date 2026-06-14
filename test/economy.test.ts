import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_JOB, C_BUSINESS, C_POSITION,
} from '../src/sim/components.ts';
import type { Agent, Needs, Wallet, Job, Business } from '../src/sim/components.ts';
import { earn, spend, netWorth } from '../src/sim/economy.ts';
import { gini, wealthStats } from '../src/sim/wealth.ts';
import { runEconomySystem } from '../src/sim/systems/EconomySystem.ts';
import { runActionSystem } from '../src/sim/systems/ActionSystem.ts';

const cfg = defaultConfig;

// ── Money helpers (debt invariant) ────────────────────────────────────────────

describe('economy money helpers', () => {
  it('spend never drives gold negative — shortfall becomes debt', () => {
    const w: Wallet = { gold: 3, debt: 0 };
    spend(w, 5);
    expect(w.gold).toBe(0);
    expect(w.debt).toBe(2);
  });

  it('earn pays down debt before adding gold', () => {
    const w: Wallet = { gold: 0, debt: 5 };
    earn(w, 3);
    expect(w.debt).toBe(2);
    expect(w.gold).toBe(0);
    earn(w, 4);
    expect(w.debt).toBe(0);
    expect(w.gold).toBe(2);
  });

  it('netWorth is gold minus debt', () => {
    expect(netWorth({ gold: 10, debt: 3 })).toBe(7);
    expect(netWorth({ gold: 0, debt: 8 })).toBe(-8);
  });
});

// ── Wealth metric ─────────────────────────────────────────────────────────────

describe('wealth metric', () => {
  it('gini is 0 for perfect equality and rises with inequality', () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0, 5);
    expect(gini([0, 0, 0, 100])).toBeGreaterThan(0.6);
  });

  it('wealthStats summarises agent net worth', () => {
    const w = new World();
    const mk = (gold: number, debt: number) => {
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 0, wealthGoal: 50 });
      w.addComponent<Wallet>(e, C_WALLET, { gold, debt });
    };
    mk(10, 0); mk(30, 0); mk(0, 5);
    const s = wealthStats(w);
    expect(s.count).toBe(3);
    expect(s.min).toBe(-5);
    expect(s.max).toBe(30);
    expect(s.median).toBe(10);
    expect(s.inDebt).toBe(1);
  });
});

// ── EconomySystem ─────────────────────────────────────────────────────────────

function makeBusiness(w: World, over: Partial<Business> = {}) {
  const e = w.createEntity();
  w.addComponent<Business>(e, C_BUSINESS, {
    professionId: 'laborer', professionName: 'Laborer', color: '#fff',
    balance: 100, maxEmployees: 2, wagePerTick: 0.5, revenuePerWorkerPerTick: 0.6,
    requiresAptitude: false, ...over,
  });
  w.addComponent(e, C_POSITION, { x: 0, y: 0 });
  return e;
}

function makeAgent(w: World, over: Partial<Agent> = {}, wallet: Wallet = { gold: 0, debt: 0 }) {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'work', ticksAlive: 0, wealthGoal: 50, ...over });
  w.addComponent<Wallet>(e, C_WALLET, wallet);
  w.addComponent(e, C_POSITION, { x: 1, y: 1 });
  return e;
}

describe('EconomySystem', () => {
  it('hires unemployed agents into businesses with openings', () => {
    const w = new World();
    makeBusiness(w, { maxEmployees: 1 });
    const a = makeAgent(w, { action: 'wander' });
    runEconomySystem(w, cfg);
    expect(w.hasComponent(a, C_JOB)).toBe(true);
  });

  it('respects a business max-employee cap', () => {
    const w = new World();
    makeBusiness(w, { maxEmployees: 1 });
    makeAgent(w, { action: 'wander' });
    makeAgent(w, { action: 'wander' });
    runEconomySystem(w, cfg);
    const employed = w.query(C_AGENT, C_JOB).length;
    expect(employed).toBe(1); // only one opening
  });

  it('pays a working employee its wage and books business revenue', () => {
    const w = new World();
    const biz = makeBusiness(w, { balance: 100, wagePerTick: 2, revenuePerWorkerPerTick: 3 });
    const a = makeAgent(w, { action: 'work' }, { gold: 0, debt: 0 });
    runEconomySystem(w, cfg);                 // hires a into biz
    const wallet = w.getComponent<Wallet>(a, C_WALLET)!;
    expect(wallet.gold).toBe(2);             // earned one tick of wage
    expect(w.getComponent<Business>(biz, C_BUSINESS)!.balance).toBe(100 - 2 + 3);
  });

  it('does not pay an employee who is not working', () => {
    const w = new World();
    makeBusiness(w);
    const a = makeAgent(w, { action: 'wander' });
    runEconomySystem(w, cfg);
    expect(w.getComponent<Wallet>(a, C_WALLET)!.gold).toBe(0);
  });

  it('charges daily upkeep on a day boundary, accruing debt when broke', () => {
    const w = new World();
    // No businesses → agent stays unemployed and cannot earn.
    const a = makeAgent(w, { action: 'wander' }, { gold: 1, debt: 0 });
    // Put a clock entity at a day boundary.
    const c = w.createEntity();
    w.addComponent(c, 'Clock', { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    runEconomySystem(w, { ...cfg, dailyUpkeep: 4 });
    const wallet = w.getComponent<Wallet>(a, C_WALLET)!;
    expect(wallet.gold).toBe(0);
    expect(wallet.debt).toBe(3); // owed 4, had 1
  });
});

// ── ActionSystem: the work decision ───────────────────────────────────────────

describe('ActionSystem work choice', () => {
  function agentWithJob(gold: number, goal: number) {
    const w = new World();
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 0, wealthGoal: goal });
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 0.9, energy: 0.9 }); // comfortable
    w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
    w.addComponent<Job>(e, C_JOB, { professionId: 'laborer', professionName: 'Laborer', employer: 999, wagePerTick: 0.5 });
    return { w, e };
  }

  it('works when comfortable, employed, and below the wealth goal', () => {
    const { w, e } = agentWithJob(10, 50);
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).toBe('work');
  });

  it('wanders when already at the wealth goal', () => {
    const { w, e } = agentWithJob(60, 50);
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).toBe('wander');
  });

  it('prioritises survival (food) over work even when poor', () => {
    const { w, e } = agentWithJob(0, 50);
    w.getComponent<Needs>(e, C_NEEDS)!.hunger = 0.1; // starving
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(e, C_AGENT)!.action).toBe('seek_food');
  });
});
