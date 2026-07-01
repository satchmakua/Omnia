// The crafted-goods market (M36 s1): each good's price floats around its base value with supply,
// self-calibrating via a slow EMA so the long-run price = the listed value and only short-run
// deviations move it. These tests pin the math (glut cheapens, scarcity dears, mean-preserving,
// bounded, deterministic) and that the TradeSystem sells at the floating price.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_INVENTORY, C_WALLET, C_CLOCK, C_GOODSMARKET } from '../src/sim/components.ts';
import type { Agent, Inventory, Wallet, Clock, GoodsMarket } from '../src/sim/components.ts';
import {
  createGoodsMarket, getGoodsMarket, goodsPriceOf, measureGoodsSupply, updateGoodsPrices,
} from '../src/sim/goodsMarket.ts';
import { runTradeSystem } from '../src/sim/systems/TradeSystem.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();
const GOOD = content.goods.all()[0];   // a real good (e.g. a plank)

describe('goods market — the model (M36 s1)', () => {
  it('seeds every good at its listed base value', () => {
    const m = createGoodsMarket(content);
    for (const g of content.goods.all()) expect(m.prices[g.id]).toBe(g.value);
  });

  it('a glut cheapens, scarcity dears — relative to the good’s own norm', () => {
    // Warm the average at a steady supply of 10, then shock supply up (glut) and down (scarce).
    const glut = createGoodsMarket(content);
    const scarce = createGoodsMarket(content);
    const steady = Object.fromEntries(content.goods.all().map(g => [g.id, 10]));
    for (let d = 0; d < 30; d++) { updateGoodsPrices(glut, steady, content, cfg); updateGoodsPrices(scarce, steady, content, cfg); }
    const settled = glut.prices[GOOD.id];
    expect(settled).toBeCloseTo(GOOD.value, 1);            // a steady supply settles at the base value
    // Now a sustained glut (3× the norm) and a sustained scarcity (¼ the norm).
    const high = Object.fromEntries(content.goods.all().map(g => [g.id, 30]));
    const low = Object.fromEntries(content.goods.all().map(g => [g.id, 2]));
    for (let d = 0; d < 5; d++) { updateGoodsPrices(glut, high, content, cfg); updateGoodsPrices(scarce, low, content, cfg); }
    expect(glut.prices[GOOD.id]).toBeLessThan(settled);    // glut → cheaper
    expect(scarce.prices[GOOD.id]).toBeGreaterThan(settled); // scarcity → dearer
  });

  it('the price stays within the configured band, however extreme the supply', () => {
    const m = createGoodsMarket(content);
    const none = Object.fromEntries(content.goods.all().map(g => [g.id, 0]));
    const flood = Object.fromEntries(content.goods.all().map(g => [g.id, 100000]));
    for (let d = 0; d < 50; d++) updateGoodsPrices(m, d % 2 ? none : flood, content, cfg);
    for (const g of content.goods.all()) {
      expect(m.prices[g.id]).toBeGreaterThanOrEqual(g.value * cfg.goodsPriceMinMult - 1e-9);
      expect(m.prices[g.id]).toBeLessThanOrEqual(g.value * cfg.goodsPriceMaxMult + 1e-9);
    }
  });

  it('is deterministic — the same supply history yields the same prices', () => {
    const run = () => {
      const m = createGoodsMarket(content);
      for (let d = 0; d < 20; d++) updateGoodsPrices(m, Object.fromEntries(content.goods.all().map(g => [g.id, (d * 7) % 13])), content, cfg);
      return JSON.stringify(m.prices);
    };
    expect(run()).toBe(run());
  });

  it('goodsPriceOf falls back to the base value with no market (older saves / minimal worlds)', () => {
    expect(goodsPriceOf(undefined, GOOD.id, GOOD.value)).toBe(GOOD.value);
  });

  it('tracks a demand index — >1 when goods are broadly scarce, <1 on a broad glut (M36 s2)', () => {
    const steady = createGoodsMarket(content), scarce = createGoodsMarket(content), glut = createGoodsMarket(content);
    const at = (n: number) => Object.fromEntries(content.goods.all().map(g => [g.id, n]));
    for (let d = 0; d < 20; d++) { updateGoodsPrices(steady, at(10), content, cfg); updateGoodsPrices(scarce, at(10), content, cfg); updateGoodsPrices(glut, at(10), content, cfg); }
    expect(steady.demandIndex).toBeCloseTo(1, 1);        // a steady economy sits at ~1 (baseline unchanged)
    for (let d = 0; d < 6; d++) { updateGoodsPrices(scarce, at(2), content, cfg); updateGoodsPrices(glut, at(40), content, cfg); }
    expect(scarce.demandIndex).toBeGreaterThan(1);       // broad scarcity → trades earn more
    expect(glut.demandIndex).toBeLessThan(1);            // broad glut → trades earn less
  });
});

describe('goods market — the TradeSystem sells at the floating price (M36 s1)', () => {
  function sellerWorld(price: number): { w: World; seller: number; wallet: Wallet } {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    const m = createGoodsMarket(content);
    m.prices[GOOD.id] = price;                            // pin the price for the assertion
    w.addComponent<GoodsMarket>(w.createEntity(), C_GOODSMARKET, m);
    const seller = w.createEntity();
    w.addComponent<Agent>(seller, C_AGENT, { name: 'Smith', action: 'work', ticksAlive: 9000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Inventory>(seller, C_INVENTORY, { items: { [GOOD.id]: 4 } });
    const wallet: Wallet = { gold: 0, debt: 0 };
    w.addComponent<Wallet>(seller, C_WALLET, wallet);
    return { w, seller, wallet };
  }

  it('a dearer market price earns the crafter more for the same goods', () => {
    const cheap = sellerWorld(GOOD.value * cfg.goodsPriceMinMult);
    const dear = sellerWorld(GOOD.value * cfg.goodsPriceMaxMult);
    runTradeSystem(cheap.w, cfg, content);
    runTradeSystem(dear.w, cfg, content);
    expect(dear.wallet.gold).toBeGreaterThan(cheap.wallet.gold);
    expect(cheap.wallet.gold).toBeGreaterThan(0);   // …but a glut still earns something (the floor)
  });

  it('createSimulation seeds a goods market and the TradeSystem reads it', () => {
    // (sanity that the singleton exists in a real world — exercised via getGoodsMarket)
    const { w } = sellerWorld(GOOD.value);
    expect(getGoodsMarket(w)).toBeDefined();
    expect(measureGoodsSupply(w, content)[GOOD.id]).toBe(4);   // the seller's stock is counted as supply
  });
});
