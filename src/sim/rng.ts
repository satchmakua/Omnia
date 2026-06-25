// Seeded pseudo-random number generator (Mulberry32).
// All randomness in sim code must flow through this. Math.random() is banned in sim code.

// A seeded RNG is callable (returns the next float). The real `createRNG` also exposes its
// internal state so a run can be snapshotted and resumed at the exact position (M12). The
// accessors are optional so stateless test-double RNGs (`() => 0.5`) still satisfy the type.
export interface RNG {
  (): number;
  getState?(): number;
  setState?(s: number): void;
}

export function createRNG(seed: number): RNG {
  let s = seed >>> 0;
  const rng = function rng(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  } as RNG;
  rng.getState = () => s;
  rng.setState = (v: number) => { s = v >>> 0; };
  return rng;
}

export function rngInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function rngFloat(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function rngChoice<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
