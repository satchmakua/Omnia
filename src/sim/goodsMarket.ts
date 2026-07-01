// The crafted-goods market (M36 slice 1). Today crafted goods sell at a fixed listed value; this gives
// each good a PRICE that floats with supply & demand — a glut of planks cheapens them, a scarce blade
// dears. The model is **self-calibrating and mean-preserving**: each good's price chases its base value
// scaled by (its own slow-average supply ÷ today's supply), so the long-run price equals the listed
// value (= marginal cost) and only short-run deviations from the good's own norm move it. That keeps the
// tuned economy on its keel (no systematic income shift) while making scarcity & glut real and legible.
//
// Pure arithmetic over durable state — no RNG, no LLM — so it replays exactly and never perturbs the
// trajectory beyond the (bounded) gold the TradeSystem then moves at these prices.
import { C_GOODSMARKET, C_AGENT, C_INVENTORY } from './components.ts';
import type { GoodsMarket, Inventory } from './components.ts';
import type { World } from './ecs.ts';
import type { SimConfig } from './config.ts';
import type { Content } from '../content/loader.ts';
import { itemCount } from './inventory.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function createGoodsMarket(content: Content): GoodsMarket {
  const prices: Record<string, number> = {};
  for (const g of content.goods.all()) prices[g.id] = g.value;
  return { prices, avgSupply: {}, supply: {}, demandIndex: 1 };
}

export function getGoodsMarket(world: World): GoodsMarket | undefined {
  const ents = world.query(C_GOODSMARKET);
  return ents.length ? world.getComponent<GoodsMarket>(ents[0], C_GOODSMARKET) : undefined;
}

// The current market price of a good (falls back to its listed base value if the market is absent —
// older saves / minimal test worlds — so the TradeSystem always has a price).
export function goodsPriceOf(market: GoodsMarket | undefined, id: string, base: number): number {
  return market?.prices[id] ?? base;
}

// Total quantity of each good held across the town right now — the day's supply (the TradeSystem
// empties bags daily, so what's held at the market tick ≈ what was produced today).
export function measureGoodsSupply(world: World, content: Content): Record<string, number> {
  const supply: Record<string, number> = {};
  for (const g of content.goods.all()) supply[g.id] = 0;
  for (const e of world.query(C_AGENT, C_INVENTORY)) {
    const inv = world.getComponent<Inventory>(e, C_INVENTORY)!;
    for (const g of content.goods.all()) {
      const n = itemCount(inv, g.id);
      if (n > 0) supply[g.id] += n;
    }
  }
  return supply;
}

// Ease every good's price toward its clearing target. The target = base × (avgSupply / supply), so a
// good made more than its own norm cheapens and one made less dears; clamped to a band around the base
// so income stays bounded, eased so it drifts rather than jumps. `avgSupply` warms to the first reading
// (first-day price = base) then tracks supply slowly. Pure; mutates the passed market.
export function updateGoodsPrices(market: GoodsMarket, supply: Record<string, number>, content: Content, cfg: SimConfig): void {
  const a = cfg.goodsSupplyEmaRate;
  let ratioSum = 0, n = 0;
  for (const g of content.goods.all()) {
    const s = supply[g.id] ?? 0;
    const prevAvg = market.avgSupply[g.id];
    const avg = prevAvg === undefined ? s : prevAvg * (1 - a) + s * a;
    market.avgSupply[g.id] = avg;
    market.supply[g.id] = s;
    // Scarcity ratio: avg ÷ today. >1 when today's make is below the norm (scarce → dearer); <1 on a
    // glut. With no make at all (s≈0) but a real norm, it pins to the ceiling (genuinely scarce).
    const ratio = avg <= 1e-6 ? 1 : avg / Math.max(s, 1e-6);
    const target = clamp(g.value * ratio, g.value * cfg.goodsPriceMinMult, g.value * cfg.goodsPriceMaxMult);
    const cur = market.prices[g.id] ?? g.value;
    market.prices[g.id] = clamp(cur + (target - cur) * cfg.goodsPriceAdjustRate, g.value * cfg.goodsPriceMinMult, g.value * cfg.goodsPriceMaxMult);
    ratioSum += market.prices[g.id] / g.value;   // price÷base, the demand signal for the business layer (M36 s2)
    n++;
  }
  // The town-wide demand index: goods broadly dear (>1) ⇒ production lags demand ⇒ trades earn more;
  // a glut (<1) ⇒ they earn less. Mean ≈ 1 (the prices self-centre), so the baseline economy holds.
  market.demandIndex = n > 0 ? ratioSum / n : 1;
}
