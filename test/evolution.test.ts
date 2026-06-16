import { describe, it, expect } from 'vitest';
import { createRNG } from '../src/sim/rng.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_CLOCK } from '../src/sim/components.ts';
import type { Clock } from '../src/sim/components.ts';
import {
  createLanguageStore, getLanguage, getLanguageStore, applySoundChange, SOUND_SHIFTS,
} from '../src/lang/languageStore.ts';
import { createCultureStore, getCultureStore, getCulture, driftValues } from '../src/culture/cultureStore.ts';
import type { RuntimeCulture } from '../src/culture/cultureStore.ts';
import { runEvolutionSystem } from '../src/sim/systems/EvolutionSystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { testContent } from './helpers.ts';

const content = testContent();
const interval = defaultConfig.evolutionIntervalDays * defaultConfig.ticksPerDay;

function freshCulture(cohesion: number, v = 0.5): RuntimeCulture {
  return { id: 't', name: 'T', language: 'x', practices: [], cohesion,
    values: { communal: v, martial: v, traditional: v, open: v } };
}

// ── sound change ────────────────────────────────────────────────────────────────

describe('applySoundChange', () => {
  it('systematically replaces one phoneme with its shifted form', () => {
    const lang = getLanguage(createLanguageStore(content), 'old_vant')!;
    const change = applySoundChange(lang, createRNG(3));
    expect(change).not.toBeNull();
    expect(SOUND_SHIFTS[change!.from]).toBe(change!.to);
    const all = [...lang.phonemes.consonants, ...lang.phonemes.vowels];
    expect(all).not.toContain(change!.from);   // the old sound is gone
    expect(all).toContain(change!.to);          // the new sound is present
    expect(lang.phonemes.consonants.length).toBeGreaterThan(0);
    expect(lang.phonemes.vowels.length).toBeGreaterThan(0);
  });

  it('is deterministic for a given rng', () => {
    const a = applySoundChange(getLanguage(createLanguageStore(content), 'drakhan')!, createRNG(9));
    const b = applySoundChange(getLanguage(createLanguageStore(content), 'drakhan')!, createRNG(9));
    expect(a).toEqual(b);
  });
});

// ── value drift ─────────────────────────────────────────────────────────────────

describe('driftValues', () => {
  it('cohesion damps the drift, and values stay in [0,1]', () => {
    const low = freshCulture(0.0), high = freshCulture(0.9);
    driftValues(low, 0.1, createRNG(7));
    driftValues(high, 0.1, createRNG(7));  // same rng → same random factors, scaled by cohesion
    expect(Math.abs(low.values.communal - 0.5)).toBeGreaterThan(Math.abs(high.values.communal - 0.5));
    for (const k of ['communal', 'martial', 'traditional', 'open'] as const) {
      expect(low.values[k]).toBeGreaterThanOrEqual(0);
      expect(low.values[k]).toBeLessThanOrEqual(1);
    }
  });

  it('clamps to [0,1] under sustained pressure', () => {
    const c = freshCulture(0, 0.99);
    const r = createRNG(2);
    for (let i = 0; i < 500; i++) driftValues(c, 0.2, r);
    for (const k of ['communal', 'martial', 'traditional', 'open'] as const) {
      expect(c.values[k]).toBeGreaterThanOrEqual(0);
      expect(c.values[k]).toBeLessThanOrEqual(1);
    }
  });
});

// ── the scheduled EvolutionSystem ─────────────────────────────────────────────────

describe('runEvolutionSystem', () => {
  it('only evolves once per era', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 3 }, content);
    const clock = sim.world.getComponent<Clock>(sim.clockEntity, C_CLOCK)!;
    const cstore = getCultureStore(sim.world)!;

    clock.tick = interval;
    runEvolutionSystem(sim.world, defaultConfig, sim.rng);
    expect(cstore.lastEvolveTick).toBe(interval);
    const snapshot = JSON.stringify(getCulture(cstore, 'vant_kin')!.values);

    clock.tick = interval * 2 - 1;                 // not yet an era later
    runEvolutionSystem(sim.world, defaultConfig, sim.rng);
    expect(JSON.stringify(getCulture(cstore, 'vant_kin')!.values)).toBe(snapshot);

    clock.tick = interval * 2;                      // a full era later
    runEvolutionSystem(sim.world, defaultConfig, sim.rng);
    expect(JSON.stringify(getCulture(cstore, 'vant_kin')!.values)).not.toBe(snapshot);
  });

  it('languages accumulate sound changes and cultures drift over many eras (deterministically)', () => {
    function run(seed: number) {
      const sim = createSimulation({ ...defaultConfig, seed }, content);
      const clock = sim.world.getComponent<Clock>(sim.clockEntity, C_CLOCK)!;
      for (let era = 1; era <= 25; era++) {
        clock.tick = era * interval;
        runEvolutionSystem(sim.world, defaultConfig, sim.rng);
      }
      const lstore = getLanguageStore(sim.world)!;
      const vant = getCulture(getCultureStore(sim.world)!, 'vant_kin')!.values;
      return { changes: lstore.soundChanges, vant: { ...vant }, vantInv: [...lstore.byId.old_vant.phonemes.consonants] };
    }
    const a = run(4);
    expect(a.changes).toBeGreaterThan(0);                                   // tongues shifted
    expect(a.vant.communal).not.toBe(content.cultures.require('vant_kin').values.communal); // culture drifted
    expect(run(4)).toEqual(a);                                              // same seed → identical evolution
  });
});
