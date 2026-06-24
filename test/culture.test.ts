import { describe, it, expect } from 'vitest';
import {
  createCultureStore, cultureForLanguage, getCulture, wealthGoalFactor,
} from '../src/culture/cultureStore.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { C_AGENT, C_LINEAGE } from '../src/sim/components.ts';
import type { Agent, Lineage } from '../src/sim/components.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { testContent } from './helpers.ts';

const content = testContent();

describe('seed cultures load', () => {
  it('provides the two authored cultures, each speaking a real tongue', () => {
    expect(content.cultures.has('vant_kin')).toBe(true);
    expect(content.cultures.has('drakhan_clans')).toBe(true);
    for (const c of content.cultures.all()) {
      expect(content.languages.has(c.language)).toBe(true);
    }
  });
});

describe('culture store', () => {
  it('seeds from content and is independent of it (deep-cloned)', () => {
    const store = createCultureStore(content);
    expect(getCulture(store, 'vant_kin')?.name).toBe('Vant-kin');
    store.byId.vant_kin.values.communal = 0;            // mutate the runtime copy
    expect(content.cultures.require('vant_kin').values.communal).not.toBe(0); // content untouched
  });

  it('cultureForLanguage maps a tongue to its culture', () => {
    const store = createCultureStore(content);
    expect(cultureForLanguage(store, 'old_vant')).toBe('vant_kin');
    expect(cultureForLanguage(store, 'drakhan')).toBe('drakhan_clans');
  });
});

describe('causal coupling (D26): communal value lowers wealth goal', () => {
  it('wealthGoalFactor is monotonic and bounded', () => {
    const f = (communal: number) => wealthGoalFactor({ communal, martial: 0.5, traditional: 0.5, open: 0.5 });
    expect(f(0)).toBeGreaterThan(f(1));            // individualists aim higher than communalists
    expect(f(0)).toBeCloseTo(1.3);
    expect(f(1)).toBeCloseTo(0.7);
    expect(f(0.5)).toBeCloseTo(1.0);
  });

  it('the more communal culture ends up with a lower mean wealth goal in a real town', () => {
    const cfg = { ...defaultConfig, initialPopulation: 80, seed: 5 };
    const { world } = createSimulation(cfg, content);
    const sums: Record<string, { total: number; n: number }> = {};
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      if (!a.cultureId) continue;
      (sums[a.cultureId] ??= { total: 0, n: 0 });
      sums[a.cultureId].total += a.wealthGoal;
      sums[a.cultureId].n += 1;
    }
    const mean = (id: string) => sums[id].total / sums[id].n;
    // vant_kin (communal 0.75) is more communal than drakhan_clans (0.35).
    expect(mean('vant_kin')).toBeLessThan(mean('drakhan_clans'));
  });
});

describe('agents belong to a culture, and children inherit the mother’s', () => {
  it('founders take their species’ culture', () => {
    const { world } = createSimulation({ ...defaultConfig, seed: 5 }, content);
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      expect(a.cultureId === 'vant_kin' || a.cultureId === 'drakhan_clans').toBe(true);
    }
  });

  it('a locally-born child shares its mother’s culture', () => {
    const cfg = { ...defaultConfig, seed: 8 };
    const sim = createSimulation(cfg, content);
    runTicks(sim.world, sim.rng, cfg, sim.clockEntity, content, 8000);
    let checked = 0;
    for (const e of sim.world.query(C_AGENT, C_LINEAGE)) {
      const lin = sim.world.getComponent<Lineage>(e, C_LINEAGE)!;
      if (lin.parents.length < 2) continue;                 // not locally born
      const mother = lin.parents[0];                         // ReproductionSystem pushes [mother, father]
      if (!sim.world.hasComponent(mother, C_AGENT)) continue; // mother may have died
      const child = sim.world.getComponent<Agent>(e, C_AGENT)!;
      const mum = sim.world.getComponent<Agent>(mother, C_AGENT)!;
      // A child inherits its mother's culture at birth, but a *schism* later in the run
      // can break either of them away into a daughter culture (id `root.d<tick>`), so
      // their exact ids may diverge. The invariant that survives is the family root —
      // they always belong to the same founding culture's tree.
      const root = (id: string | undefined) => id?.split('.')[0];
      expect(root(child.cultureId)).toBe(root(mum.cultureId));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);                      // some births actually happened
  }, 20_000);
});
