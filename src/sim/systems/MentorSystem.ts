// Mentorship (M29 slice 3) — learn-by-*teaching*. Where a skilled crafter (a master) shares a
// workplace with a less-skilled one, the master takes them on as an **apprentice**: the novice's
// craft skill grows faster than solo practice ever would, and a warm **mentor bond** forms between
// them (a friendship with a telling reason — "their master in the smithing"). So expertise spreads
// down the generations and the workshop becomes a place of bonds, not just wages. Ties crafting
// (M23) + the relationship model (M29). Deterministic — no RNG; a pure transform of skill + edges.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_JOB, C_CRAFTING, C_RELATIONSHIPS, C_CLOCK } from '../components.ts';
import type { Agent, Job, Crafting, Relationships, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import { opine } from '../relationships.ts';
import { remember } from '../../ai/memory.ts';
import { emitEvent } from '../../history/eventlog.ts';

const MASTER_MIN_SKILL = 3;   // an experienced crafter (skilled enough to teach) can take an apprentice
const SKILL_GAP = 1.5;        // …who must be at least this far behind them (a real novice, not a peer)
const MENTOR_GAIN = 0.15;     // skill/day an apprentice gains from a master (faster than solo learn-by-doing)
const BOND_WARMTH = 0.08;     // the mentor friendship warms a little each day they work together
const SKILL_MAX = 10;         // mirrors CraftSystem's cap

export function runMentorSystem(world: World, cfg: SimConfig, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once a day
  const tick = clock.tick;

  const craftProfs = new Set(content.recipes.all().map(r => r.profession));
  if (craftProfs.size === 0) return;

  // Crafters grouped by their workplace (same employer = they work side by side).
  const byEmployer = new Map<EntityId, EntityId[]>();
  for (const e of world.query(C_AGENT, C_JOB)) {
    const job = world.getComponent<Job>(e, C_JOB)!;
    if (!craftProfs.has(job.professionId)) continue;
    const list = byEmployer.get(job.employer);
    if (list) list.push(e); else byEmployer.set(job.employer, [e]);
  }

  const skillOf = (e: EntityId): number => world.getComponent<Crafting>(e, C_CRAFTING)?.skill ?? 0;

  for (const crafters of byEmployer.values()) {
    if (crafters.length < 2) continue;
    // The most-skilled hand is the master (deterministic: ties break by lower entity id, query order).
    let master = crafters[0];
    for (const c of crafters) if (skillOf(c) > skillOf(master)) master = c;
    const mSkill = skillOf(master);
    if (mSkill < MASTER_MIN_SKILL) continue;

    const masterName = world.getComponent<Agent>(master, C_AGENT)!.name;
    const craft = world.getComponent<Job>(master, C_JOB)!.professionName.toLowerCase();
    const mRel = world.getComponent<Relationships>(master, C_RELATIONSHIPS);

    for (const app of crafters) {
      if (app === master) continue;
      if (skillOf(app) >= mSkill - SKILL_GAP) continue;   // already nearly their equal — no apprenticing

      // Learn-by-teaching: skill grows toward (but not past) the master's own.
      let craftComp = world.getComponent<Crafting>(app, C_CRAFTING);
      if (!craftComp) { craftComp = { skill: 0 }; world.addComponent<Crafting>(app, C_CRAFTING, craftComp); }
      craftComp.skill = Math.min(mSkill, Math.min(SKILL_MAX, craftComp.skill + MENTOR_GAIN));

      // The bond — a friendship, warming over the days they work together.
      const aRel = world.getComponent<Relationships>(app, C_RELATIONSHIPS);
      const prior = aRel?.edges[master]?.reason ?? '';
      const fresh = !/master|apprentice/.test(prior);
      if (aRel) opine(aRel, master, 'friend', BOND_WARMTH, `their master in the ${craft}`);
      if (mRel) opine(mRel, app, 'friend', BOND_WARMTH, `their apprentice in the ${craft}`);
      if (fresh) {
        const appName = world.getComponent<Agent>(app, C_AGENT)!.name;
        emitEvent(world, 'work', `${masterName} took ${appName} under their wing as an apprentice ${craft}.`);
        remember(world, app, tick, `apprenticed to ${masterName} in the ${craft}`, 0.5);
        remember(world, master, tick, `took ${appName} on as an apprentice`, 0.45);
      }
    }
  }
}
