// The staple-goods market (M15), updated once a day before the economy charges the cost
// of living. Reads the town's supply (food-workers + foraged baseline) and demand (adult
// mouths) and eases the provisions price toward the clearing target, keeping a bounded
// price history for the chart. Pure arithmetic — no RNG.
import type { World } from '../ecs.ts';
import { C_CLOCK, C_BUSINESS } from '../components.ts';
import type { Clock, Business } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { seasonGrowthFactor } from '../config.ts';
import {
  getMarket, measureSupplyDemand, clearingPrice, foodSalesGold, foodBusinessWorkers,
} from '../market.ts';

export function runMarketSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  const market = getMarket(world);
  if (!market) return;

  // The seasonal commons: a lean winter shrinks the foraged baseline → food gets dear;
  // a lush summer relieves it (M19). Same factor that drives plant growth, so they agree.
  const forage = seasonGrowthFactor(clock.tick, cfg);
  const { supply, demand } = measureSupplyDemand(world, cfg, forage);
  market.supply = supply;
  market.demand = demand;
  market.price = clearingPrice(market.price, supply, demand, cfg);
  market.history.push(market.price);
  if (market.history.length > cfg.marketHistoryLength) market.history.shift();

  // Real sales (M15 slice 2): the day's farm-food spend flows to the food businesses,
  // split by their workforce. This is their *only* revenue (EconomySystem withholds the
  // synthetic per-worker revenue from food producers), so a farm lives or dies by demand.
  const sales = foodSalesGold(supply, demand, market.price, cfg, forage);
  if (sales > 0) {
    const { byBiz, total } = foodBusinessWorkers(world);
    if (total > 0) {
      for (const [biz, workers] of byBiz) {
        const b = world.getComponent<Business>(biz, C_BUSINESS);
        if (b) b.balance += sales * (workers / total);
      }
    }
  }
}
