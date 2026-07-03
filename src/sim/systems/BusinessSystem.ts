// Business turnover (M15 slice 2b · M36 slice 3). A business lives on its balance minus a fixed daily
// operating cost, so one that isn't earning its keep drains and — past a grace period — folds; and a new
// one opens where demand is unmet. FOOD works this way since M15 (real market sales); M36 s3 extends the
// same fold/found to the NON-FOOD productive trades, driven by the goods market: a chronically insolvent,
// idle trade folds, and a new business opens in whatever trade's own goods are dearest. The food arm is
// left byte-identical (its own numbers), and the SPECIAL trades — healer houses (population-scaled &
// staffed-first, M30) and the rare aptitude mage — are exempt from both fold and found. Runs once a day.
// At most ONE founding per day total (food OR trade), through the single findPassableTile(rng) draw the
// food path already made — so a seed still replays identically (no new/reordered RNG on a founding day).
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
import { scarcestTradeProfession } from '../goodsMarket.ts';
import { spawnBusiness } from '../../world/spawn.ts';
import { emitEvent } from '../../history/eventlog.ts';

// A non-food, non-special trade: subject to the M36 s3 fold/found arm. Food keeps its own arm; healer
// houses (tends) and the rare aptitude mage (requiresAptitude) are protected — never folded or founded.
const isTrade = (b: Business): boolean => !b.producesFood && !b.tends && !b.requiresAptitude;

export function runBusinessSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  // Staff per business — ALL employers now (M36 s3): the trade fold/found arm needs the full count
  // (a farm-only tally as before would leave trades looking permanently empty).
  const staff = new Map<EntityId, number>();
  for (const e of world.query(C_AGENT, C_JOB)) {
    const j = world.getComponent<Job>(e, C_JOB)!;
    staff.set(j.employer, (staff.get(j.employer) ?? 0) + 1);
  }

  // ── Food: overhead + bankruptcy (M15, unchanged) ──
  let foodCount = 0;
  let allFarmsFull = true;   // are all surviving farms fully staffed? (vacuously true if none)
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
    if ((staff.get(e) ?? 0) < b.maxEmployees) allFarmsFull = false;
  }

  // ── Trades: overhead + bankruptcy (M36 s3) ──
  // Surviving count per profession, so the last business of any craft is never folded (a floor).
  const perProf = new Map<string, number>();
  for (const e of world.query(C_BUSINESS)) {
    const b = world.getComponent<Business>(e, C_BUSINESS)!;
    if (isTrade(b)) perProf.set(b.professionId, (perProf.get(b.professionId) ?? 0) + 1);
  }
  // Accumulate what the founding step needs in this same fold pass (one pass, like the food arm): the
  // per-profession floor sees each fold's decrement as we iterate, and `profFull` is built over the
  // survivors so founding can check "is this trade already full?" without a second query.
  const profFull = new Map<string, boolean>();   // professionId → all its surviving businesses are full
  for (const e of world.query(C_BUSINESS)) {
    const b = world.getComponent<Business>(e, C_BUSINESS)!;
    if (!isTrade(b)) continue;
    b.balance -= cfg.tradeOperatingCostPerDay;
    b.lowFundsDays = b.balance < cfg.bankruptcyThreshold ? (b.lowFundsDays ?? 0) + 1 : 0;
    const overGrace = (b.lowFundsDays ?? 0) > cfg.tradeGraceDays;
    const idle = (staff.get(e) ?? 0) <= cfg.tradeIdleFoldStaff;
    const notLast = (perProf.get(b.professionId) ?? 0) > cfg.minTradesPerProfession;
    if (overGrace && idle && notLast) {
      emitEvent(world, 'work', `A ${b.professionName.toLowerCase()} folded — it could not make ends meet.`);
      perProf.set(b.professionId, (perProf.get(b.professionId) ?? 1) - 1);
      world.destroyEntity(e);
      continue;
    }
    if (overGrace) b.lowFundsDays = 0;   // spared (staffed, or the last of its craft) — fresh grace clock
    const full = (staff.get(e) ?? 0) >= b.maxEmployees;
    profFull.set(b.professionId, (profFull.get(b.professionId) ?? true) && full);
  }

  // ── Founding: at most ONE per day total (food OR trade), one findPassableTile(rng) draw ──
  const tmEnts = world.query(C_TILEMAP);
  const mEnts = world.query(C_MARKET);
  if (!tmEnts.length || !mEnts.length) return;                 // founding needs the map + market (folding above did not)
  const tileMap = world.getComponent<TileMapData>(tmEnts[0], C_TILEMAP)!;
  const market = world.getComponent<Market>(mEnts[0], C_MARKET)!;

  // Food first (M15 trigger, unchanged): a new farm when food is dear and the farms are full.
  const farmSupply = farmSupplyOf(market.supply, cfg, seasonGrowthFactor(clock.tick, cfg));
  if (farmSupply < market.demand && allFarmsFull && foodCount < cfg.maxFarms) {
    const def = content.professions.all().find(p => p.producesFood);
    if (def) {
      const { x, y } = findPassableTile(rng, tileMap);
      spawnBusiness(world, x, y, def, cfg);
      emitEvent(world, 'work', `A new ${def.name.toLowerCase()} opened — food is dear.`);
    }
    return;   // one founding per day
  }

  // Otherwise a trade whose own goods are dearest — if that trade is full and under the caps (M36 s3).
  const tradeCount = [...perProf.values()].reduce((a, c) => a + c, 0);
  if (tradeCount >= cfg.maxTradeBusinesses) return;
  const scarce = scarcestTradeProfession(world, content);
  if (!scarce || scarce.ratio < cfg.tradeFoundScarcityRatio) return;
  if ((perProf.get(scarce.professionId) ?? 0) >= cfg.maxPerTradeProfession) return;
  if (!(profFull.get(scarce.professionId) ?? true)) return;   // grow into an existing vacancy first
  const def = content.professions.all().find(p => p.id === scarce.professionId);
  if (!def) return;
  const { x, y } = findPassableTile(rng, tileMap);
  spawnBusiness(world, x, y, def, cfg);
  emitEvent(world, 'work', `A new ${def.name.toLowerCase()} opened — its wares are dear.`);
}
