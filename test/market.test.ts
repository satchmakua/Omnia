// The staple-goods market (M15): a price that floats with supply (farms + foraging) and
// demand (adult mouths), and IS the daily cost of living — so scarcity bites.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_WALLET, C_JOB, C_BUSINESS, C_POSITION, C_CLOCK, C_MARKET,
} from '../src/sim/components.ts';
import type { Agent, Wallet, Business, Clock, Market } from '../src/sim/components.ts';
import {
  createMarket, getMarket, measureSupplyDemand, clearingPrice,
} from '../src/sim/market.ts';
import { runMarketSystem } from '../src/sim/systems/MarketSystem.ts';
import { runEconomySystem } from '../src/sim/systems/EconomySystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;

function town(tick = cfg.ticksPerDay): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  return w;
}
function adult(w: World, ageYears = 30, gold = 100): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: 'A', action: 'wander', ticksAlive: Math.floor(ageYears * ticksPerYear(cfg)),
    wealthGoal: 50, sex: 'female', lifespanTicks: 1e9,
  });
  w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
  return e;
}
function farm(w: World, workers: number): void {
  const b = w.createEntity();
  w.addComponent<Business>(b, C_BUSINESS, {
    professionId: 'farmer', professionName: 'Farmer', color: '#80b060',
    balance: 300, maxEmployees: 9, wagePerTick: 0.03, revenuePerWorkerPerTick: 0.04,
    requiresAptitude: false, gathers: null, producesFood: true,
  });
  w.addComponent(b, C_POSITION, { x: 0, y: 0 });
  for (let i = 0; i < workers; i++) {
    const e = adult(w);
    w.addComponent(e, C_JOB, {
      professionId: 'farmer', professionName: 'Farmer', employer: b, wagePerTick: 0.03, gathers: null,
    });
  }
}

// ── Pure pricing helpers ──────────────────────────────────────────────────────────
describe('market pricing (M15)', () => {
  it('clearingPrice eases toward the base when supply meets demand', () => {
    const p = clearingPrice(cfg.provisionBasePrice, 30, 30, cfg);
    expect(p).toBeCloseTo(cfg.provisionBasePrice, 6);   // demand == supply → target is exactly base
  });

  it('scarcity (demand > supply) drives the price up; a glut drives it down', () => {
    const dear = clearingPrice(cfg.provisionBasePrice, 10, 40, cfg);   // far more mouths than rations
    const cheap = clearingPrice(cfg.provisionBasePrice, 40, 10, cfg);  // glut
    expect(dear).toBeGreaterThan(cfg.provisionBasePrice);
    expect(cheap).toBeLessThan(cfg.provisionBasePrice);
  });

  it('the price stays within its band even under extreme imbalance', () => {
    // Push hard for many days, from both directions.
    let hi = cfg.provisionBasePrice, lo = cfg.provisionBasePrice;
    for (let i = 0; i < 200; i++) {
      hi = clearingPrice(hi, 1, 1000, cfg);
      lo = clearingPrice(lo, 1000, 1, cfg);
    }
    expect(hi).toBeLessThanOrEqual(cfg.provisionPriceMax);
    expect(lo).toBeGreaterThanOrEqual(cfg.provisionPriceMin);
  });

  it('measureSupplyDemand counts adult mouths and food-worker output (+ the foraged baseline)', () => {
    const w = town();
    adult(w, 30); adult(w, 30);          // two adults → demand 2
    adult(w, 8);                          // a child does not transact
    farm(w, 3);                           // a farm with 3 workers (also 3 adults → demand)
    const { supply, demand } = measureSupplyDemand(w, cfg);
    expect(demand).toBe((2 + 3) * cfg.provisionPerAdult);                       // 5 adults eat
    expect(supply).toBe(cfg.baseForagedProvisions + 3 * cfg.provisionPerFarmer); // baseline + 3 farmers
  });

  it('a non-food business contributes workers to demand but not to supply', () => {
    const w = town();
    const b = w.createEntity();
    w.addComponent<Business>(b, C_BUSINESS, {
      professionId: 'miner', professionName: 'Miner', color: '#909',
      balance: 300, maxEmployees: 4, wagePerTick: 0.04, revenuePerWorkerPerTick: 0.05,
      requiresAptitude: false, gathers: 'ore',     // not producesFood
    });
    const e = adult(w); w.addComponent(e, C_JOB, {
      professionId: 'miner', professionName: 'Miner', employer: b, wagePerTick: 0.04, gathers: 'ore',
    });
    const { supply, demand } = measureSupplyDemand(w, cfg);
    expect(demand).toBe(1 * cfg.provisionPerAdult);
    expect(supply).toBe(cfg.baseForagedProvisions);   // the miner adds nothing to supply
  });
});

// ── MarketSystem ───────────────────────────────────────────────────────────────────
describe('MarketSystem (M15)', () => {
  it('updates supply/demand/price once a day and keeps a bounded history', () => {
    const w = town();
    w.addComponent<Market>(w.createEntity(), C_MARKET, createMarket(cfg));
    for (let i = 0; i < 5; i++) { adult(w, 30); }   // mouths, no farms → scarcity
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= cfg.marketHistoryLength + 10; d++) { clock.tick = d * cfg.ticksPerDay; runMarketSystem(w, cfg); }
    const mkt = getMarket(w)!;
    expect(mkt.demand).toBe(5 * cfg.provisionPerAdult);
    expect(mkt.supply).toBe(cfg.baseForagedProvisions);
    expect(mkt.history.length).toBe(cfg.marketHistoryLength);   // bounded
  });

  it('does nothing off a day boundary', () => {
    const w = town(cfg.ticksPerDay + 1);   // not a multiple of ticksPerDay
    w.addComponent<Market>(w.createEntity(), C_MARKET, createMarket(cfg));
    adult(w, 30);
    runMarketSystem(w, cfg);
    expect(getMarket(w)!.history.length).toBe(0);
  });
});

// ── The causal coupling (D26): scarcity raises the cost of living ───────────────────
describe('market price drives the cost of living (M15)', () => {
  it('an adult in a dear-food town loses more to upkeep than one where food is cheap', () => {
    // Two identical jobless adults; only the market price differs. EconomySystem charges
    // the price as the cost of living, so the dear-food wallet ends lower.
    const run = (price: number): number => {
      const w = town();
      w.addComponent<Market>(w.createEntity(), C_MARKET, { price, supply: 0, demand: 0, history: [] });
      const a = adult(w, 30, 100);
      runEconomySystem(w, cfg);   // jobless: earn subsistence, then spend `price`
      return w.getComponent<Wallet>(a, C_WALLET)!.gold;
    };
    const dear = run(cfg.provisionPriceMax);
    const cheap = run(cfg.provisionPriceMin);
    expect(dear).toBeLessThan(cheap);                                   // scarcity bites
    expect(cheap - dear).toBeCloseTo(cfg.provisionPriceMax - cfg.provisionPriceMin, 6);
  });

  it('falls back to the flat upkeep when there is no market', () => {
    const w = town();
    const a = adult(w, 30, 100);
    runEconomySystem(w, { ...cfg, subsistencePerDay: 0 });   // no market component present
    expect(w.getComponent<Wallet>(a, C_WALLET)!.gold).toBe(100 - cfg.dailyUpkeep);
  });
});

// ── World-gen wiring ────────────────────────────────────────────────────────────────
describe('market at world-gen (M15)', () => {
  it('a fresh world has a market priced at the base', () => {
    const { world } = createSimulation({ ...defaultConfig, seed: 3 }, testContent());
    const mkt = getMarket(world)!;
    expect(mkt).toBeDefined();
    expect(mkt.price).toBe(defaultConfig.provisionBasePrice);
  });
});
