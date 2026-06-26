// Knowledge (M17 slice 1): the content tech ladder + the ResearchSystem that tribes climb.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_ORGSTORE, C_HEALTH, C_WALLET } from '../src/sim/components.ts';
import type { Agent, Clock, Health, Wallet } from '../src/sim/components.ts';
import { hitChance, hitDamage } from '../src/sim/combat.ts';
import { runHealthSystem } from '../src/sim/systems/HealthSystem.ts';
import { createRNG } from '../src/sim/rng.ts';
import { createOrgStore, createOrg, forkOrg, getOrg } from '../src/org/orgStore.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';
import { runResearchSystem } from '../src/sim/systems/ResearchSystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { getOrgStore } from '../src/org/orgStore.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();
const VALUES = { communal: 0.5, martial: 0.5, traditional: 0.5, open: 0.5 };

describe('tech content (M17)', () => {
  it('loads a full ladder, tribal → sci-fi, with valid prerequisites', () => {
    const all = content.tech.all();
    expect(all.length).toBeGreaterThanOrEqual(10);
    const tiers = new Set(all.map(t => t.tier));
    expect(tiers.has(1)).toBe(true);   // tribal
    expect(tiers.has(7)).toBe(true);   // sci-fi
    expect(content.tech.get('fusion_power')!.tier).toBe(7);
    // every prerequisite resolves to a real tech of an earlier-or-equal tier
    for (const t of all) for (const p of t.prerequisites) {
      const pre = content.tech.get(p);
      expect(pre).toBeDefined();
      expect(pre!.tier).toBeLessThanOrEqual(t.tier);
    }
  });
});

// ── ResearchSystem ──────────────────────────────────────────────────────────────────
function techWorld(): { w: World; store: OrgStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  const store = createOrgStore();
  w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE, store);
  return { w, store };
}
function member(w: World, orgId: string): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: `M${e}`, action: 'wander', ticksAlive: Math.floor(25 * ticksPerYear(cfg)),
    wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, orgId,
  });
  return e;
}

describe('ResearchSystem (M17)', () => {
  it('unlocks the cheapest available techs as research accrues, never before prerequisites', () => {
    const { w, store } = techWorld();
    const org = createOrg(store, 'Korvu', VALUES, 0.6, 0);
    member(w, org);
    getOrg(store, org)!.research = 1000;       // a big research stockpile to spend at once
    runResearchSystem(w, cfg, content);
    const techs = getOrg(store, org)!.techs!;
    expect(techs.length).toBeGreaterThan(3);
    // every unlocked tech's prerequisites were unlocked earlier (valid dependency order)
    const seen = new Set<string>();
    for (const id of techs) {
      for (const p of content.tech.get(id)!.prerequisites) expect(seen.has(p)).toBe(true);
      seen.add(id);
    }
    expect(getOrg(store, org)!.tier).toBeGreaterThanOrEqual(2);   // climbed past the tribal age
  });

  it('a memberless or extinct tribe does no research', () => {
    const { w, store } = techWorld();
    const org = createOrg(store, 'Empty', VALUES, 0.6, 0);   // no members added
    getOrg(store, org)!.research = 1000;
    runResearchSystem(w, cfg, content);
    expect(getOrg(store, org)!.techs!.length).toBe(0);
  });

  it('climbs the tiers over many days', () => {
    const { w, store } = techWorld();
    const org = createOrg(store, 'Climbers', VALUES, 0.6, 0);
    for (let i = 0; i < 12; i++) member(w, org);   // a big, fast-researching tribe
    const clock = w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= 400; d++) { clock.tick = d * cfg.ticksPerDay; runResearchSystem(w, cfg, content); }
    expect(getOrg(store, org)!.tier).toBeGreaterThanOrEqual(5);   // well up the ladder
  });

  it('a breakaway faction inherits the parent tribe’s knowledge on schism', () => {
    const store = createOrgStore();
    const parent = createOrg(store, 'Old', VALUES, 0.6, 0);
    getOrg(store, parent)!.techs = ['toolmaking', 'firecraft', 'agriculture'];
    getOrg(store, parent)!.tier = 2;
    const daughter = forkOrg(store, parent, 'New', 1000, 0.2, createRNG(1));
    expect(getOrg(store, daughter)!.techs).toEqual(['toolmaking', 'firecraft', 'agriculture']);
    expect(getOrg(store, daughter)!.tier).toBe(2);   // and the same level of advancement
    expect(getOrg(store, daughter)!.research).toBe(0);
  });
});

// ── Tech effects (M17 slice 2) ────────────────────────────────────────────────────────
describe('tech effects (M17 s2)', () => {
  const avg = { str: 10, dex: 10, con: 10, martial: 0.5, ferocity: 1, prowess: 0 };

  it('better arms raise both hit chance and damage', () => {
    expect(hitDamage({ ...avg, arms: 3 }, avg)).toBeGreaterThan(hitDamage(avg, avg));
    expect(hitChance({ ...avg, arms: 3 }, avg)).toBeGreaterThan(hitChance(avg, avg));
    // a defender's armour blunts the attacker's edge
    expect(hitChance({ ...avg, arms: 3 }, { ...avg, arms: 3 })).toBeCloseTo(hitChance(avg, avg), 6);
  });

  it('research accumulates a tribe’s effect levels (arms from metalworking)', () => {
    const { w, store } = techWorld();
    const org = createOrg(store, 'Smiths', VALUES, 0.6, 0);
    member(w, org);
    getOrg(store, org)!.research = 1000;
    runResearchSystem(w, cfg, content);
    expect(getOrg(store, org)!.effects?.arms ?? 0).toBeGreaterThanOrEqual(2);   // bronze + iron
  });

  it('a daughter tribe inherits effect levels on schism', () => {
    const store = createOrgStore();
    const parent = createOrg(store, 'Old', VALUES, 0.6, 0);
    getOrg(store, parent)!.effects = { arms: 2, medicine: 1 };
    const daughter = forkOrg(store, parent, 'New', 1000, 0.2, createRNG(1));
    expect(getOrg(store, daughter)!.effects).toEqual({ arms: 2, medicine: 1 });
  });

  it('medicine tech speeds a tribe’s members’ recovery from injury', () => {
    const { w, store } = techWorld();
    const healers = createOrg(store, 'Healers', VALUES, 0.6, 0); getOrg(store, healers)!.effects = { medicine: 2 };
    const plain = createOrg(store, 'Plain', VALUES, 0.6, 0);
    const ill = (orgId: string) => {
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, orgId });
      w.addComponent<Health>(e, C_HEALTH, { value: 0.5, ill: false });
      w.addComponent<Wallet>(e, C_WALLET, { gold: 0, debt: 0 });
      return e;
    };
    const a = ill(healers), b = ill(plain);
    const calm = { ...cfg, illnessChancePerDay: 0, baseMortalityPerDay: 0, ageMortalityScale: 0, sickMortalityPerDay: 0 };
    runHealthSystem(w, calm, createRNG(1));
    expect(w.getComponent<Health>(a, C_HEALTH)!.value).toBeGreaterThan(w.getComponent<Health>(b, C_HEALTH)!.value);
  });
});

describe('research through the live loop (M17)', () => {
  it('founding tribes accrue techs and climb the ages as the town lives', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 8 }, content);
    runTicks(sim.world, sim.rng, defaultConfig, sim.clockEntity, content, 12_000);   // ~12 sim-years
    const store = getOrgStore(sim.world)!;
    const living = Object.values(store.byId).filter(o => !o.extinct);
    const advanced = living.filter(o => (o.techs?.length ?? 0) > 0);
    expect(advanced.length).toBeGreaterThan(0);                       // tribes have researched
    expect(Math.max(...living.map(o => o.tier ?? 1))).toBeGreaterThanOrEqual(2);   // climbed past tribal
  });
});
