// Landlords & rent (M11 slice 2): a homeless adult who can find a landlord with a spare
// home shelters there for a daily rent — so owning several homes becomes a real income,
// not just a label, and a rented roof spares the tenant the homeless mood penalty (a roof
// is a roof). Deterministic (matched in a fixed order, no RNG); runs daily after the
// BuildSystem so home ownership is settled first.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_WALLET, C_HOME, C_CLOCK } from '../components.ts';
import type { Agent, Wallet, Home, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import { earn, spend } from '../economy.ts';

export function runRentSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  // Homes owned per living agent → a landlord's spare capacity (homes beyond the one they live in).
  const owned = new Map<EntityId, number>();
  for (const e of world.query(C_HOME)) {
    const owner = world.getComponent<Home>(e, C_HOME)!.owner;
    if (world.hasComponent(owner, C_AGENT)) owned.set(owner, (owned.get(owner) ?? 0) + 1);
  }
  const spare = new Map<EntityId, number>();
  for (const [owner, n] of owned) if (n >= 2) spare.set(owner, n - 1);   // they live in one; the rest are to let

  const agents = world.query(C_AGENT, C_WALLET);
  const adult = (e: EntityId) => ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg) >= cfg.adultAgeYears;

  // Keep valid tenancies (landlord still a landlord with room; tenant still a homeless adult),
  // reserving their slot; drop the rest.
  for (const e of agents) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const lord = agent.rentsFrom;
    if (lord === undefined) continue;
    const room = spare.get(lord) ?? 0;
    if (room > 0 && world.hasComponent(lord, C_AGENT) && (owned.get(e) ?? 0) === 0 && adult(e)) {
      spare.set(lord, room - 1);
    } else {
      agent.rentsFrom = undefined;
    }
  }

  // Place still-homeless adults into any remaining spare homes (deterministic order).
  for (const e of agents) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (agent.rentsFrom !== undefined || (owned.get(e) ?? 0) > 0 || !adult(e)) continue;
    let chosen: EntityId | undefined;
    for (const [lord, room] of spare) if (room > 0) { chosen = lord; break; }
    if (chosen === undefined) break;            // no rooms left anywhere
    agent.rentsFrom = chosen;
    spare.set(chosen, (spare.get(chosen) ?? 0) - 1);
  }

  // Settle the day's rent: each tenant pays their landlord. Debt stays capped at maxDebt
  // (the cost-of-living clamp lives in EconomySystem, which runs earlier — rent must honour
  // the same ceiling, or a maxed-out tenant would tick one past it).
  for (const e of agents) {
    const lord = world.getComponent<Agent>(e, C_AGENT)!.rentsFrom;
    if (lord === undefined || !world.hasComponent(lord, C_WALLET)) continue;
    const tenantWallet = world.getComponent<Wallet>(e, C_WALLET)!;
    spend(tenantWallet, cfg.rentPerDay);
    if (tenantWallet.debt > cfg.maxDebt) tenantWallet.debt = cfg.maxDebt;
    earn(world.getComponent<Wallet>(lord, C_WALLET)!, cfg.rentPerDay);
  }
}
