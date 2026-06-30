// Goods → gold (M25 slice 2, M36 s1): the crafting chain no longer dead-ends. Once a day, an agent
// sells the crafted goods in their bag for gold at a fraction of each good's MARKET price — which now
// floats with supply (GoodsMarketSystem): a glut of planks fetches less, a scarce blade more. So
// gathering→crafting feeds wealth, a skilled artisan prospers, and oversupply has a real cost.
// Wares & tools are sold off entirely; weapons & armour are sold only in SURPLUS (one of each is
// kept for combat, which the EquipSystem reads). Raw materials (timber/ore/crystal) aren't goods,
// so they stay in the bag for crafting. Deterministic (no RNG); gold is bounded by what's made.
import type { World } from '../ecs.ts';
import { C_AGENT, C_INVENTORY, C_WALLET, C_CLOCK } from '../components.ts';
import type { Inventory, Wallet, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import { itemCount, takeItem, qualityOf } from '../inventory.ts';
import { qualityValueMultiplier } from '../quality.ts';
import { getGoodsMarket, goodsPriceOf } from '../goodsMarket.ts';
import { earn } from '../economy.ts';

const SELL_RATE = 0.5;   // crafters realise half a good's listed value at sale (friction/margin)

export function runTradeSystem(world: World, cfg: SimConfig, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once a day

  const goods = content.goods.all();
  if (goods.length === 0) return;
  const market = getGoodsMarket(world);   // floating per-good prices (M36); falls back to base value if absent

  for (const e of world.query(C_AGENT, C_INVENTORY, C_WALLET)) {
    const inv = world.getComponent<Inventory>(e, C_INVENTORY)!;
    let earned = 0;
    for (const g of goods) {
      const have = itemCount(inv, g.id);
      if (have <= 0) continue;
      // Keep one weapon & one piece of armour for one's own defence; everything else is for sale.
      const keep = (g.category === 'weapon' || g.category === 'armour') ? 1 : 0;
      const sell = have - keep;
      if (sell <= 0) continue;
      // The day's market price (supply-driven, M36) × quality (a finer good fetches more, M33).
      const tier = qualityOf(inv, g.id);
      const price = goodsPriceOf(market, g.id, g.value);
      const worth = price * (tier >= 0 ? qualityValueMultiplier(tier) : 1);
      if (takeItem(inv, g.id, sell)) earned += worth * sell * SELL_RATE;
    }
    if (earned > 0) earn(world.getComponent<Wallet>(e, C_WALLET)!, earned);
  }
}
