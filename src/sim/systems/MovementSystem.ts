import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_NEEDS, C_POSITION, C_FLORA, C_JOB, C_TILEMAP } from '../components.ts';
import type { Agent, Needs, Position, Flora, Job } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { invokeCapability } from '../../capability/invoke.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { makeEnterable, stepToward, wanderStep } from './movementUtil.ts';

export function runMovementSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const forage = content.capabilities.require('forage');

  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
  const enterable = makeEnterable(cfg, map);

  // Ripe flora available to forage, indexed by tile + listed for nearest-search.
  const florae = world.query(C_FLORA, C_POSITION);
  const ripeAt = new Map<string, EntityId>();
  const ripeList: { x: number; y: number }[] = [];
  for (const fe of florae) {
    const f = world.getComponent<Flora>(fe, C_FLORA)!;
    if (f.maturity < f.edibleAt) continue;
    const p = world.getComponent<Position>(fe, C_POSITION)!;
    ripeAt.set(`${p.x},${p.y}`, fe);
    ripeList.push({ x: p.x, y: p.y });
  }

  // Agent positions (for socialising: walking toward the nearest other person).
  const agentList: { id: EntityId; x: number; y: number }[] = [];
  for (const ae of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(ae, C_POSITION)!;
    agentList.push({ id: ae, x: p.x, y: p.y });
  }

  for (const entity of world.query(C_AGENT, C_NEEDS, C_POSITION)) {
    const agent = world.getComponent<Agent>(entity, C_AGENT)!;
    const pos   = world.getComponent<Position>(entity, C_POSITION)!;
    const needs = world.getComponent<Needs>(entity, C_NEEDS)!;

    if (agent.action === 'sleep') {
      needs.energy = Math.min(1.0, needs.energy + cfg.sleepRestorePerTick);
      continue;
    }

    if (agent.action === 'work') {
      // Walk to the employer's tile; the EconomySystem pays once standing on it.
      const job = world.getComponent<Job>(entity, C_JOB);
      const ep = job ? world.getComponent<Position>(job.employer, C_POSITION) : undefined;
      if (ep) {
        if (pos.x !== ep.x || pos.y !== ep.y) stepToward(pos, ep.x, ep.y, rng, enterable);
        continue; // standing on the workplace: stay put and work
      }
      // No job/employer to walk to — fall through to wander.
    }

    if (agent.action === 'socialize') {
      // Walk toward the nearest other person; converging onto a shared tile lets
      // the SocialSystem strike up an interaction.
      let nearest: { x: number; y: number } | null = null;
      let best = Infinity;
      for (const o of agentList) {
        if (o.id === entity) continue;
        const d = Math.abs(o.x - pos.x) + Math.abs(o.y - pos.y);
        if (d > 0 && d < best) { best = d; nearest = o; }
      }
      if (nearest) { stepToward(pos, nearest.x, nearest.y, rng, enterable); continue; }
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
      let nearest: { x: number; y: number } | null = null;
      let best = Infinity;
      for (const r of ripeList) {
        const d = Math.abs(r.x - pos.x) + Math.abs(r.y - pos.y);
        if (d < best) { best = d; nearest = r; }
      }
      if (nearest) { stepToward(pos, nearest.x, nearest.y, rng, enterable); continue; }
    }

    wanderStep(pos, rng, enterable);
  }
}
