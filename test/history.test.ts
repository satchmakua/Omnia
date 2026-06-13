import { describe, it, expect } from 'vitest';
import { createRNG } from '../src/sim/rng.ts';
import { createChronicle, chronicleAdd, chronicleRecent } from '../src/history/chronicle.ts';
import { generateBackstory } from '../src/history/backstory.ts';
import type { TileMapData } from '../src/world/tilemap.ts';

function map(): TileMapData {
  // 4x4, mostly "Plains" with one "Forest" tile → Plains dominant.
  const biomeIndex = new Uint16Array(16);
  biomeIndex[0] = 1;
  return {
    width: 4, height: 4, biomeIndex,
    biomeIds: ['plains', 'forest'], biomeNames: ['Plains', 'Forest'],
    colors: ['#0a0', '#070'], passableByBiome: [true, true],
  };
}

describe('Chronicle', () => {
  it('appends and reads back most-recent-first', () => {
    const c = createChronicle();
    chronicleAdd(c, { tick: 1, importance: 0.5, text: 'first' });
    chronicleAdd(c, { tick: 2, importance: 0.5, text: 'second' });
    expect(chronicleRecent(c, 10).map(e => e.text)).toEqual(['second', 'first']);
  });

  it('recent(n) limits the count', () => {
    const c = createChronicle();
    for (let i = 0; i < 10; i++) chronicleAdd(c, { tick: i, importance: 0.5, text: `e${i}` });
    expect(chronicleRecent(c, 3).length).toBe(3);
  });
});

describe('generateBackstory', () => {
  it('is deterministic for a given seed', () => {
    const a = generateBackstory(createRNG(7), map());
    const b = generateBackstory(createRNG(7), map());
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = generateBackstory(createRNG(1), map());
    const b = generateBackstory(createRNG(2), map());
    expect(a).not.toEqual(b);
  });

  it('produces high-importance legend entries that mention the dominant landscape', () => {
    const entries = generateBackstory(createRNG(3), map());
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (const e of entries) expect(e.importance).toBeGreaterThanOrEqual(0.9);
    expect(entries.some(e => e.text.toLowerCase().includes('plains'))).toBe(true);
  });
});
