// Mentorship (M29 slice 3): a master crafter who shares a workplace with a less-skilled one takes
// them on as an apprentice — the novice's skill grows faster than solo practice, a warm mentor bond
// forms, and an apprenticeship is announced once. Deterministic, RNG-free.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_JOB, C_CRAFTING, C_RELATIONSHIPS, C_CLOCK, C_EVENTLOG } from '../src/sim/components.ts';
import type { Agent, Job, Crafting, Relationships, Clock } from '../src/sim/components.ts';
import { runMentorSystem } from '../src/sim/systems/MentorSystem.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const ADULT = Math.floor(25 * ticksPerYear(cfg));
const content = testContent();
const CRAFT_PROF = content.recipes.all()[0].profession;             // a profession that actually crafts
const PROF_NAME = content.professions.get(CRAFT_PROF)?.name ?? 'Crafter';

function mworld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
  return w;
}
function crafter(w: World, employer: EntityId, skill: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `C${e}`, action: 'work', ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Job>(e, C_JOB, { professionId: CRAFT_PROF, professionName: PROF_NAME, employer, wagePerTick: 0, gathers: null });
  w.addComponent<Crafting>(e, C_CRAFTING, { skill });
  w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  return e;
}
const skill = (w: World, e: EntityId) => w.getComponent<Crafting>(e, C_CRAFTING)!.skill;
const rel = (w: World, e: EntityId) => w.getComponent<Relationships>(e, C_RELATIONSHIPS)!;
const feed = (w: World) => w.getComponent<EventLogData>(w.query(C_EVENTLOG)[0], C_EVENTLOG)!.entries;
const EMP = 9999;   // a shared employer id (only used as a grouping key)

describe('mentorship (M29 s3)', () => {
  it('a master teaches a novice at the same workplace — skill grows + a mentor bond forms', () => {
    const w = mworld();
    const master = crafter(w, EMP, 5);
    const novice = crafter(w, EMP, 1);
    const s0 = skill(w, novice);
    runMentorSystem(w, cfg, content);

    expect(skill(w, novice)).toBeGreaterThan(s0);                       // learned by teaching
    expect(rel(w, novice).edges[master]).toMatchObject({ type: 'friend' });
    expect(rel(w, novice).edges[master].reason).toMatch(/master in the/);
    expect(rel(w, master).edges[novice].reason).toMatch(/apprentice in the/);
    expect(feed(w).some(e => /apprentice/.test(e.text))).toBe(true);    // announced once
  });

  it('two near-equals do not form a master/apprentice bond', () => {
    const w = mworld();
    const a = crafter(w, EMP, 5);
    const b = crafter(w, EMP, 4.5);   // gap 0.5 < the required novice gap
    runMentorSystem(w, cfg, content);
    expect(rel(w, b).edges[a]).toBeUndefined();
    expect(skill(w, b)).toBe(4.5);    // taught nothing
  });

  it('an unaccomplished crafter cannot mentor (below the master threshold)', () => {
    const w = mworld();
    const a = crafter(w, EMP, 2);     // skill 2 < the teaching threshold
    const b = crafter(w, EMP, 0);
    runMentorSystem(w, cfg, content);
    expect(rel(w, b).edges[a]).toBeUndefined();
  });

  it('a lone crafter learns nothing (no one to teach them)', () => {
    const w = mworld();
    const solo = crafter(w, EMP, 0);
    runMentorSystem(w, cfg, content);
    expect(skill(w, solo)).toBe(0);
  });

  it('an apprentice never surpasses their master, and is welcomed only once', () => {
    const w = mworld();
    const master = crafter(w, EMP, 5);
    const app = crafter(w, EMP, 0);
    for (let day = 0; day < 60; day++) runMentorSystem(w, cfg, content);
    // The apprenticeship runs until the novice nears the master (within the gap) — then they're peers,
    // so the learner caps below the master, never surpassing them.
    expect(skill(w, app)).toBeLessThan(skill(w, master));
    expect(skill(w, app)).toBeGreaterThan(3);                       // but grew most of the way there
    expect(feed(w).filter(e => /took .* under their wing/.test(e.text)).length).toBe(1);  // announced once, not daily
  });
});
