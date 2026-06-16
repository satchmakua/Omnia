import { describe, it, expect } from 'vitest';
import { createRNG } from '../src/sim/rng.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT } from '../src/sim/components.ts';
import type { Agent } from '../src/sim/components.ts';
import { createLanguageStore, getLanguageStore, forkLanguage } from '../src/lang/languageStore.ts';
import { createCultureStore, getCultureStore, forkCulture } from '../src/culture/cultureStore.ts';
import { maybeSchism } from '../src/culture/schism.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { C_CHRONICLE } from '../src/sim/components.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { testContent } from './helpers.ts';

const content = testContent();

describe('forkLanguage', () => {
  it('coins a distinct daughter tongue linked to its parent', () => {
    const store = createLanguageStore(content);
    const id = forkLanguage(store, 'old_vant', 100, createRNG(2));
    const d = store.byId[id];
    expect(id).toBe('old_vant.d100');
    expect(d.parent).toBe('old_vant');
    expect(d.foundedTick).toBe(100);
    expect(d.name.length).toBeGreaterThan(0);
    // already diverged: its inventory differs from the parent's.
    expect(JSON.stringify(d.phonemes)).not.toBe(JSON.stringify(store.byId.old_vant.phonemes));
  });

  it('is deterministic', () => {
    const a = createLanguageStore(content); forkLanguage(a, 'old_vant', 7, createRNG(1));
    const b = createLanguageStore(content); forkLanguage(b, 'old_vant', 7, createRNG(1));
    expect(a.byId['old_vant.d7']).toEqual(b.byId['old_vant.d7']);
  });
});

describe('forkCulture', () => {
  it('forks a tighter, distinct daughter culture tied to the new tongue', () => {
    const store = createCultureStore(content);
    const id = forkCulture(store, 'vant_kin', 'old_vant.d5', 'Tolmuk', 5, 0.2, createRNG(3));
    const d = store.byId[id];
    expect(d.parent).toBe('vant_kin');
    expect(d.language).toBe('old_vant.d5');
    expect(d.name).toBe('Tolmuk-kin');
    expect(d.cohesion).toBeGreaterThan(store.byId.vant_kin.cohesion);  // a tight new sect
    expect(JSON.stringify(d.values)).not.toBe(JSON.stringify(store.byId.vant_kin.values)); // nudged apart
  });
});

describe('maybeSchism', () => {
  // A high chance (≥ 1/(1−cohesion)) guarantees a fire on the first eligible culture.
  const forced = { ...defaultConfig, seed: 5, schismChancePerEra: 5, minSchismMembers: 2 };

  function run(seed: number) {
    const sim = createSimulation({ ...forced, seed }, content);
    const cstore = getCultureStore(sim.world)!;
    const lstore = getLanguageStore(sim.world)!;
    const before = Object.keys(cstore.byId).length;
    const res = maybeSchism(sim.world, cstore, lstore, forced, sim.rng, 5000);
    return { sim, cstore, lstore, before, res };
  }

  it('fractures a culture and grows the culture + language family trees', () => {
    const { cstore, lstore, before, res } = run(5);
    expect(res).not.toBeNull();
    expect(Object.keys(cstore.byId).length).toBe(before + 1);          // a daughter culture appeared
    const dc = cstore.byId[res!.daughterCulture];
    expect(dc.parent).toBe(res!.parentCulture);                         // culture descent
    expect(lstore.byId[res!.daughterLanguage].parent)
      .toBe(cstore.byId[res!.parentCulture].language);                  // the daughter tongue descends from the parent's
    expect(res!.moved).toBeGreaterThan(0);
  });

  it('reassigns the breakaway faction to the daughter culture', () => {
    const { sim, res } = run(5);
    let inDaughter = 0;
    for (const e of sim.world.query(C_AGENT)) {
      if (sim.world.getComponent<Agent>(e, C_AGENT)!.cultureId === res!.daughterCulture) inDaughter++;
    }
    expect(inDaughter).toBe(res!.moved);
  });

  it('is deterministic', () => {
    const a = run(5), b = run(5);
    expect(a.res).toEqual(b.res);
    expect(Object.keys(a.cstore.byId).sort()).toEqual(Object.keys(b.cstore.byId).sort());
  });
});

describe('schism through the live loop', () => {
  it('a forced schism is recorded as a Chronicle legend', () => {
    const cfg = { ...defaultConfig, seed: 5, schismChancePerEra: 5, minSchismMembers: 4, initialPopulation: 30 };
    const sim = createSimulation(cfg, content);
    runTicks(sim.world, sim.rng, cfg, sim.clockEntity, content, 6000); // ≥ 1 era
    const cstore = getCultureStore(sim.world)!;
    expect(Object.keys(cstore.byId).length).toBeGreaterThan(2);        // daughters formed
    const chron = sim.world.getComponent<ChronicleData>(sim.world.query(C_CHRONICLE)[0], C_CHRONICLE)!;
    const all = [...chron.entries, ...chron.eras].map(e => e.text).join(' ');
    expect(all).toMatch(/schismed/);
  }, 20_000);
});
