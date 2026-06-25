// The staple-goods market (M15): one price for a day's provisions, floating with supply
// and demand. Supply is what the town actually produces — its farms' workforce plus a
// wild-foraged baseline (the commons). Demand is the adult mouths to feed. The daily cost
// of living (EconomySystem) is this price, so scarcity bites and plenty relieves.
//
// Pure arithmetic over durable state — no RNG, no LLM — so it replays exactly (D5) and
// never perturbs the trajectory beyond the gold it moves.
import { C_MARKET, C_AGENT, C_JOB, C_BUSINESS } from './components.ts';
import type { Market, Agent, Job, Business } from './components.ts';
import type { World, EntityId } from './ecs.ts';
import type { SimConfig } from './config.ts';
import { ageInYears } from './config.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export function createMarket(cfg: SimConfig): Market {
  return { price: cfg.provisionBasePrice, supply: 0, demand: 0, history: [] };
}

export function getMarket(world: World): Market | undefined {
  const ents = world.query(C_MARKET);
  return ents.length ? world.getComponent<Market>(ents[0], C_MARKET) : undefined;
}

// Today's supply and demand. Demand: each adult eats one ration (children are fed as
// dependents — they don't transact, per the Kids Pass). Supply: the rations the town
// produces — its food-workers' output plus the foraged baseline.
export function measureSupplyDemand(world: World, cfg: SimConfig): { supply: number; demand: number } {
  let demand = 0;
  for (const e of world.query(C_AGENT)) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(a.ticksAlive, cfg) >= cfg.adultAgeYears) demand += cfg.provisionPerAdult;
  }
  let foodWorkers = 0;
  for (const e of world.query(C_AGENT, C_JOB)) {
    const j = world.getComponent<Job>(e, C_JOB)!;
    const biz = world.getComponent<Business>(j.employer, C_BUSINESS);
    if (biz?.producesFood) foodWorkers++;
  }
  const supply = cfg.baseForagedProvisions + foodWorkers * cfg.provisionPerFarmer;
  return { supply, demand };
}

// The clearing price: it chases the demand/supply ratio (scaled by the base price — so
// supply == demand targets exactly the base), eased toward that target by `priceAdjustRate`
// so it drifts rather than jumps, and clamped to a sane band that keeps debt bounded.
export function clearingPrice(price: number, supply: number, demand: number, cfg: SimConfig): number {
  const target = clamp(
    cfg.provisionBasePrice * (demand / Math.max(supply, 1e-6)),
    cfg.provisionPriceMin, cfg.provisionPriceMax,
  );
  return clamp(price + (target - price) * cfg.priceAdjustRate, cfg.provisionPriceMin, cfg.provisionPriceMax);
}

// The gold households spend on FARM-produced food in a day (M15 slice 2): they buy the
// farms' output at the market price, but never more rations than are actually eaten — so an
// over-supplied glut leaves farms with unsold output (and thin revenue). The foraged commons
// is self-gathered, so no business earns from it.
export function foodSalesGold(supply: number, demand: number, price: number, cfg: SimConfig): number {
  const farmSupply = Math.max(0, supply - cfg.baseForagedProvisions);
  return Math.min(farmSupply, demand) * price;
}

// Workers employed at each food-producing business, and the total across them all.
export function foodBusinessWorkers(world: World): { byBiz: Map<EntityId, number>; total: number } {
  const byBiz = new Map<EntityId, number>();
  let total = 0;
  for (const e of world.query(C_AGENT, C_JOB)) {
    const j = world.getComponent<Job>(e, C_JOB)!;
    const biz = world.getComponent<Business>(j.employer, C_BUSINESS);
    if (biz?.producesFood) { byBiz.set(j.employer, (byBiz.get(j.employer) ?? 0) + 1); total++; }
  }
  return { byBiz, total };
}
