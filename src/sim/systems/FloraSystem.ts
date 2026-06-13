// Flora have no brain — they grow toward maturity and occasionally spread to a
// neighbouring open, passable tile. Spreading is bounded by cfg.maxFlora so the
// world stays within the performance budget.
import type { World } from '../ecs.ts';
import { C_FLORA, C_POSITION, C_TILEMAP } from '../components.ts';
import type { Flora, Position } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import { isPassable } from '../../world/tilemap.ts';
import type { TileMapData } from '../../world/tilemap.ts';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function runFloraSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;

  const florae = world.query(C_FLORA, C_POSITION);
  let count = florae.length;

  // Track occupied tiles so flora don't stack on top of each other.
  const occupied = new Set<number>();
  if (map) {
    for (const e of florae) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      occupied.add(p.y * map.width + p.x);
    }
  }

  const newSpots: { x: number; y: number; parent: Flora }[] = [];

  for (const e of florae) {
    const flora = world.getComponent<Flora>(e, C_FLORA)!;
    if (flora.maturity < 1) flora.maturity = Math.min(1, flora.maturity + flora.growthPerTick);

    // Mature flora may seed a neighbour.
    if (map && flora.maturity >= 1 && count < cfg.maxFlora && rng() < flora.spreadChancePerTick) {
      const pos = world.getComponent<Position>(e, C_POSITION)!;
      const [dx, dy] = DIRS[Math.floor(rng() * DIRS.length)];
      const nx = pos.x + dx, ny = pos.y + dy;
      const key = ny * map.width + nx;
      if (isPassable(map, nx, ny) && !occupied.has(key)) {
        occupied.add(key);
        newSpots.push({ x: nx, y: ny, parent: flora });
        count++;
      }
    }
  }

  // Add offspring after iterating (copy of the parent archetype, maturity 0).
  for (const spot of newSpots) {
    const child = world.createEntity();
    world.addComponent<Position>(child, C_POSITION, { x: spot.x, y: spot.y });
    world.addComponent<Flora>(child, C_FLORA, { ...spot.parent, maturity: 0 });
  }
}
