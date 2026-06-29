// The Storyteller — the adaptive event director (M32). Drama is paced to the world's health: a placid
// town earns calamity, a reeling one earns respite. These tests pin the `calm` signal's response to
// world-state and the per-category chance modulation, plus the end-to-end adaptation over a run.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_STORYTELLER } from '../src/sim/components.ts';
import type { Agent } from '../src/sim/components.ts';
import { createStoryteller, updateDirector, eventChanceMultiplier, getStoryteller, asTemperament } from '../src/event/director.ts';
import type { Storyteller } from '../src/event/director.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const tpd = cfg.ticksPerDay;

function worldOf(mood: number, n: number): World {
  const w = new World();
  for (let i = 0; i < n; i++) {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: `M${e}`, action: 'wander', ticksAlive: 5000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, mood });
  }
  return w;
}

describe('the Director reads the world into a calm signal (M32)', () => {
  it('a placid, thriving, long-quiet town reads high calm', () => {
    const w = worldOf(0.9, 40);
    const st = createStoryteller(36);   // grew 36 → 40
    const calm = updateDirector(w, cfg, st, 200 * tpd, 40);   // long since the last drama (tick 0)
    expect(calm).toBeGreaterThan(0.75);
  });

  it('a reeling town — unhappy, shrinking, freshly battered — reads low calm', () => {
    const w = worldOf(0.2, 30);
    const st = createStoryteller(40);   // shrank 40 → 30
    st.lastDramaTick = 200 * tpd;       // a calamity *just* struck
    const calm = updateDirector(w, cfg, st, 200 * tpd, 30);
    expect(calm).toBeLessThan(0.4);
  });

  it('calm climbs back toward placid as quiet days pass since the last calamity', () => {
    const fresh = createStoryteller(40);  fresh.lastDramaTick = 100 * tpd;
    const settled = createStoryteller(40); settled.lastDramaTick = 100 * tpd;
    const w = worldOf(0.8, 40);
    const justAfter = updateDirector(w, cfg, fresh, 100 * tpd, 40);            // 0 days since
    const longAfter = updateDirector(w, cfg, settled, 130 * tpd, 40);         // 30 days of quiet
    expect(longAfter).toBeGreaterThan(justAfter);
  });
});

describe('the Director biases the dice by category (M32)', () => {
  const st = createStoryteller();
  it('a placid world invites calamity & the uncanny, stays fortune’s hand', () => {
    expect(eventChanceMultiplier('disaster', 0.9, st)).toBeGreaterThan(1);
    expect(eventChanceMultiplier('paranormal', 0.9, st)).toBeGreaterThan(1);
    expect(eventChanceMultiplier('fortune', 0.9, st)).toBeLessThan(1);
  });
  it('a reeling world earns fortune & is spared calamity', () => {
    expect(eventChanceMultiplier('disaster', 0.2, st)).toBeLessThan(1);
    expect(eventChanceMultiplier('fortune', 0.2, st)).toBeGreaterThan(1);
  });
  it('the turning of the seasons is unmodulated', () => {
    expect(eventChanceMultiplier('seasonal', 0.1, st)).toBe(1);
    expect(eventChanceMultiplier('seasonal', 0.9, st)).toBe(1);
  });
  it('the modulation is bounded — never zero, never runaway', () => {
    for (const calm of [0, 0.5, 1]) for (const cat of ['disaster', 'fortune', 'paranormal']) {
      const m = eventChanceMultiplier(cat, calm, st);
      expect(m).toBeGreaterThanOrEqual(0.2);
      expect(m).toBeLessThanOrEqual(3);
    }
  });
});

describe('selectable temperaments tune how hard the world pushes (M32 s2)', () => {
  const harsh = createStoryteller(0, 'harsh');
  const measured = createStoryteller(0, 'measured');
  const calm = createStoryteller(0, 'calm');

  it('Hard Times leans into calamity; the Calm Chronicler holds it back', () => {
    const d = (st: Storyteller) => eventChanceMultiplier('disaster', 0.7, st);
    expect(d(harsh)).toBeGreaterThan(d(measured));
    expect(d(measured)).toBeGreaterThan(d(calm));   // harsh > measured > calm
  });

  it('the Calm Chronicler keeps fortune flowing; Hard Times strangles it', () => {
    const f = (st: Storyteller) => eventChanceMultiplier('fortune', 0.7, st);
    expect(f(calm)).toBeGreaterThan(f(measured));
    expect(f(measured)).toBeGreaterThan(f(harsh));   // calm > measured > harsh
  });

  it('the Capricious swings the calm read day to day; the measured keel holds steady', () => {
    // at a long-settled recovery the measured calm is constant across days; capricious jitters.
    // (start lastPop at 40 so the trend is steady from the first day — no first-call spike.)
    const cap = createStoryteller(40, 'capricious');
    const steady = createStoryteller(40, 'measured');
    const capCalms = new Set<number>(), steadyCalms = new Set<number>();
    const w = worldOf(0.8, 40);
    for (let d = 80; d < 95; d++) {
      capCalms.add(Number(updateDirector(w, cfg, cap, d * tpd, 40).toFixed(4)));
      steadyCalms.add(Number(updateDirector(w, cfg, steady, d * tpd, 40).toFixed(4)));
    }
    expect(steadyCalms.size).toBe(1);          // the keel: one steady calm
    expect(capCalms.size).toBeGreaterThan(5);  // the Capricious: a different hand each day
  });

  it('an unknown temperament falls back to the measured keel', () => {
    expect(asTemperament('measured')).toBe('measured');
    expect(asTemperament('harsh')).toBe('harsh');
    expect(asTemperament('nonsense')).toBe('measured');
    expect(asTemperament('')).toBe('measured');
  });
});

describe('the Director is live & deterministic in a real run (M32)', () => {
  it('the singleton exists and tracks a sane calm over a run', () => {
    const content = testContent();
    const sim = createSimulation({ ...cfg, seed: 5 }, content);
    runTicks(sim.world, sim.rng, { ...cfg, seed: 5 }, sim.clockEntity, content, 6000);
    const st = getStoryteller(sim.world) as Storyteller;
    expect(st).toBeDefined();
    expect(st.calm).toBeGreaterThanOrEqual(0);
    expect(st.calm).toBeLessThanOrEqual(1);
    expect(sim.world.query(C_STORYTELLER).length).toBe(1);
  });
});
