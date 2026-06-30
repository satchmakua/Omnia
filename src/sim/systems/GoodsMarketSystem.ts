// The crafted-goods market, updated once a day BEFORE the TradeSystem sells (so goods clear at the
// day's price). Reads the town's supply of each good and eases its price toward the self-calibrating
// clearing target (goodsMarket.ts). Pure arithmetic — no RNG — so it replays exactly. (M36 s1)
import type { World } from '../ecs.ts';
import { C_CLOCK } from '../components.ts';
import type { Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import { getGoodsMarket, measureGoodsSupply, updateGoodsPrices } from '../goodsMarket.ts';

export function runGoodsMarketSystem(world: World, cfg: SimConfig, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  const market = getGoodsMarket(world);
  if (!market) return;
  if (content.goods.all().length === 0) return;

  const supply = measureGoodsSupply(world, content);
  updateGoodsPrices(market, supply, content, cfg);
}
