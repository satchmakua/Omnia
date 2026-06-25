// The staple-goods market (M15), updated once a day before the economy charges the cost
// of living. Reads the town's supply (food-workers + foraged baseline) and demand (adult
// mouths) and eases the provisions price toward the clearing target, keeping a bounded
// price history for the chart. Pure arithmetic — no RNG.
import type { World } from '../ecs.ts';
import { C_CLOCK } from '../components.ts';
import type { Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { getMarket, measureSupplyDemand, clearingPrice } from '../market.ts';

export function runMarketSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  const market = getMarket(world);
  if (!market) return;

  const { supply, demand } = measureSupplyDemand(world, cfg);
  market.supply = supply;
  market.demand = demand;
  market.price = clearingPrice(market.price, supply, demand, cfg);
  market.history.push(market.price);
  if (market.history.length > cfg.marketHistoryLength) market.history.shift();
}
