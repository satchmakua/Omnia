// Shared civic-building placement (M11/M21). Both world-gen (placeCivic) and the runtime
// emergent construction (CivicBuildSystem) raise buildings the same way: build the `Civic`
// component from the content `Building`, then drop it on the nearest free passable tile spiral-
// scanned out from the town centre (never stacking on another building). Pure & deterministic
// (no RNG), so placement is replayable.
import type { World } from './ecs.ts';
import { C_CIVIC, C_BUSINESS, C_HOME, C_POSITION } from './components.ts';
import type { Civic, Position } from './components.ts';
import type { Building } from '../content/schema.ts';
import type { SimConfig } from './config.ts';
import { isPassable, inBounds } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';

// Build the live Civic component from a content Building. A landmark (effect 'none') carries no
// function fields; a functional building carries its effect/radius/magnitude.
export function civicOf(b: Building): Civic {
  const civic: Civic = { kind: b.kind, name: b.name, icon: b.icon };
  if (b.effect !== 'none') { civic.effect = b.effect; civic.radius = b.radius; civic.magnitude = b.magnitude; }
  return civic;
}

// Tiles already taken by a building, so a new one never stacks on a workplace/home/civic.
function occupiedTiles(world: World, width: number): Set<number> {
  const occ = new Set<number>();
  for (const marker of [C_BUSINESS, C_CIVIC, C_HOME]) {
    for (const e of world.query(marker, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      occ.add(p.y * width + p.x);
    }
  }
  return occ;
}

// Raise a building on the nearest free passable tile to the town centre. Returns the placed
// entity id, or null if the map has no room. `occupied` may be passed (and is mutated) when
// placing several in one pass (world-gen); otherwise it's computed from the current world.
export function raiseCivic(
  world: World, cfg: SimConfig, map: TileMapData, b: Building, occupied?: Set<number>,
): number | null {
  const W = cfg.gridWidth;
  const occ = occupied ?? occupiedTiles(world, W);
  const cx = Math.floor(map.width / 2), cy = Math.floor(map.height / 2);
  const limit = Math.max(map.width, map.height);
  for (let r = 0; r <= limit; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (!inBounds(map, x, y) || !isPassable(map, x, y) || occ.has(y * W + x)) continue;
        const e = world.createEntity();
        world.addComponent<Position>(e, C_POSITION, { x, y });
        world.addComponent<Civic>(e, C_CIVIC, civicOf(b));
        occ.add(y * W + x);
        return e;
      }
    }
  }
  return null;
}
