// Inter-settlement trade & first contact (M25 s3). Once the town can sail (the Seafaring tech),
// a merchant sets out across the sea to the island settlement: the MovementSystem carries them
// there (a Voyage), and on arrival this system makes **first contact** (a legend, once) and runs
// a **trade** — the merchant profits and the island folk prosper a little too. Thereafter trade
// runs continue at a trickle (a living sea-route). One voyage at a time, so the mainland economy
// barely notices. Deterministic but for the small RNG that paces the trade runs.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_JOB, C_POSITION, C_WALLET, C_VOYAGE, C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Agent, Job, Position, Wallet, Voyage, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import type { RNG } from '../rng.ts';
import { getOrgStore } from '../../org/orgStore.ts';
import { earn } from '../economy.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const CONTACT_RADIUS = 2;       // a voyager this close to the island folk has made landfall
const VOYAGE_PROFIT = 18;       // gold a merchant brings home from a successful trade run
const ISLAND_TRADE_GAIN = 6;    // gold each island household gains from the trade
const TRADE_RUN_CHANCE = 0.08;  // daily chance of a fresh trade run once the route is known

export function runVoyageSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  const store = getOrgStore(world);
  if (!store) return;
  // Arrival is checked EVERY tick (so a voyager isn't missed as it & the islanders move); a new
  // voyage is only DISPATCHED once a day. Nothing to do if neither applies.
  const daily = clock.tick > 0 && clock.tick % cfg.ticksPerDay === 0;
  if (world.query(C_VOYAGE).length === 0 && !daily) return;

  // The overseas settlements + the folk that make them up.
  const overseas = new Map<string, EntityId[]>();
  let mainlandSeafaring = false;
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const orgId = world.getComponent<Agent>(e, C_AGENT)!.orgId;
    if (!orgId) continue;
    const org = store.byId[orgId];
    if (!org) continue;
    if (org.overseas) { const arr = overseas.get(orgId) ?? []; arr.push(e); overseas.set(orgId, arr); }
    else if ((org.effects?.seafaring ?? 0) > 0) mainlandSeafaring = true;
  }
  if (overseas.size === 0 || !mainlandSeafaring) return;   // nowhere to sail, or no boats yet

  const centroid = (members: EntityId[]): Position => {
    let sx = 0, sy = 0;
    for (const m of members) { const p = world.getComponent<Position>(m, C_POSITION)!; sx += p.x; sy += p.y; }
    return { x: Math.round(sx / members.length), y: Math.round(sy / members.length) };
  };
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0] ?? -1, C_CHRONICLE);

  // ── Arrival: a voyager who has reached the island makes contact + trades, then heads home. ──
  const voyagers = world.query(C_VOYAGE, C_AGENT, C_POSITION);
  for (const e of voyagers) {
    const v = world.getComponent<Voyage>(e, C_VOYAGE)!;
    const members = overseas.get(v.orgId);
    if (!members || members.length === 0) { world.removeComponent(e, C_VOYAGE); continue; }   // settlement gone
    const p = world.getComponent<Position>(e, C_POSITION)!;
    // Home in on the nearest islander (they roam the isle, so a fixed point would be missed).
    let nearest: Position | null = null, nd = Infinity;
    for (const m of members) {
      const mp = world.getComponent<Position>(m, C_POSITION)!;
      const d = Math.max(Math.abs(mp.x - p.x), Math.abs(mp.y - p.y));
      if (d < nd) { nd = d; nearest = mp; }
    }
    if (nd > CONTACT_RADIUS) { if (nearest) { v.tx = nearest.x; v.ty = nearest.y; } continue; }   // sail closer

    const org = store.byId[v.orgId];
    const sailor = world.getComponent<Agent>(e, C_AGENT)!.name;
    if (org && !org.discovered) {
      org.discovered = true;
      emitEvent(world, 'culture', `${sailor} crossed the sea and made contact with the ${org.name}.`);
      if (ch) chronicleAdd(ch, {
        tick: clock.tick, importance: 0.82, kind: 'founding',
        text: `${sailor} crossed the sea — first contact with the ${org!.name}.`,
      }, cfg.chronicleImportanceThreshold);
    } else {
      emitEvent(world, 'work', `${sailor} traded across the sea with the ${org?.name ?? 'island folk'}.`);
    }
    // The trade: the merchant profits, and the island households prosper a little too.
    earn(world.getComponent<Wallet>(e, C_WALLET)!, VOYAGE_PROFIT);
    for (const m of members) { const w = world.getComponent<Wallet>(m, C_WALLET); if (w) earn(w, ISLAND_TRADE_GAIN); }
    world.removeComponent(e, C_VOYAGE);   // voyage done — they sail home and resume their life
  }

  // ── Dispatch (once a day): send one merchant if none is at sea — promptly to an unknown
  //    shore, else a trickle once the route is known. ──
  if (!daily || world.query(C_VOYAGE).length > 0) return;
  let target: { orgId: string; dest: Position } | null = null;
  for (const [orgId, members] of overseas) {
    if (!store.byId[orgId]?.discovered) { target = { orgId, dest: centroid(members) }; break; }   // first contact first
  }
  if (!target) {
    if (rng() >= TRADE_RUN_CHANCE) return;   // known route — only a trickle of trade runs
    const [orgId, members] = [...overseas][0];
    target = { orgId, dest: centroid(members) };
  }

  // The trader: a seafaring mainland adult, a merchant by trade if one can be found.
  let chosen: EntityId | null = null;
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    if (!a.orgId || store.byId[a.orgId]?.overseas || (store.byId[a.orgId]?.effects?.seafaring ?? 0) <= 0) continue;
    if (ageInYears(a.ticksAlive, cfg) < cfg.adultAgeYears) continue;
    if (world.getComponent<Job>(e, C_JOB)?.professionId === 'merchant') { chosen = e; break; }
    if (chosen === null) chosen = e;   // fall back to any seafaring adult
  }
  if (chosen !== null) {
    world.addComponent<Voyage>(chosen, C_VOYAGE, { tx: target.dest.x, ty: target.dest.y, orgId: target.orgId });
  }
}
