// Fauna are instinct-only (no LLM, ever). Each tick a fauna gets hungrier; then it
// FEEDS — a grazer seeks the nearest ripe flora, a predator stalks the nearest grazer
// — breeds when well fed and off cooldown, or starves. Grazers are bounded by the
// flora they can find and by predation (predator fauna + folk hunting); predators are
// bounded by the herds. So the population SELF-REGULATES with no artificial cap (M8
// slice 5) — occupancy (one creature per tile) is the only hard ceiling — producing
// real rise/fall predator–prey dynamics instead of a static carpet at a magic number.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_FAUNA, C_FLORA, C_POSITION, C_TILEMAP } from '../components.ts';
import type { Fauna, Flora, Position } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { scaledMaxFauna } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { makeEnterable, stepToward, wanderStep, buildOccupancy } from './movementUtil.ts';
import { SpatialGrid } from '../spatialGrid.ts';

const PREDATOR_MEAL = 0.8;   // hunger a predator gains from catching a grazer
// A predator only spots prey within a short range; when the herds thin out it can't
// find any (and falls back to grazing), so sparse survivors get a refuge and recover.
// This short sight is what makes predation density-dependent and the food web stable:
// predators hunt hard where grazers are dense, and leave the thin spots be.
const PREDATOR_SIGHT = 5;

export function runFaunaSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
  const enterable = makeEnterable(cfg, map);
  const occ = buildOccupancy(world, cfg.gridWidth, [C_AGENT, C_FAUNA]);
  const breedChance = cfg.faunaBreedChancePerDay / cfg.ticksPerDay;

  // Ripe flora (grazer food): a per-tile lookup + a spatial grid for nearest-search.
  const flora = world.query(C_FLORA, C_POSITION);
  const ripeAt = new Map<string, EntityId>();
  const floraGrid = new SpatialGrid(cfg.gridWidth, cfg.gridHeight);
  for (const fe of flora) {
    const f = world.getComponent<Flora>(fe, C_FLORA)!;
    if (f.maturity < f.edibleAt) continue;
    const p = world.getComponent<Position>(fe, C_POSITION)!;
    ripeAt.set(`${p.x},${p.y}`, fe);
    floraGrid.insert(p.x, p.y, fe);
  }

  const faunas = world.query(C_FAUNA, C_POSITION);

  // Prey grid (grazers, for predators to hunt) + separate head-counts. Grazers and
  // predators get SEPARATE area-scaled caps so grazers fill the carrying capacity
  // while predators stay a small, persistent minority that thins and chases the herds
  // (a shared cap let the omnivorous predators breed up and crowd the grazers out).
  const preyGrid = new SpatialGrid(cfg.gridWidth, cfg.gridHeight);
  let grazerCount = 0, predatorCount = 0;
  for (const e of faunas) {
    const f = world.getComponent<Fauna>(e, C_FAUNA)!;
    if (f.diet === 'predator') { predatorCount++; continue; }
    grazerCount++;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    preyGrid.insert(p.x, p.y, e);
  }
  const grazerCap = scaledMaxFauna(cfg);
  const predatorCap = Math.max(3, Math.round(grazerCap * 0.08));   // predators stay a small fraction of the herd

  const dead = new Set<EntityId>();          // starved or eaten this tick (deduped)
  const births: { x: number; y: number; parent: Fauna }[] = [];

  for (const e of faunas) {
    if (dead.has(e)) continue;               // already eaten by a predator this tick
    const fauna = world.getComponent<Fauna>(e, C_FAUNA)!;
    const pos   = world.getComponent<Position>(e, C_POSITION)!;

    fauna.ticksAlive += 1;
    if (fauna.breedCooldownTicks > 0) fauna.breedCooldownTicks -= 1;
    fauna.hunger = Math.max(0, fauna.hunger - fauna.hungerDecayPerTick);
    if (fauna.hunger <= 0) { dead.add(e); continue; }

    if (fauna.hunger < fauna.breedThreshold) {
      // Predators chase and kill the nearest grazer in sight…
      let hunted = false;
      if (fauna.diet === 'predator') {
        const prey = preyGrid.nearest(pos.x, pos.y, (id) => !dead.has(id));
        const d = prey ? Math.abs(prey.x - pos.x) + Math.abs(prey.y - pos.y) : Infinity;
        if (prey && d <= PREDATOR_SIGHT) {
          hunted = true;
          if (d <= 1) {
            dead.add(prey.id);                                   // caught and devoured
            fauna.hunger = Math.min(1, fauna.hunger + PREDATOR_MEAL);
          } else {
            stepToward(pos, prey.x, prey.y, rng, enterable, occ);
          }
        }
      }
      // …grazers always, and a predator with no prey in sight, fall back to foraging
      // flora — so predators never simply starve out, which keeps the food web stable
      // (no extinction spiral) while predation still thins and chases the herds.
      if (!hunted) {
        const here = ripeAt.get(`${pos.x},${pos.y}`);
        if (here !== undefined) {
          const f = world.getComponent<Flora>(here, C_FLORA)!;
          fauna.hunger = Math.min(1, fauna.hunger + f.foodYield);
          f.maturity = 0;                       // grazed back to a sprout
          ripeAt.delete(`${pos.x},${pos.y}`);   // consumed this tick
        } else {
          const nearest = floraGrid.nearest(pos.x, pos.y);
          if (nearest) stepToward(pos, nearest.x, nearest.y, rng, enterable, occ);
          else wanderStep(pos, rng, enterable, occ);
        }
      }
    } else {
      // Well fed: maybe breed, up to this diet's area-scaled cap.
      const atCap = fauna.diet === 'predator' ? predatorCount >= predatorCap : grazerCount >= grazerCap;
      if (fauna.breedCooldownTicks === 0 && !atCap && rng() < breedChance) {
        const [dx, dy] = pickDir(rng);
        const nx = pos.x + dx, ny = pos.y + dy;
        if (enterable(nx, ny) && !occ.occupied(nx, ny)) {
          births.push({ x: nx, y: ny, parent: fauna });
          occ.add(nx, ny);                                 // the newborn now holds that tile
          if (fauna.diet === 'predator') predatorCount++; else grazerCount++;
          fauna.hunger = Math.max(0, fauna.hunger - 0.3); // cost of reproduction
          fauna.breedCooldownTicks = Math.floor(cfg.ticksPerDay); // re-armed in ~a day
        }
      } else {
        wanderStep(pos, rng, enterable, occ);
      }
    }
  }

  for (const e of dead) world.destroyEntity(e);

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
