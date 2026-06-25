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
import { nativeFluency, intelligibility, langSynergy, learnTongue } from '../src/lang/fluency.ts';
import type { Fluency } from '../src/lang/fluency.ts';
import type { CultureStoreData, RuntimeCulture } from '../src/culture/cultureStore.ts';

const cfg = defaultConfig;

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('fluency helpers (M10 slice 4, D26)', () => {
  it('nativeFluency: fluent (1) in one tongue, empty when cultureless', () => {
    expect(nativeFluency('vant')).toEqual({ vant: 1 });
    expect(nativeFluency(undefined)).toEqual({});
  });

  it('intelligibility: the best tongue both command (weaker speaker), 0 with none shared', () => {
    expect(intelligibility({ x: 1 }, { x: 1 })).toBe(1);            // same tongue
    expect(intelligibility({ x: 1 }, { y: 1 })).toBe(0);            // no common tongue
    expect(intelligibility({ x: 1, y: 0.3 }, { y: 1, x: 0.2 })).toBeCloseTo(0.3, 6); // best of the two
    expect(intelligibility(undefined, { y: 1 })).toBe(1);          // no map ⇒ neutral (old behaviour)
    expect(intelligibility({}, { y: 1 })).toBe(1);                 // empty map ⇒ neutral
  });

  it('langSynergy: ×1 when fully shared, floored when none shared, linear between', () => {
    expect(langSynergy(1, 0.4)).toBe(1);
    expect(langSynergy(0, 0.4)).toBe(0.4);
    expect(langSynergy(0.5, 0.4)).toBeCloseTo(0.7, 6);
  });

  it('learnTongue: bounded growth toward 1; no-op for unknown/own tongue', () => {
    const f: Fluency = { vant: 1 };
    learnTongue(f, 'drak', 0.5);
    expect(f.drak).toBeCloseTo(0.5, 6);
    learnTongue(f, 'drak', 0.5);
    expect(f.drak).toBeCloseTo(0.75, 6);   // diminishing returns
    learnTongue(f, 'vant', 0.5);
    expect(f.vant).toBe(1);                // already native — stays 1, never exceeds
    learnTongue(f, undefined, 0.5);        // unknown tongue — no throw, no change
    expect(Object.keys(f).sort()).toEqual(['drak', 'vant']);
    // Bounded: never overshoots past full fluency, however many repetitions.
    for (let i = 0; i < 1000; i++) learnTongue(f, 'drak', 0.5);
    expect(f.drak).toBeLessThanOrEqual(1);
    expect(f.drak).toBeGreaterThan(0.99);
  });
});

// ── Integration through SocialSystem (the causal coupling) ──────────────────────

function culture(id: string, language: string): RuntimeCulture {
  return { id, name: id, language, cohesion: 0.5, practices: [],
    values: { communal: 0.5, martial: 0.5, traditional: 0.5, open: 1.0 } }; // open=1 ⇒ bondFactor neutral
}

function world(cultures: RuntimeCulture[]): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
  const cstore: CultureStoreData = { byId: {}, lastEvolveTick: 0 };
  for (const c of cultures) cstore.byId[c.id] = c;
  w.addComponent<CultureStoreData>(w.createEntity(), C_CULTURESTORE, cstore);
  return w;
}

function addAgent(w: World, x: number, y: number, cultureId: string, fluency: Fluency, sex: Sex = 'female'): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: `${cultureId}@${x}`, action: 'wander', ticksAlive: 30 * ticksPerYear(cfg),
    wealthGoal: 50, sex, lifespanTicks: 1e9, cultureId, fluency,
  });
  w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 0.5 });
  w.addComponent<Position>(e, C_POSITION, { x, y });
  w.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
  return e;
}

const sent = (w: World, p: EntityId, q: EntityId) =>
  w.getComponent<Relationships>(p, C_RELATIONSHIPS)!.edges[q]?.sentiment ?? 0;
const noMarry = { ...cfg, marryChancePerDay: 0 };

describe('language synergy → same-tongue pairs bond faster (D26)', () => {
  it('a shared-tongue pair warms faster than a no-common-tongue pair (culture held neutral)', () => {
    const w = world([culture('va', 'vant'), culture('dr', 'drak')]);
    // Same tongue (both Vant), vs different tongues — both culture pairs are fully OPEN,
    // so bondFactor is 1 for both and the ONLY difference is mutual intelligibility.
    const s1 = addAgent(w, 5, 5, 'va', nativeFluency('vant'));
    const s2 = addAgent(w, 6, 5, 'va', nativeFluency('vant'));
    const d1 = addAgent(w, 20, 20, 'va', nativeFluency('vant'));
    const d2 = addAgent(w, 21, 20, 'dr', nativeFluency('drak'));
    const rng = createRNG(1);
    for (let i = 0; i < 12; i++) runSocialSystem(w, noMarry, rng);

    expect(sent(w, s1, s2)).toBeGreaterThan(sent(w, d1, d2));  // shared tongue bonds faster
    expect(sent(w, d1, d2)).toBeGreaterThan(0);                // strangers still bond, just slowly
  });
});

describe('gradual learning → mixed neighbours grow mutually intelligible', () => {
  it('two speakers of different tongues each learn the other’s over a life of contact', () => {
    const w = world([culture('va', 'vant'), culture('dr', 'drak')]);
    const a = addAgent(w, 5, 5, 'va', nativeFluency('vant'));
    const b = addAgent(w, 6, 5, 'dr', nativeFluency('drak'));
    const fa = w.getComponent<Agent>(a, C_AGENT)!.fluency!;
    const fb = w.getComponent<Agent>(b, C_AGENT)!.fluency!;

    expect(intelligibility(fa, fb)).toBe(0);   // at first, no common tongue
    const rng = createRNG(1);
    for (let i = 0; i < 300; i++) runSocialSystem(w, noMarry, rng);

    expect(fa.drak).toBeGreaterThan(0.2);      // each picked up the other's tongue…
    expect(fb.vant).toBeGreaterThan(0.2);
    expect(fa.drak).toBeLessThan(1);           // …but learning is gradual, never complete
    expect(fa.vant).toBe(1);                   // native tongue unchanged
    expect(intelligibility(fa, fb)).toBeGreaterThan(0.2);  // now mutually intelligible
  });
});
