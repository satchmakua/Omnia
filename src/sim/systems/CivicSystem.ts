// Civic functions (M21): the town's functional buildings act on the folk around them, once a
// day. An **infirmary** (`heal`) mends the sick and wounded who linger nearby — fewer are lost
// to illness; a **tavern** (`cheer`) eases loneliness and lifts the mood of passers-by; a
// **workshop** (`hone`) sharpens the craft skill of artisans nearby. (A **watch-house** `ward`
// suppresses crime and a **market** `trade` lightens the cost of living — those are read live
// by the Crime/Economy systems, not here.) Effects are deterministic (no RNG) and bounded; they
// perturb the trajectory like any behavioural system, but the soak verifies the town stays stable.
import type { World } from '../ecs.ts';
import { C_CIVIC, C_AGENT, C_POSITION, C_NEEDS, C_HEALTH, C_CRAFTING, C_CLOCK } from '../components.ts';
import type { Civic, Agent, Needs, Health, Crafting, Position, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const SKILL_CAP = 10;   // mirrors SKILL_MAX in CraftSystem — craftsmanship tops out

export function runCivicSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once a day

  // The buildings whose effect is a daily push onto nearby folk (heal / cheer / hone).
  // ward + trade are read live by other systems, so they're not handled here.
  const buildings: { c: Civic; p: Position }[] = [];
  for (const e of world.query(C_CIVIC, C_POSITION)) {
    const c = world.getComponent<Civic>(e, C_CIVIC)!;
    if (c.effect === 'heal' || c.effect === 'cheer' || c.effect === 'hone') {
      buildings.push({ c, p: world.getComponent<Position>(e, C_POSITION)! });
    }
  }
  if (buildings.length === 0) return;

  // Folk with a position, gathered once; each building reaches those within its radius.
  const folk = world.query(C_AGENT, C_POSITION);
  for (const { c, p } of buildings) {
    const radius = c.radius ?? 5;
    const mag = c.magnitude ?? 0.15;
    for (const e of folk) {
      const fp = world.getComponent<Position>(e, C_POSITION)!;
      if (Math.max(Math.abs(fp.x - p.x), Math.abs(fp.y - p.y)) > radius) continue;   // out of reach
      if (c.effect === 'heal') {
        const h = world.getComponent<Health>(e, C_HEALTH);
        if (h && (h.ill || h.value < 1)) {
          h.value = clamp01(h.value + mag);
          if (h.ill && h.value >= 0.6) h.ill = false;   // tended back to health
        }
      } else if (c.effect === 'hone') {
        const craft = world.getComponent<Crafting>(e, C_CRAFTING);   // only established crafters benefit
        if (craft) craft.skill = Math.min(SKILL_CAP, craft.skill + mag);
      } else {   // cheer
        const needs = world.getComponent<Needs>(e, C_NEEDS);
        if (needs) needs.social = clamp01(needs.social + mag);
        const agent = world.getComponent<Agent>(e, C_AGENT)!;
        if (agent.mood !== undefined) agent.mood = clamp01(agent.mood + mag * 0.5);
      }
    }
  }
}

// The strongest crime-suppression factor at tile (x,y): 1 where no watch reaches, down toward
// (1 - magnitude) under the eye of a watch-house. Read live by the CrimeSystem so a would-be
// offender near the watch thinks twice. Returns 1 (no effect) when no ward covers the tile.
export function wardFactor(world: World, x: number, y: number): number {
  return radiatedFactor(world, x, y, 'ward');
}

// The cost-of-living factor at tile (x,y): 1 normally, down toward (1 - magnitude) within reach
// of a market, where provisions are cheaper. Read live by the EconomySystem when it charges the
// daily upkeep. Returns 1 (full price) where no market reaches.
export function marketFactor(world: World, x: number, y: number): number {
  return radiatedFactor(world, x, y, 'trade');
}

// The strongest (lowest) `1 - magnitude` factor from any civic building radiating `effect` that
// reaches (x,y); 1 if none does. Shared by ward (crime) and trade (cost of living).
function radiatedFactor(world: World, x: number, y: number, effect: Civic['effect']): number {
  let factor = 1;
  for (const e of world.query(C_CIVIC, C_POSITION)) {
    const c = world.getComponent<Civic>(e, C_CIVIC)!;
    if (c.effect !== effect) continue;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) > (c.radius ?? 5)) continue;
    factor = Math.min(factor, 1 - (c.magnitude ?? 0));
  }
  return factor;
}
