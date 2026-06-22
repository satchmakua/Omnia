import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultConfig } from '../src/sim/config.ts';
import { loadSimConfig } from '../src/sim/configLoader.ts';

describe('loadSimConfig', () => {
  it('the shipped config/simulation.yaml loads to the tuned defaults', () => {
    // Drift guard: the authoritative YAML mirrors the typed defaults, so loading it
    // changes nothing — and a future config.ts edit not mirrored to the YAML fails here.
    const cfg = loadSimConfig(readFileSync('config/simulation.yaml', 'utf8'));
    expect(cfg).toEqual(defaultConfig);
  });

  it('a partial YAML overrides only the named tunables (the rest fall back to defaults)', () => {
    const cfg = loadSimConfig('seed: 42\nmaxPopulation: 99');
    expect(cfg.seed).toBe(42);
    expect(cfg.maxPopulation).toBe(99);
    expect(cfg.gridWidth).toBe(defaultConfig.gridWidth);   // untouched → default
  });

  it('fails loud on an unknown key, a non-number, or a non-mapping', () => {
    expect(() => loadSimConfig('notAKnob: 1')).toThrow(/unknown tunable/);
    expect(() => loadSimConfig('seed: "hello"')).toThrow(/finite number/);
    expect(() => loadSimConfig('42')).toThrow(/mapping/);
  });
});
