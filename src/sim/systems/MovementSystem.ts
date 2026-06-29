import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_FLORA, C_FAUNA, C_JOB, C_RESOURCE, C_TILEMAP, C_HOME, C_QUEST, C_VOYAGE, C_AFFLICTIONS, C_CLOCK } from '../components.ts';
import type { Agent, Needs, Position, Flora, Job, Resource, Home, Quest, Voyage, Afflictions, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { invokeCapability } from '../../capability/invoke.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { isSlowed } from '../afflictions.ts';
import { makeEnterable, wanderStep, buildOccupancy } from './movementUtil.ts';
import { SpatialGrid } from '../spatialGrid.ts';
import { pathToward } from '../pathfinding.ts';
import { getOrgStore } from '../../org/orgStore.ts';

// Mobile creatures never share a tile; a content agent at its workplace fidgets a
// little so it looks alive rather than frozen on the spot.
const WORK_FIDGET = 0.3;
const RELAX_FIDGET = 0.4;   // a folk at leisure strolls/potters about now and then (M28)
const HUNT_MEAL = 0.7;   // hunger a hungry agent gains from hunting a fauna (M8 slice 5)
const HOME_REST_BONUS = 1.4;   // one's own bed restores energy faster than rough sleeping (M11 s2)

export function runMovementSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const forage = content.capabilities.require('forage');
  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;

  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
  const enterable = makeEnterable(cfg, map);
  const seaEnterable = makeEnterable(cfg, map, true);   // a seafarer's boat may cross water (M24)
  const occ = buildOccupancy(world, cfg.gridWidth, [C_AGENT, C_FAUNA]);
  // A tribe that has mastered Seafaring grants its folk boats — they treat water as crossable.
  const orgStore = getOrgStore(world);
  const seafaring = (orgId: string | undefined): boolean =>
    !!(orgId && orgStore && (orgStore.byId[orgId]?.effects?.seafaring ?? 0) > 0);

  // Perception via spatial grids (M8): rebuilt each tick, queried for the nearest
  // target without scanning every entity. Insertion order follows the component
  // queries, so `nearest` (min Manhattan, ties by insertion) matches the old linear
  // scans exactly — the trajectory is unchanged.

  // Ripe flora to forage: a per-tile lookup (am I standing on food?) + a grid (where's
  // the nearest food?).
  const florae = world.query(C_FLORA, C_POSITION);
  const ripeAt = new Map<string, EntityId>();
  const floraGrid = new SpatialGrid(cfg.gridWidth, cfg.gridHeight);
  for (const fe of florae) {
    const f = world.getComponent<Flora>(fe, C_FLORA)!;
    if (f.maturity < f.edibleAt) continue;
    const p = world.getComponent<Position>(fe, C_POSITION)!;
    ripeAt.set(`${p.x},${p.y}`, fe);
    floraGrid.insert(p.x, p.y, fe);
  }

  // Agent positions (for socialising: walking toward the nearest other person).
  const agentGrid = new SpatialGrid(cfg.gridWidth, cfg.gridHeight);
  for (const ae of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(ae, C_POSITION)!;
    agentGrid.insert(p.x, p.y, ae);
  }

  // Non-empty resource nodes, one grid per type (gatherers walk to the nearest).
  const nodeGrids = new Map<string, SpatialGrid>();
  for (const re of world.query(C_RESOURCE, C_POSITION)) {
    const r = world.getComponent<Resource>(re, C_RESOURCE)!;
    if (r.amount <= 0) continue;
    const p = world.getComponent<Position>(re, C_POSITION)!;
    let grid = nodeGrids.get(r.typeId);
    if (!grid) { grid = new SpatialGrid(cfg.gridWidth, cfg.gridHeight); nodeGrids.set(r.typeId, grid); }
    grid.insert(p.x, p.y, re);
  }
  const nearestNode = (type: string, x: number, y: number): { x: number; y: number } | null =>
    nodeGrids.get(type)?.nearest(x, y) ?? null;

  // Fauna a hungry agent can hunt — a food source and predation pressure on the herds.
  const faunaGrid = new SpatialGrid(cfg.gridWidth, cfg.gridHeight);
  for (const fe of world.query(C_FAUNA, C_POSITION)) {
    const p = world.getComponent<Position>(fe, C_POSITION)!;
    faunaGrid.insert(p.x, p.y, fe);
  }

  // An agent's own home (first owned), so a sleeper heads to their own bed (M11 s2).
  const homeOf = new Map<EntityId, Position>();
  for (const he of world.query(C_HOME, C_POSITION)) {
    const owner = world.getComponent<Home>(he, C_HOME)!.owner;
    if (!homeOf.has(owner)) homeOf.set(owner, world.getComponent<Position>(he, C_POSITION)!);
  }

  for (const entity of world.query(C_AGENT, C_NEEDS, C_POSITION)) {
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;
    const pos   = world.getComponent<Position>(entity, C_POSITION)!;
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;

    // A maimed leg or the frailty of age halves an agent's pace (M30): on "hold" ticks they stay
    // put. Survival actions are spared (so the slow never starves them — no death-spiral); it's
    // their getting-about — work, errands, socialising — that the injury hampers. Deterministic.
    if (isSlowed(world.getComponent<Afflictions>(entity, C_AFFLICTIONS)) &&
        agent.action !== 'seek_food' && agent.action !== 'sleep' && (tick + entity) % 2 !== 0) continue;
    const ent = seafaring(agent.orgId) ? seaEnterable : enterable;   // boats let seafarers cross water

    // A merchant on a sea voyage (M25 s3) attends to nothing else — they sail for the far shore.
    const voyage = world.getComponent<Voyage>(entity, C_VOYAGE);
    if (voyage) {
      if (pos.x !== voyage.tx || pos.y !== voyage.ty) pathToward(pos, voyage.tx, voyage.ty, rng, ent, occ, cfg.gridWidth, cfg.gridHeight);
      continue;
    }

    if (agent.action === 'sleep') {
      const home = homeOf.get(entity);
      if (home && (pos.x !== home.x || pos.y !== home.y)) {
        // Head to one's own bed, winding down on the way.
        pathToward(pos, home.x, home.y, rng, ent, occ, cfg.gridWidth, cfg.gridHeight);
        needs.energy = Math.min(1.0, needs.energy + cfg.sleepRestorePerTick);
      } else {
        // Resting in place — one's own home is more comfortable, so sleep restores faster.
        const rate = home ? cfg.sleepRestorePerTick * HOME_REST_BONUS : cfg.sleepRestorePerTick;
        needs.energy = Math.min(1.0, needs.energy + rate);
      }
      continue;
    }

    if (agent.action === 'work') {
      const job = world.getComponent<Job>(entity, C_JOB);
      // A gatherer heads for the nearest non-empty node of its resource; the
      // GatherSystem depletes it once the worker is standing on it.
      if (job && job.gathers) {
        const node = nearestNode(job.gathers, pos.x, pos.y);
        if (node) {
          if (pos.x !== node.x || pos.y !== node.y) pathToward(pos, node.x, node.y, rng, ent, occ, cfg.gridWidth, cfg.gridHeight);
          continue;
        }
        // Resource exhausted everywhere — fall back to the employer.
      }
      // Otherwise walk to the employer's tile and work there; once there, fidget
      // occasionally so a working agent looks busy rather than frozen on the spot.
      const ep = job ? world.getComponent<Position>(job.employer, C_POSITION) : undefined;
      if (ep) {
        if (pos.x !== ep.x || pos.y !== ep.y) pathToward(pos, ep.x, ep.y, rng, ent, occ, cfg.gridWidth, cfg.gridHeight);
        else if (rng() < WORK_FIDGET) wanderStep(pos, rng, enterable, occ);   // fidget on land, not out to sea
        continue;
      }
      // No job/employer to walk to — fall through to wander.
    }

    if (agent.action === 'socialize') {
      // Walk toward the nearest other person; converging onto a shared tile lets
      // the SocialSystem strike up an interaction.
      const nearest = agentGrid.nearest(pos.x, pos.y, (id) => id !== entity);
      if (nearest) { pathToward(pos, nearest.x, nearest.y, rng, ent, occ, cfg.gridWidth, cfg.gridHeight); continue; }
      // Alone in the world — wander.
    }

    if (agent.action === 'relax') {
      // Leisure (M28): potter about and unwind — fun recovers wherever they are. (A tavern nearby
      // tops it up further via the CivicSystem; seeking the tavern out to drink is a follow-on.)
      if (rng() < RELAX_FIDGET) wanderStep(pos, rng, enterable, occ);
      needs.fun = Math.min(1, (needs.fun ?? 1) + cfg.funRestorePerTick);
      continue;
    }

    if (agent.action === 'seek_food') {
      const here = ripeAt.get(`${pos.x},${pos.y}`);
      if (here !== undefined) {
        // Forage: invoke the capability (data declares restore_hunger); the
        // amount is the flora's yield scaled by ripeness and forage efficiency.
        const f = world.getComponent<Flora>(here, C_FLORA)!;
        const bite = f.foodYield * f.maturity * forage.power;
        f.maturity = 0;
        ripeAt.delete(`${pos.x},${pos.y}`);
        invokeCapability(forage, { needs }, bite);
        continue;
      }
      // Opportunistic hunt: only when genuinely desperate (no easy forage), a creature
      // right beside us is meat. Folk don't chase — predators do that — so hunting is a
      // light, rare cull, not a steady drain that would empty the herds.
      const prey = needs.hunger < 0.25
        ? faunaGrid.nearest(pos.x, pos.y, (id) => world.hasComponent(id, C_FAUNA)) : null;
      if (prey && Math.abs(prey.x - pos.x) + Math.abs(prey.y - pos.y) <= 1) {
        world.destroyEntity(prey.id);
        needs.hunger = Math.min(1, needs.hunger + HUNT_MEAL);
        continue;
      }
      // Otherwise forage the nearest ripe flora; wander if none exists yet.
      const flora = floraGrid.nearest(pos.x, pos.y);
      if (flora) { pathToward(pos, flora.x, flora.y, rng, ent, occ, cfg.gridWidth, cfg.gridHeight); continue; }
    }

    // A folk on an explore quest walks toward the ruins they vowed to seek, rather than
    // wandering aimlessly (M20 s3 — active pursuit; ArchaeologySystem discovers it on arrival).
    const quest = world.getComponent<Quest>(entity, C_QUEST);
    if (quest && quest.kind === 'explore' && quest.tx !== undefined && (pos.x !== quest.tx || pos.y !== quest.ty)) {
      pathToward(pos, quest.tx, quest.ty!, rng, ent, occ, cfg.gridWidth, cfg.gridHeight);
      continue;
    }
    wanderStep(pos, rng, enterable, occ, cfg.wanderIdleChance);   // aimless wandering stays on land (boats are for crossing, not idle drifting)
  }
}
