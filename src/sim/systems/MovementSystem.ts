import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_FLORA, C_FAUNA, C_JOB, C_RESOURCE, C_TILEMAP } from '../components.ts';
import type { Agent, Needs, Position, Flora, Job, Resource } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { invokeCapability } from '../../capability/invoke.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { makeEnterable, stepToward, wanderStep, buildOccupancy } from './movementUtil.ts';
import { SpatialGrid } from '../spatialGrid.ts';

// Mobile creatures never share a tile; a content agent at its workplace fidgets a
// little so it looks alive rather than frozen on the spot.
const WORK_FIDGET = 0.3;

export function runMovementSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const forage = content.capabilities.require('forage');

  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
  const enterable = makeEnterable(cfg, map);
  const occ = buildOccupancy(world, cfg.gridWidth, [C_AGENT, C_FAUNA]);

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

  for (const entity of world.query(C_AGENT, C_NEEDS, C_POSITION)) {
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;
    const pos   = world.getComponent<Position>(entity, C_POSITION)!;
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;

    if (agent.action === 'sleep') {
      needs.energy = Math.min(1.0, needs.energy + cfg.sleepRestorePerTick);
      continue;
    }

    if (agent.action === 'work') {
      const job = world.getComponent<Job>(entity, C_JOB);
      // A gatherer heads for the nearest non-empty node of its resource; the
      // GatherSystem depletes it once the worker is standing on it.
      if (job && job.gathers) {
        const node = nearestNode(job.gathers, pos.x, pos.y);
        if (node) {
          if (pos.x !== node.x || pos.y !== node.y) stepToward(pos, node.x, node.y, rng, enterable, occ);
          continue;
        }
        // Resource exhausted everywhere — fall back to the employer.
      }
      // Otherwise walk to the employer's tile and work there; once there, fidget
      // occasionally so a working agent looks busy rather than frozen on the spot.
      const ep = job ? world.getComponent<Position>(job.employer, C_POSITION) : undefined;
      if (ep) {
        if (pos.x !== ep.x || pos.y !== ep.y) stepToward(pos, ep.x, ep.y, rng, enterable, occ);
        else if (rng() < WORK_FIDGET) wanderStep(pos, rng, enterable, occ);
        continue;
      }
      // No job/employer to walk to — fall through to wander.
    }

    if (agent.action === 'socialize') {
      // Walk toward the nearest other person; converging onto a shared tile lets
      // the SocialSystem strike up an interaction.
      const nearest = agentGrid.nearest(pos.x, pos.y, (id) => id !== entity);
      if (nearest) { stepToward(pos, nearest.x, nearest.y, rng, enterable, occ); continue; }
      // Alone in the world — wander.
    }

    if (agent.action === 'seek_food') {
      const here = ripeAt.get(`${pos.x},${pos.y}`);
      if (here !== undefined) {
        // Forage: invoke the capability (data declares restore_hunger); the
        // amount is the flora's yield scaled by ripeness and forage efficiency.
        const flora = world.getComponent<Flora>(here, C_FLORA)!;
        const bite = flora.foodYield * flora.maturity * forage.power;
        flora.maturity = 0;
        ripeAt.delete(`${pos.x},${pos.y}`);
        invokeCapability(forage, { needs }, bite);
        continue;
      }
      // Move toward the nearest ripe flora; wander if none exists yet.
      const nearest = floraGrid.nearest(pos.x, pos.y);
      if (nearest) { stepToward(pos, nearest.x, nearest.y, rng, enterable, occ); continue; }
    }

    wanderStep(pos, rng, enterable, occ);
  }
}
