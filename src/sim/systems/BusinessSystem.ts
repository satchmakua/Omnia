// Business turnover (M15 slice 2b). Food businesses live on real market sales (MarketSystem)
// minus a fixed daily operating cost, so a farm that isn't earning its keep drains its balance
// and — past a grace period — folds. When food is scarce AND the existing farms are all full
// (so a new one would actually find workers), a new farm opens, up to a cap. The farm sector
// thus tracks demand: it grows when food is dear and culls its excess when food is cheap.
// Runs once a day, after the economy has settled. Founding consumes RNG (placement).
import type { World, EntityId } from '../ecs.ts';
import { C_CLOCK, C_BUSINESS, C_AGENT, C_JOB, C_TILEMAP, C_MARKET } from '../components.ts';
import type { Clock, Business, Job, Market } from '../components.ts';
import { findPassableTile } from '../../world/tilemap.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import type { SimConfig } from '../config.ts';
import { seasonGrowthFactor } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { farmSupplyOf } from '../market.ts';
import { spawnBusiness } from '../../world/spawn.ts';
import { emitEvent } from '../../history/eventlog.ts';

export function runBusinessSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  // Staff per food business (a full farm won't take new founders).
  const staff = new Map<EntityId, number>();
  for (const e of world.query(C_AGENT, C_JOB)) {
    const j = world.getComponent<Job>(e, C_JOB)!;
    const biz = world.getComponent<Business>(j.employer, C_BUSINESS);
    if (biz?.producesFood) staff.set(j.employer, (staff.get(j.employer) ?? 0) + 1);
  }

  // ── Overhead + bankruptcy: a loss-making farm folds past the grace ──
  let foodCount = 0;
  let allFull = true;   // are all surviving farms fully staffed? (vacuously true if none)
  for (const e of world.query(C_BUSINESS)) {
    const b = world.getComponent<Business>(e, C_BUSINESS)!;
    if (!b.producesFood) continue;
    b.balance -= cfg.farmOperatingCostPerDay;
    b.lowFundsDays = b.balance < cfg.bankruptcyThreshold ? (b.lowFundsDays ?? 0) + 1 : 0;
    if ((b.lowFundsDays ?? 0) > cfg.bankruptcyGraceDays) {
      emitEvent(world, 'work', `A ${b.professionName.toLowerCase()} folded — it could not make ends meet.`);
      world.destroyEntity(e);   // workers' jobs drop next tick (employer no longer alive)
      continue;
    }
    foodCount++;
    if ((staff.get(e) ?? 0) < b.maxEmployees) allFull = false;
  }

  // ── Founding: a new farm when food is dear and the farms that exist are full ──
  const mEnts = world.query(C_MARKET);
  if (!mEnts.length) return;
  const market = world.getComponent<Market>(mEnts[0], C_MARKET)!;
  const farmSupply = farmSupplyOf(market.supply, cfg, seasonGrowthFactor(clock.tick, cfg));
  if (farmSupply >= market.demand || !allFull || foodCount >= cfg.maxFarms) return;

  const def = content.professions.all().find(p => p.producesFood);
  const tmEnts = world.query(C_TILEMAP);
  if (!def || !tmEnts.length) return;
  const tileMap = world.getComponent<TileMapData>(tmEnts[0], C_TILEMAP)!;
  const { x, y } = findPassableTile(rng, tileMap);
  spawnBusiness(world, x, y, def, cfg);
  emitEvent(world, 'work', `A new ${def.name.toLowerCase()} opened — food is dear.`);
}
