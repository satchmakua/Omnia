// Land caravans & territory (M31 slice 2). Friendly mainland clans run trade caravans between their
// seats — overland, the counterpart to M25's sea trade. **Diplomacy shapes it** (the deferred half of
// the s1 "shape war/trade" bullet): allies trade richest, the merely cordial less, and rivals or open
// enemies not at all; a route can only span so far overland. Both clans' coffers — held by their
// leaders — gain, for trade is positive-sum. Paced and gold-only, so it draws **no sim RNG** (a
// deterministic hash decides which friendly pair trades each interval) and the predator-prey balance
// is left untouched.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_WALLET, C_CLOCK } from '../components.ts';
import type { Agent, Wallet, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { getOrgStore, areAtWar, areRivals, standingBetween, inSameRealm, pairKey } from '../../org/orgStore.ts';
import { earn } from '../economy.ts';
import { emitEvent } from '../../history/eventlog.ts';

// FNV-1a over a pair key + interval index → a deterministic per-pair, per-interval roll.
function hash(s: string, n: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= n; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}

export function runCaravanSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;
  const day = Math.floor(clock.tick / cfg.ticksPerDay);
  if (day % cfg.caravanIntervalDays !== 0) return;
  const interval = Math.floor(day / cfg.caravanIntervalDays);

  const store = getOrgStore(world);
  if (!store) return;

  // Living mainland clans (with folk + a seat) are the trade nodes.
  const membersByOrg = new Map<string, EntityId[]>();
  for (const e of world.query(C_AGENT)) {
    const id = world.getComponent<Agent>(e, C_AGENT)!.orgId;
    if (id) { const arr = membersByOrg.get(id); if (arr) arr.push(e); else membersByOrg.set(id, [e]); }
  }
  const clans = Object.values(store.byId).filter(o => !o.extinct && !o.overseas && o.seat && (membersByOrg.get(o.id)?.length ?? 0) > 0);
  if (clans.length < 2) return;

  // The profit accrues to a *caravaneer* — a deterministically-rotated member, not always the head —
  // so trade spreads its prosperity through the clan rather than gilding one hoarder.
  const earnToCaravaneer = (orgId: string, amount: number, salt: number): void => {
    const mem = membersByOrg.get(orgId);
    if (!mem || !mem.length) return;
    const who = mem[hash(orgId, interval * 31 + salt) % mem.length];
    const w = world.getComponent<Wallet>(who, C_WALLET); if (w) earn(w, amount);
  };

  for (let i = 0; i < clans.length; i++) for (let j = i + 1; j < clans.length; j++) {
    const a = clans[i], b = clans[j];
    if (areAtWar(store, a.id, b.id) || areRivals(store, a.id, b.id)) continue;   // no caravans to an enemy's gate
    // Realm-mates (a lord & its vassals) keep an internal trade; otherwise the standing must be warm.
    const standing = inSameRealm(store, a.id, b.id) ? 0.5 : standingBetween(store, a.id, b.id);
    if (standing < 0) continue;
    const dx = Math.abs(a.seat!.x - b.seat!.x), dy = Math.abs(a.seat!.y - b.seat!.y);
    if (Math.max(dx, dy) > cfg.caravanMaxDistance) continue;                     // too far for an overland route
    // Paced (deterministic): a given friendly pair runs a caravan only a share of intervals.
    if ((hash(pairKey(a.id, b.id), interval) % 1000) / 1000 >= cfg.caravanChancePerInterval) continue;
    const gain = Math.round(cfg.caravanProfit * (1 + standing));                 // the warmer the bond, the richer the trade
    earnToCaravaneer(a.id, gain, 1); earnToCaravaneer(b.id, gain, 2);
    if (standing >= 0.3) emitEvent(world, 'work', `A caravan of the ${a.name} traded with the ${b.name}.`);   // announce the notable (warm) routes
  }
}
