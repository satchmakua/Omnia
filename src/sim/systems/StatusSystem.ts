// Social standing (M14's deferred class/reputation thread). Once a day it recomputes every
// agent's `standing` (0..1 esteem) from durable state — leadership, landholding, valour,
// wealth, infamy, debt — so reputation tracks the life actually lived. Deterministic, a pure
// read of state (no RNG). Standing then drives social class (a display reading) and warms how
// readily others seek one's company (SocialSystem, D26). Runs after MoodSystem.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_WALLET, C_HOME, C_COMBAT, C_CRIME, C_CLOCK } from '../components.ts';
import type { Agent, Wallet, Home, Combat, Crime, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { getOrgStore } from '../../org/orgStore.ts';
import { computeStanding, crimeWeight } from '../society.ts';

export function runStatusSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  // Homes owned per agent (one pass → O(1) per agent).
  const homesOwned = new Map<EntityId, number>();
  for (const e of world.query(C_HOME)) {
    const owner = world.getComponent<Home>(e, C_HOME)!.owner;
    homesOwned.set(owner, (homesOwned.get(owner) ?? 0) + 1);
  }
  // Tribe leaders.
  const store = getOrgStore(world);
  const leaders = new Set<EntityId>();
  if (store) for (const o of Object.values(store.byId)) if (o.leader != null) leaders.add(o.leader);

  for (const e of world.query(C_AGENT)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const w = world.getComponent<Wallet>(e, C_WALLET);
    const cmb = world.getComponent<Combat>(e, C_COMBAT);
    const crm = world.getComponent<Crime>(e, C_CRIME);
    agent.standing = computeStanding({
      gold: w?.gold ?? 0,
      debt: w?.debt ?? 0,
      kills: cmb?.kills ?? 0,
      homesOwned: homesOwned.get(e) ?? 0,
      crimes: crm ? crimeWeight(crm.thefts, crm.assaults, crm.murders) : 0,
      isLeader: leaders.has(e),
    });
  }
}
