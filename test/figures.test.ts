// Historical figures (M20): the epithet logic, the bounded store, and the LegendSystem
// enshrining notable folk (once) and keeping them after death.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_COMBAT, C_CLOCK, C_FIGURES, C_LINEAGE } from '../src/sim/components.ts';
import type { Agent, Combat, Clock, Lineage } from '../src/sim/components.ts';
import { epithetFor, pruneFigures, isEnshrined, createFigures } from '../src/history/figures.ts';
import type { FiguresData } from '../src/sim/components.ts';
import { runLegendSystem } from '../src/sim/systems/LegendSystem.ts';

const cfg = defaultConfig;
const base = { murders: 0, kills: 0, mastery: 0, isLeader: false, ageYears: 30, lifespanYears: 80, children: 0, standing: 0.5 };

describe('epithetFor (M20)', () => {
  it('reads a deed into an epithet, most striking first', () => {
    expect(epithetFor(base)).toBeNull();
    expect(epithetFor({ ...base, kills: 10 })!.epithet).toBe('the Slayer');
    expect(epithetFor({ ...base, murders: 4 })!.epithet).toBe('the Cruel');
    expect(epithetFor({ ...base, mastery: 5 })!.epithet).toBe('the Archmage');
    expect(epithetFor({ ...base, isLeader: true, ageYears: 60 })!.epithet).toBe('the Wise');
    expect(epithetFor({ ...base, ageYears: 78, lifespanYears: 80 })!.epithet).toBe('the Elder');
    expect(epithetFor({ ...base, children: 6 })!.epithet).toBe('the Progenitor');
    expect(epithetFor({ ...base, standing: 0.9 })!.epithet).toBe('the Renowned');
  });
  it('priority: a murderous slayer is remembered for cruelty, not kills', () => {
    expect(epithetFor({ ...base, murders: 5, kills: 20 })!.epithet).toBe('the Cruel');
  });
});

describe('figures store (M20)', () => {
  it('pruneFigures drops the oldest DEAD beyond the cap, keeps the living', () => {
    const d: FiguresData = createFigures();
    for (let i = 1; i <= 6; i++) d.figures.push({ id: i, name: `F${i}`, epithet: 'x', basis: 'y', bornTick: 0, enshrinedTick: i });
    const alive = new Set([5, 6]);   // ids 5 & 6 still live
    pruneFigures(d, 3, (id) => !alive.has(id));
    expect(d.figures.length).toBe(3);
    expect(d.figures.some(f => f.id === 5)).toBe(true);   // living kept
    expect(d.figures.some(f => f.id === 6)).toBe(true);
    expect(d.figures.some(f => f.id === 1)).toBe(false);  // oldest dead dropped first
  });
});

// ── LegendSystem ──────────────────────────────────────────────────────────────────
function legendWorld(): { w: World; figs: FiguresData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  const figs = createFigures();
  w.addComponent<FiguresData>(w.createEntity(), C_FIGURES, figs);
  return { w, figs };
}
function hero(w: World, kills: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `Hero${e}`, action: 'wander', ticksAlive: 30 * ticksPerYear(cfg), wealthGoal: 50, sex: 'male', lifespanTicks: 80 * ticksPerYear(cfg) });
  w.addComponent<Combat>(e, C_COMBAT, { scars: 0, kills });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
  return e;
}

describe('LegendSystem (M20)', () => {
  it('enshrines a great slayer once, and keeps them after death', () => {
    const { w, figs } = legendWorld();
    const e = hero(w, 12);
    runLegendSystem(w, cfg);
    expect(figs.figures.length).toBe(1);
    expect(figs.figures[0].epithet).toBe('the Slayer');
    expect(isEnshrined(figs, e)).toBe(true);

    runLegendSystem(w, cfg);                 // a second pass doesn't double-enshrine
    expect(figs.figures.length).toBe(1);

    w.removeComponent(e, C_AGENT);           // the hero dies (becomes a tombstone in the real sim)
    runLegendSystem(w, cfg);
    expect(figs.figures.length).toBe(1);     // their legend persists
  });

  it('leaves an ordinary soul out of the histories', () => {
    const { w, figs } = legendWorld();
    hero(w, 1);   // a single kill — not the stuff of legend
    runLegendSystem(w, cfg);
    expect(figs.figures.length).toBe(0);
  });
});
