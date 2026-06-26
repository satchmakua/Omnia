// Wonders (M20 s3b): the town raises great works. Once a day, if no wonder is under way, it
// begins the next one its tech allows (lowest tier first); otherwise it pours the day's
// collective effort (its workforce) into the current project, and on completion raises a
// **WonderSite** landmark on the map + a monumental Chronicle legend. The sci-fi capstone is the
// space elevator — the fallen world re-ascended. Deterministic (effort = population, no RNG).
import type { World, EntityId } from '../ecs.ts';
import {
  C_WONDERS, C_WONDERSITE, C_CLOCK, C_AGENT, C_CHRONICLE, C_TILEMAP, C_BUSINESS, C_HOME, C_CIVIC, C_RUIN, C_POSITION,
} from '../components.ts';
import type { WondersData, WonderSite, Clock, Position } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { isPassable, inBounds } from '../../world/tilemap.ts';
import { getOrgStore } from '../../org/orgStore.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

export function createWonders(): WondersData {
  return { progress: {}, built: {} };
}

function freeTile(world: World, map: TileMapData): { x: number; y: number } | null {
  const W = map.width;
  const occupied = new Set<number>();
  for (const c of [C_BUSINESS, C_HOME, C_CIVIC, C_RUIN, C_WONDERSITE]) {
    for (const e of world.query(c, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      occupied.add(p.y * W + p.x);
    }
  }
  const cx = Math.floor(map.width / 2), cy = Math.floor(map.height / 2);
  const limit = Math.max(map.width, map.height);
  for (let r = 0; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx, y = cy + dy;
      if (!inBounds(map, x, y) || !isPassable(map, x, y) || occupied.has(y * W + x)) continue;
      return { x, y };
    }
  }
  return null;
}

export function runWonderSystem(world: World, cfg: SimConfig, content: Content): void {
  const ents = world.query(C_WONDERS);
  if (!ents.length) return;
  const data = world.getComponent<WondersData>(ents[0], C_WONDERS)!;
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // daily
  const tick = clock.tick;

  const wonders = [...content.wonders.all()].sort((a, b) => a.minTier - b.minTier);
  if (wonders.length === 0) return;
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);

  // The town's reach = the highest tech tier any living clan has attained.
  const store = getOrgStore(world);
  const curTier = store
    ? Object.values(store.byId).reduce((m, o) => (o.extinct ? m : Math.max(m, o.tier ?? 1)), 1) : 1;
  const pop = world.query(C_AGENT).length;
  if (pop === 0) return;

  // Begin the next eligible wonder if none is under way.
  if (!data.current) {
    const next = wonders.find(w => data.built[w.id] === undefined && w.minTier <= curTier);
    if (!next) return;
    data.current = next.id;
    data.progress[next.id] = data.progress[next.id] ?? 0;
    emitEvent(world, 'culture', `The town set out to raise ${next.name}.`);
  }

  const w = content.wonders.get(data.current);
  if (!w) { data.current = undefined; return; }

  // The day's labour.
  data.progress[w.id] = (data.progress[w.id] ?? 0) + pop;

  // Completion: a landmark rises, and a monumental legend is written.
  if (data.progress[w.id] >= w.cost) {
    data.built[w.id] = tick;
    data.current = undefined;
    const mapEnts = world.query(C_TILEMAP);
    const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP)! : undefined;
    let site: EntityId | undefined;
    if (map) {
      const spot = freeTile(world, map);
      if (spot) {
        site = world.createEntity();
        world.addComponent<Position>(site, C_POSITION, { x: spot.x, y: spot.y });
        world.addComponent<WonderSite>(site, C_WONDERSITE, { wonderId: w.id, name: w.name, builtTick: tick });
      }
    }
    void site;
    emitEvent(world, 'culture', `🏛 ${w.name} was completed — a wonder of the age.`);
    if (ch) chronicleAdd(ch, { tick, importance: 0.92, kind: 'wonder', text: `🏛 ${w.name} was raised — a wonder of the re-ascended world.` }, cfg.chronicleImportanceThreshold);
  }
}
