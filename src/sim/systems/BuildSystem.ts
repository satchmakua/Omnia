// Homes & property (M11 slice 1): settled adults build and own homes from their savings,
// so the town visibly grows over the generations. A home is a static entity (no brain).
// Gold is the cost — an abstraction of the labour & materials a gathering economy turns
// out — which doubles as a real wealth sink, giving gold a purpose beyond hoarding (and
// nudging the Gini down, D39). Runs once a day, after wages/upkeep settle. Deterministic:
// placement is an outward scan, no RNG. A home whose owner has died falls to ruin (bounded;
// inheritance is a slice-2 refinement).
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_WALLET, C_HOME, C_BUSINESS, C_POSITION, C_CLOCK, C_TILEMAP, C_TOMBSTONE,
} from '../components.ts';
import type { Agent, Wallet, Home, Position, Clock, Tombstone } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import { spend } from '../economy.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { remember } from '../../ai/memory.ts';
import { isPassable, inBounds } from '../../world/tilemap.ts';
import type { TileMapData } from '../../world/tilemap.ts';

// Search outward (expanding square rings) from (cx,cy) for the first in-bounds, passable
// tile not already holding a building. Deterministic — fixed scan order, no RNG.
function findHomeSite(
  map: TileMapData, occupied: Set<number>, w: number, cx: number, cy: number,
): { x: number; y: number } | null {
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // ring perimeter only
        const x = cx + dx, y = cy + dy;
        if (!inBounds(map, x, y) || !isPassable(map, x, y)) continue;
        if (occupied.has(y * w + x)) continue;
        return { x, y };
      }
    }
  }
  return null;
}

export function runBuildSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day
  const mapEnts = world.query(C_TILEMAP);
  if (!mapEnts.length) return;
  const map = world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP)!;
  const W = cfg.gridWidth;
  const tick = clock.tick;

  // Tiles already holding a building (so homes don't stack on workplaces or each other).
  const occupied = new Set<number>();
  for (const e of world.query(C_BUSINESS, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    occupied.add(p.y * W + p.x);
  }

  // Tally what the living own; set aside homes whose owner has died (orphans).
  const owned = new Map<EntityId, number>();
  const orphans: EntityId[] = [];
  for (const e of world.query(C_HOME, C_POSITION)) {
    const home = world.getComponent<Home>(e, C_HOME)!;
    if (world.hasComponent(home.owner, C_AGENT)) {
      owned.set(home.owner, (owned.get(home.owner) ?? 0) + 1);
      const p = world.getComponent<Position>(e, C_POSITION)!;
      occupied.add(p.y * W + p.x);
    } else {
      orphans.push(e);
    }
  }

  // Inheritance (M11 slice 2): a home outliving its owner passes to a living child who has
  // no home of their own — the family seat, kept down the line — and falls to ruin only when
  // there's no such heir. Homes thus run in families AND stay bounded (each agent's total is
  // capped by the escalating build cost, so the count can't grow without limit).
  for (const e of orphans) {
    const home = world.getComponent<Home>(e, C_HOME)!;
    const tomb = world.getComponent<Tombstone>(home.owner, C_TOMBSTONE);
    const heir = tomb?.children.find(c => world.hasComponent(c, C_AGENT) && (owned.get(c) ?? 0) === 0);
    if (heir === undefined) { world.destroyEntity(e); continue; }
    home.owner = heir;
    owned.set(heir, 1);
    const p = world.getComponent<Position>(e, C_POSITION)!;
    occupied.add(p.y * W + p.x);
    emitEvent(world, 'work', `${world.getComponent<Agent>(heir, C_AGENT)!.name} inherited the family home.`);
    remember(world, heir, tick, 'inherited the family home', 0.55);
  }

  // A settled adult with the means builds a home where they stand. The cost escalates with
  // each home owned, so most folk own one and only the wealthy own several (emergent landlords).
  for (const e of world.query(C_AGENT, C_WALLET, C_POSITION)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;   // children don't build
    const have = owned.get(e) ?? 0;
    const wallet = world.getComponent<Wallet>(e, C_WALLET)!;
    if (wallet.gold < cfg.homeCost * (have + 1)) continue;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    const site = findHomeSite(map, occupied, W, p.x, p.y);
    if (!site) continue;

    spend(wallet, cfg.homeCost);
    const h = world.createEntity();
    world.addComponent<Position>(h, C_POSITION, { x: site.x, y: site.y });
    world.addComponent<Home>(h, C_HOME, { owner: e, builtTick: tick });
    occupied.add(site.y * W + site.x);
    owned.set(e, have + 1);
    const what = have === 0 ? 'built a home' : 'built another home';
    emitEvent(world, 'work', `${agent.name} ${what}.`);
    remember(world, e, tick, what, 0.5);
  }
}
