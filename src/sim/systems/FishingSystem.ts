// The fishing economy (M24 slice 2): once a day, each coastal fishery nets fish from the
// water around it. Each fisher can land up to CATCH_PER_FISHER fish, but the catch is capped
// by the fish actually present — so an **over-fished** coast yields less, even fully staffed.
// The caught fish are removed (the stock thins; the shoals breed back via FishSystem), and the
// day's total catch (in provisions) is handed to the market as supply (market.fishCatch), read
// by measureSupplyDemand. Runs BEFORE MarketSystem so the catch is fresh. Deterministic (no RNG).
import type { World, EntityId } from '../ecs.ts';
import { C_BUSINESS, C_AGENT, C_JOB, C_FISH, C_POSITION, C_CLOCK } from '../components.ts';
import type { Business, Job, Position, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { getMarket } from '../market.ts';

const CATCH_PER_FISHER = 2;   // fish one fisher can land in a day (in stocked water)
const PROVISION_PER_FISH = 1; // rations one caught fish feeds (so a staffed fishery ≈ a farm)
const REACH = 5;              // how far from the dock the nets reach

export function runFishingSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once a day

  const market = getMarket(world);
  if (!market) return;

  // The fisheries + how many fishers each employs.
  const fisheries: { pos: Position; workers: number }[] = [];
  const byBiz = new Map<EntityId, number>();
  for (const e of world.query(C_AGENT, C_JOB)) {
    const j = world.getComponent<Job>(e, C_JOB)!;
    const biz = world.getComponent<Business>(j.employer, C_BUSINESS);
    if (biz?.fishery) byBiz.set(j.employer, (byBiz.get(j.employer) ?? 0) + 1);
  }
  for (const [biz, workers] of byBiz) {
    const pos = world.getComponent<Position>(biz, C_POSITION);
    if (pos) fisheries.push({ pos, workers });
  }
  if (fisheries.length === 0) { market.fishCatch = 0; return; }

  // The fish available to net (entity + tile), and which have been caught this pass.
  const fish: { e: EntityId; x: number; y: number }[] = [];
  for (const e of world.query(C_FISH, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    fish.push({ e, x: p.x, y: p.y });
  }
  const caught = new Set<EntityId>();
  let totalFish = 0;

  for (const f of fisheries) {
    const want = f.workers * CATCH_PER_FISHER;
    let got = 0;
    for (const fi of fish) {
      if (got >= want) break;
      if (caught.has(fi.e)) continue;
      if (Math.max(Math.abs(fi.x - f.pos.x), Math.abs(fi.y - f.pos.y)) > REACH) continue;
      caught.add(fi.e);
      got++;
    }
    totalFish += got;
  }

  for (const e of caught) world.destroyEntity(e);
  market.fishCatch = totalFish * PROVISION_PER_FISH;
}
