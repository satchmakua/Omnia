// Archaeology (M20 s2b): the past leaves marks on the land. Once a day this system (1) raises a
// **ruin** for any newly-fallen clan, and a **cairn** for any newly-lost relic, on a free tile;
// and (2) lets a wandering folk **discover** a nearby undiscovered site — entering it into the
// histories, and (for a cairn) **rediscovering** its lost relic. Ruins are static markers (no
// behaviour), and placement/discovery use a deterministic tile scan + proximity (no RNG), so the
// sim trajectory is unperturbed. Bounded: the oldest *discovered* ruins prune.
import type { World, EntityId } from '../ecs.ts';
import {
  C_RUIN, C_AGENT, C_POSITION, C_TILEMAP, C_BUSINESS, C_HOME, C_CIVIC, C_CLOCK, C_CHRONICLE, C_ARTIFACTS,
} from '../components.ts';
import type { Ruin, Agent, Position, Clock, ArtifactsData } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { isPassable, inBounds } from '../../world/tilemap.ts';
import { getOrgStore } from '../../org/orgStore.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const RUIN_CAP = 24;
const DISCOVER_RADIUS = 2;

// First free, passable, un-built tile spiralling out from the map centre (deterministic).
function freeTile(map: TileMapData, occupied: Set<number>): { x: number; y: number } | null {
  const cx = Math.floor(map.width / 2), cy = Math.floor(map.height / 2);
  const limit = Math.max(map.width, map.height);
  for (let r = 0; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (!inBounds(map, x, y) || !isPassable(map, x, y)) continue;
      if (occupied.has(y * map.width + x)) continue;
      return { x, y };
    }
  }
  return null;
}

export function runArchaeologySystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // daily
  const tick = clock.tick;
  const mapEnts = world.query(C_TILEMAP);
  if (!mapEnts.length) return;
  const map = world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP)!;
  const W = map.width;

  // Tiles already holding a building or ruin (so sites don't stack).
  const occupied = new Set<number>();
  for (const c of [C_BUSINESS, C_HOME, C_CIVIC, C_RUIN]) {
    for (const e of world.query(c, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      occupied.add(p.y * W + p.x);
    }
  }
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
  const place = (what: string, relicName?: string): boolean => {
    if (world.query(C_RUIN).length >= RUIN_CAP) return false;
    const spot = freeTile(map, occupied);
    if (!spot) return false;
    const e = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, { x: spot.x, y: spot.y });
    world.addComponent<Ruin>(e, C_RUIN, { what, discovered: false, sinceTick: tick, relicName });
    occupied.add(spot.y * W + spot.x);
    return true;
  };

  // ── Raise ruins for the newly fallen ──
  const store = getOrgStore(world);
  if (store) for (const o of Object.values(store.byId)) {
    if (o.extinct && !o.ruined) { if (place(`the ruins of the ${o.name}`)) o.ruined = true; }
  }
  const artEnts = world.query(C_ARTIFACTS);
  const arts = artEnts.length ? world.getComponent<ArtifactsData>(artEnts[0], C_ARTIFACTS) : undefined;
  if (arts) for (const a of arts.artifacts) {
    if (a.lost && !a.ruined && !a.rediscoveredTick) { if (place(`a cairn where ${a.name} was lost`, a.name)) a.ruined = true; }
  }

  // ── Discovery: a wandering adult uncovers a nearby undiscovered site ──
  const folkAt = new Map<number, EntityId>();
  for (const e of world.query(C_AGENT, C_POSITION)) {
    if (ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg) < cfg.adultAgeYears) continue;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    folkAt.set(p.y * W + p.x, e);
  }
  for (const e of world.query(C_RUIN, C_POSITION)) {
    const ruin = world.getComponent<Ruin>(e, C_RUIN)!;
    if (ruin.discovered) continue;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    let finder: EntityId | undefined;
    for (let dy = -DISCOVER_RADIUS; dy <= DISCOVER_RADIUS && finder === undefined; dy++)
      for (let dx = -DISCOVER_RADIUS; dx <= DISCOVER_RADIUS && finder === undefined; dx++) {
        const f = folkAt.get((p.y + dy) * W + (p.x + dx));
        if (f !== undefined) finder = f;
      }
    if (finder === undefined) continue;
    ruin.discovered = true;
    ruin.discoveredTick = tick;
    const name = world.getComponent<Agent>(finder, C_AGENT)!.name;
    emitEvent(world, 'culture', `${name} uncovered ${ruin.what}.`, { x: p.x, y: p.y });
    if (ch) chronicleAdd(ch, { tick, importance: 0.78, kind: 'ruin', text: `${name} uncovered ${ruin.what}.` }, cfg.chronicleImportanceThreshold);
    // A cairn yields its relic, rediscovered.
    if (ruin.relicName && arts) {
      const relic = arts.artifacts.find(a => a.name === ruin.relicName && a.lost);
      if (relic) { relic.lost = false; relic.rediscoveredTick = tick; relic.deeds = `${relic.deeds} · rediscovered yr ${Math.floor(tick / (cfg.ticksPerDay * cfg.daysPerYear))}`; }
    }
  }

  // ── Bound the world: drop the oldest discovered ruins beyond the cap ──
  const ruins = world.query(C_RUIN, C_POSITION);
  if (ruins.length > RUIN_CAP) {
    const discovered = ruins.filter(e => world.getComponent<Ruin>(e, C_RUIN)!.discovered)
      .sort((a, b) => (world.getComponent<Ruin>(a, C_RUIN)!.discoveredTick ?? 0) - (world.getComponent<Ruin>(b, C_RUIN)!.discoveredTick ?? 0));
    for (const e of discovered) { if (world.query(C_RUIN).length <= RUIN_CAP) break; world.destroyEntity(e); }
  }
}
