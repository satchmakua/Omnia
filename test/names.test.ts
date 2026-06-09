import { describe, it, expect } from 'vitest';
import { createRNG } from '../src/sim/rng.ts';
import { generateName } from '../src/content/names.ts';
import { testContent } from './helpers.ts';

const content = testContent();

describe('generateName', () => {
  it('is deterministic for a given seed + species', () => {
    const human = content.species.require('human');
    const a = generateName(createRNG(7), human);
    const b = generateName(createRNG(7), human);
    expect(a).toBe(b);
  });

  it('capitalises the first letter and is non-empty', () => {
    const human = content.species.require('human');
    const rng = createRNG(1);
    for (let i = 0; i < 50; i++) {
      const name = generateName(rng, human);
      expect(name.length).toBeGreaterThan(0);
      expect(name[0]).toBe(name[0].toUpperCase());
    }
  });

  it('only uses sounds from the species pool', () => {
    const dwarf = content.species.require('dwarf');
    const pool = new Set([
      ...dwarf.nameSounds.onsets, ...dwarf.nameSounds.nuclei, ...dwarf.nameSounds.codas,
    ].join('').toLowerCase().split(''));
    const rng = createRNG(3);
    for (let i = 0; i < 50; i++) {
      const name = generateName(rng, dwarf).toLowerCase();
      for (const ch of name) expect(pool.has(ch)).toBe(true);
    }
  });

  it('produces statistically distinct name sets per species', () => {
    const human = content.species.require('human');
    const dwarf = content.species.require('dwarf');
    const rng = createRNG(99);
    const humans = new Set(Array.from({ length: 40 }, () => generateName(rng, human)));
    const dwarves = new Set(Array.from({ length: 40 }, () => generateName(rng, dwarf)));
    // Different sound pools ⇒ effectively no overlap between the two name sets.
    const overlap = [...humans].filter(n => dwarves.has(n));
    expect(overlap.length).toBe(0);
  });
});
