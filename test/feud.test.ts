// Feuds & vendettas (M29 s2) — the rivalry edges of slice 1 now ACT. A deep grudge erupts into a
// fight; grudges cool over time (reconciliation); children inherit their parents' deep grudges
// (hereditary feuds); and ordinary crime falls preferentially on a rival. These tests pin each.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_ALIGNMENT, C_WALLET, C_POSITION, C_HEALTH, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK, C_CHRONICLE, C_EVENTLOG,
} from '../src/sim/components.ts';
import type { Agent, Alignment, Wallet, Health, Relationships, Lineage, Clock, Position } from '../src/sim/components.ts';
import { runFeudSystem } from '../src/sim/systems/FeudSystem.ts';
import { runCrimeSystem } from '../src/sim/systems/CrimeSystem.ts';
import { opine } from '../src/sim/relationships.ts';
import { spawnAgent } from '../src/sim/spawnAgent.ts';
import { createChronicle } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const ADULT = Math.floor(25 * ticksPerYear(cfg));

function feudWorld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, createChronicle());
  w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
  return w;
}
function person(w: World, x: number, y: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Agent>(e, C_AGENT, { name: `P${e}`, action: 'wander', ticksAlive: ADULT, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood: 0.5 });
  w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
  w.addComponent<Wallet>(e, C_WALLET, { gold: 20, debt: 0 });
  w.addComponent<Alignment>(e, C_ALIGNMENT, { good: 0.8, law: 0 });
  w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
  return e;
}
const health = (w: World, e: EntityId) => (w.hasComponent(e, C_AGENT) ? w.getComponent<Health>(e, C_HEALTH)!.value : 0);

describe('feuds — a deep grudge drives a fight (M29 s2)', () => {
  it('bitter rivals who cross paths come to blows; peaceful neighbours do not', () => {
    // 80 pairs of adjacent, deeply-aggrieved rivals, each pair set well apart from the others.
    const w = feudWorld();
    const foes: EntityId[] = [];
    for (let i = 0; i < 80; i++) {
      const a = person(w, i * 4, 5), b = person(w, i * 4 + 1, 5);
      opine(w.getComponent<Relationships>(a, C_RELATIONSHIPS)!, b, 'rival', -0.9, 'a blood feud');
      foes.push(b);
    }
    runFeudSystem(w, cfg, createRNG(1));
    const harmed = foes.filter(b => health(w, b) < 1).length;
    expect(harmed).toBeGreaterThan(0);   // grudges drew blood

    // Control: the same crowd with NO grudges never fights.
    const calm = feudWorld();
    const bystanders: EntityId[] = [];
    for (let i = 0; i < 80; i++) { person(calm, i * 4, 5); bystanders.push(person(calm, i * 4 + 1, 5)); }
    runFeudSystem(calm, cfg, createRNG(1));
    expect(bystanders.every(b => health(calm, b) === 1)).toBe(true);
  });
});

describe('reconciliation — grudges cool over time (M29 s2)', () => {
  it('a rival sentiment drifts back toward neutral each day', () => {
    const w = feudWorld();
    const a = person(w, 0, 0), b = person(w, 40, 40);   // far apart → no fight, just the daily cooling
    const rel = w.getComponent<Relationships>(a, C_RELATIONSHIPS)!;
    opine(rel, b, 'rival', -0.5, 'an old quarrel');
    runFeudSystem(w, cfg, createRNG(1));
    expect(rel.edges[b].sentiment).toBeGreaterThan(-0.5);   // healed a little
    expect(rel.edges[b].sentiment).toBeLessThan(0);          // but not yet forgiven
  });
});

describe('hereditary feuds — grudges pass down (M29 s2)', () => {
  it('a child is born into a parent’s deep grudge against a living foe (weaker)', () => {
    const content = testContent();
    const species = content.species.require('human');
    const w = new World();
    const rng = createRNG(5);
    // a foe, and a parent who deeply resents them
    const foe = person(w, 10, 10);
    const father = person(w, 0, 0), mother = person(w, 0, 1);
    opine(w.getComponent<Relationships>(father, C_RELATIONSHIPS)!, foe, 'rival', -0.8, 'slew his brother');
    // the child inherits the grudge (a born child has parents)
    const child = spawnAgent(w, cfg, rng, species, content, { x: 0, y: 2, ageTicks: 0, parents: [father, mother] });
    const edge = w.getComponent<Relationships>(child, C_RELATIONSHIPS)!.edges[foe];
    expect(edge).toBeDefined();
    expect(edge.type).toBe('rival');
    expect(edge.sentiment).toBeLessThan(0);
    expect(edge.sentiment).toBeGreaterThan(-0.8);            // inherited weaker than first-hand
    expect(edge.reason).toMatch(/inherited .* feud with /);
  });
});

describe('crime falls on a rival when one is at hand (M29 s2)', () => {
  it('a wicked offender strikes their rival over a random bystander', () => {
    const forceCrime = { ...cfg, crimeChancePerDay: 1 };
    const w = feudWorld();
    // a wicked offender, their rival to one side, an innocent bystander to the other
    const e = person(w, 5, 5);
    w.getComponent<Alignment>(e, C_ALIGNMENT)!.good = -0.5;   // wicked → will offend
    const rival = person(w, 6, 5);
    const bystander = person(w, 4, 5);
    opine(w.getComponent<Relationships>(e, C_RELATIONSHIPS)!, rival, 'rival', -0.7, 'an old score');
    const rH = w.getComponent<Health>(rival, C_HEALTH)!, bH = w.getComponent<Health>(bystander, C_HEALTH)!;
    const rW = w.getComponent<Wallet>(rival, C_WALLET)!, bW = w.getComponent<Wallet>(bystander, C_WALLET)!;
    runCrimeSystem(w, forceCrime, createRNG(2));
    // the rival was the mark (lost health or gold); the bystander was spared
    expect(rH.value < 1 || rW.gold < 20).toBe(true);
    expect(bH.value === 1 && bW.gold === 20).toBe(true);
  });
});
