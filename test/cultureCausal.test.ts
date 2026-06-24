import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK, C_CULTURESTORE,
} from '../src/sim/components.ts';
import type { Agent, Needs, Position, Relationships, Lineage, Clock, Sex } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import { runSocialSystem } from '../src/sim/systems/SocialSystem.ts';
import { bondFactor, prefersEndogamy } from '../src/culture/cultureStore.ts';
import type { CultureStoreData, RuntimeCulture } from '../src/culture/cultureStore.ts';

const cfg = defaultConfig;

function culture(id: string, open: number, traditional: number): RuntimeCulture {
  return { id, name: id, language: 'x', cohesion: 0.5, practices: [],
    values: { communal: 0.5, martial: 0.5, traditional, open } };
}

function world(cultures: RuntimeCulture[]): { w: World; cstore: CultureStoreData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
  const cstore: CultureStoreData = { byId: {}, lastEvolveTick: 0 };
  for (const c of cultures) cstore.byId[c.id] = c;
  w.addComponent<CultureStoreData>(w.createEntity(), C_CULTURESTORE, cstore);
  return { w, cstore };
}

function addAgent(w: World, x: number, y: number, cultureId: string, sex: Sex = 'female'): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: cultureId, action: 'wander', ticksAlive: 30 * ticksPerYear(cfg),
    wealthGoal: 50, sex, lifespanTicks: 1e9, cultureId,
  });
  w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 0.5 });
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
  return e;
}

describe('culture → behaviour helpers (D26)', () => {
  it('bondFactor: full within a culture, average-openness (floored) across cultures', () => {
    const a = culture('a', 0.9, 0.5), b = culture('b', 0.1, 0.5);
    expect(bondFactor(a, a)).toBe(1);                       // same culture
    expect(bondFactor(a, b)).toBeCloseTo(0.5, 6);           // (0.9 + 0.1) / 2
    expect(bondFactor(culture('x', 0, 0), culture('y', 0, 0))).toBe(0.15); // floor
    expect(bondFactor(undefined, b)).toBe(1);               // no culture ⇒ unbiased
  });

  it('prefersEndogamy: traditional folk roll to marry within', () => {
    expect(prefersEndogamy(culture('t', 0.5, 1.0), 0.99)).toBe(true);   // always
    expect(prefersEndogamy(culture('t', 0.5, 0.0), 0.0)).toBe(false);   // never
    expect(prefersEndogamy(undefined, 0)).toBe(false);
  });
});

describe('open → cross-culture friendship is damped (D26)', () => {
  it('a same-culture pair warms faster than an open↔insular pair', () => {
    const { w } = world([culture('open', 0.9, 0.5), culture('ins', 0.1, 0.5)]);
    const a1 = addAgent(w, 5, 5, 'open');   const a2 = addAgent(w, 6, 5, 'open');  // same culture
    const b1 = addAgent(w, 20, 20, 'open'); const b2 = addAgent(w, 21, 20, 'ins'); // cross culture
    const rng = createRNG(1);
    const noMarry = { ...cfg, marryChancePerDay: 0 };
    for (let i = 0; i < 12; i++) runSocialSystem(w, noMarry, rng);

    const sent = (p: EntityId, q: EntityId) => w.getComponent<Relationships>(p, C_RELATIONSHIPS)!.edges[q]?.sentiment ?? 0;
    expect(sent(a1, a2)).toBeGreaterThan(sent(b1, b2));   // same-culture bonds faster
    expect(sent(b1, b2)).toBeGreaterThan(0);              // outsiders still bond, just slower
  });
});

describe('traditional → endogamy in matchmaking (D26)', () => {
  // A male of `traditionalValue`, with an out-culture female listed FIRST and a
  // same-culture female second — who does he wed?
  function whoDoesHeMarry(traditionalValue: number): 'same' | 'other' {
    const { w } = world([culture('home', 0.5, traditionalValue), culture('away', 0.5, 0.5)]);
    const fOther = addAgent(w, 7, 5, 'away', 'female');   // lower id ⇒ first eligible
    const fSame = addAgent(w, 6, 5, 'home', 'female');
    const m = addAgent(w, 5, 5, 'home', 'male');
    // marryChance = 1 (always attempt) by setting per-day = ticksPerDay.
    runSocialSystem(w, { ...cfg, marryChancePerDay: cfg.ticksPerDay }, createRNG(1));
    const partner = w.getComponent<Lineage>(m, C_LINEAGE)!.partner;
    return partner === fSame ? 'same' : partner === fOther ? 'other' : 'same';
  }

  it('a traditional male weds within his culture; an innovative one takes the first match', () => {
    expect(whoDoesHeMarry(1.0)).toBe('same');    // endogamous → skips the first-listed outsider
    expect(whoDoesHeMarry(0.0)).toBe('other');   // indifferent → marries the first eligible
  });
});
