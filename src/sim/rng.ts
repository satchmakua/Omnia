// Seeded pseudo-random number generator (Mulberry32).
// All randomness in sim code must flow through this. Math.random() is banned in sim code.

export type RNG = () => number;

export function createRNG(seed: number): RNG {
  let s = seed >>> 0;
  return function rng(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
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
