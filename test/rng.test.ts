import { describe, it, expect } from 'vitest';
import { createRNG, rngInt, rngFloat, rngChoice } from '../src/sim/rng.ts';

describe('createRNG', () => {
  it('produces values in [0, 1)', () => {
    const rng = createRNG(42);
    for (let i = 0; i < 2_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic: same seed → same sequence', () => {
    const a = createRNG(123);
    const b = createRNG(123);
    for (let i = 0; i < 200; i++) expect(a()).toBe(b());
  });

  it('different seeds → different sequences', () => {
    const a = createRNG(1);
    const b = createRNG(2);
    const va = Array.from({ length: 20 }, () => a());
    const vb = Array.from({ length: 20 }, () => b());
    expect(va).not.toEqual(vb);
  });
});

describe('rngInt', () => {
  it('always in [min, max]', () => {
    const rng = createRNG(7);
    for (let i = 0; i < 1_000; i++) {
      const v = rngInt(rng, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('produces integers', () => {
    const rng = createRNG(7);
    for (let i = 0; i < 100; i++) expect(Number.isInteger(rngInt(rng, 0, 100))).toBe(true);
  });
});

describe('rngFloat', () => {
  it('always in [min, max)', () => {
    const rng = createRNG(5);
    for (let i = 0; i < 500; i++) {
      const v = rngFloat(rng, 2.0, 8.0);
      expect(v).toBeGreaterThanOrEqual(2.0);
      expect(v).toBeLessThan(8.0);
    }
  });
});

describe('rngChoice', () => {
  it('always picks an element from the array', () => {
    const rng = createRNG(99);
    const arr = ['a', 'b', 'c', 'd'] as const;
    for (let i = 0; i < 200; i++) expect(arr).toContain(rngChoice(rng, arr));
  });
});
