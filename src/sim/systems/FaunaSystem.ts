// Fauna are instinct-only (no LLM, ever). Each tick a fauna gets hungrier; if
// peckish it seeks and grazes the nearest ripe flora; if well fed and off
// cooldown it may breed; if it starves it dies. These simple rules produce
// rise/fall population dynamics — and an overgrazed boom can crash (detectable
// in world-health metrics), which is the M2 DoD.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_FAUNA, C_FLORA, C_POSITION, C_TILEMAP } from '../components.ts';
import type { Fauna, Flora, Position } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { makeEnterable, stepToward, wanderStep, buildOccupancy } from './movementUtil.ts';

export function runFaunaSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
  const enterable = makeEnterable(cfg, map);
  const occ = buildOccupancy(world, cfg.gridWidth, [C_AGENT, C_FAUNA]);
  const breedChance = cfg.faunaBreedChancePerDay / cfg.ticksPerDay;

  // Index ripe flora by tile for O(1) graze lookup, and keep a list for nearest-search.
  const flora = world.query(C_FLORA, C_POSITION);
  const ripeAt = new Map<string, EntityId>();
  const ripeList: { x: number; y: number; id: EntityId }[] = [];
  for (const fe of flora) {
    const f = world.getComponent<Flora>(fe, C_FLORA)!;
    if (f.maturity < f.edibleAt) continue;
    const p = world.getComponent<Position>(fe, C_POSITION)!;
    ripeAt.set(`${p.x},${p.y}`, fe);
    ripeList.push({ x: p.x, y: p.y, id: fe });
  }

  const faunas = world.query(C_FAUNA, C_POSITION);
  let faunaCount = faunas.length;
  const toKill: EntityId[] = [];
  const births: { x: number; y: number; parent: Fauna }[] = [];

  for (const e of faunas) {
    const fauna = world.getComponent<Fauna>(e, C_FAUNA)!;
    const pos   = world.getComponent<Position>(e, C_POSITION)!;

    fauna.ticksAlive += 1;
    if (fauna.breedCooldownTicks > 0) fauna.breedCooldownTicks -= 1;
    fauna.hunger = Math.max(0, fauna.hunger - fauna.hungerDecayPerTick);
    if (fauna.hunger <= 0) { toKill.push(e); continue; }

    if (fauna.hunger < fauna.breedThreshold) {
      // Hungry: graze here if ripe flora is present, else move toward the nearest.
      const here = ripeAt.get(`${pos.x},${pos.y}`);
      if (here !== undefined) {
        const f = world.getComponent<Flora>(here, C_FLORA)!;
        fauna.hunger = Math.min(1, fauna.hunger + f.foodYield);
        f.maturity = 0;                       // grazed back to a sprout
        ripeAt.delete(`${pos.x},${pos.y}`);   // consumed this tick
      } else {
        let nearest: { x: number; y: number } | null = null;
        let best = Infinity;
        for (const r of ripeList) {
          const d = Math.abs(r.x - pos.x) + Math.abs(r.y - pos.y);
          if (d < best) { best = d; nearest = r; }
        }
        if (nearest) stepToward(pos, nearest.x, nearest.y, rng, enterable, occ);
        else wanderStep(pos, rng, enterable, occ);
      }
    } else {
      // Well fed: maybe breed, otherwise drift.
      if (fauna.breedCooldownTicks === 0 && faunaCount < cfg.maxFauna && rng() < breedChance) {
        const [dx, dy] = pickDir(rng);
        const nx = pos.x + dx, ny = pos.y + dy;
        if (enterable(nx, ny) && !occ.occupied(nx, ny)) {
          births.push({ x: nx, y: ny, parent: fauna });
          occ.add(nx, ny);                                 // the newborn now holds that tile
          faunaCount++;
          fauna.hunger = Math.max(0, fauna.hunger - 0.3); // cost of reproduction
          fauna.breedCooldownTicks = Math.floor(cfg.ticksPerDay); // re-armed in ~a day
        }
      } else {
        wanderStep(pos, rng, enterable, occ);
      }
    }
  }

  for (const e of toKill) world.destroyEntity(e);

  for (const b of births) {
    const child = world.createEntity();
    world.addComponent<Position>(child, C_POSITION, { x: b.x, y: b.y });
    world.addComponent<Fauna>(child, C_FAUNA, {
      ...b.parent,
      hunger: 0.6,
      breedCooldownTicks: Math.floor(cfg.ticksPerDay),
      ticksAlive: 0,
    });
  }
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
function pickDir(rng: RNG): readonly [number, number] {
  return DIRS[Math.floor(rng() * DIRS.length)];
}
