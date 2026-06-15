import { describe, it, expect } from 'vitest';
import { createRNG } from '../src/sim/rng.ts';
import {
  createChronicle, chronicleAdd, chronicleRecent, summarizeEra, consolidateChronicle,
} from '../src/history/chronicle.ts';
import type { ChronicleEntry } from '../src/history/chronicle.ts';
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

  it('gates out events below the importance threshold', () => {
    const c = createChronicle();
    chronicleAdd(c, { tick: 1, importance: 0.3, text: 'trivial' }, 0.6); // dropped
    chronicleAdd(c, { tick: 2, importance: 0.8, text: 'notable' }, 0.6); // kept
    expect(c.entries.map(e => e.text)).toEqual(['notable']);
  });
});

describe('Chronicle compression', () => {
  function block(): ChronicleEntry[] {
    return [
      { tick: 10, importance: 1.0, kind: 'founding', text: 'the Sundering came' },
      { tick: 20, importance: 0.65, kind: 'birth', text: 'a child was born' },
      { tick: 30, importance: 0.65, kind: 'birth', text: 'a child was born' },
      { tick: 40, importance: 0.7, kind: 'marriage', text: 'two were wed' },
      { tick: 50, importance: 0.7, kind: 'death', text: 'someone died' },
    ];
  }

  it('summarizeEra keeps the legend named and tallies the ordinary by kind', () => {
    const era = summarizeEra(block(), 0.85);
    expect(era.fromTick).toBe(10);
    expect(era.toTick).toBe(50);
    expect(era.importance).toBeCloseTo(1.0);
    expect(era.text).toContain('the Sundering came');   // the legend survives by name
    expect(era.text).toContain('2 births');
    expect(era.text).toContain('1 wedding');
    expect(era.text).toContain('1 death');
    expect(era.text).not.toContain('a child was born'); // ordinary events dissolve into the tally
  });

  it('consolidateChronicle rolls overflow into an era and keeps the recent sharp', () => {
    const c = createChronicle();
    for (let i = 0; i < 12; i++) chronicleAdd(c, { tick: i, importance: 0.7, kind: 'birth', text: `b${i}` });
    expect(consolidateChronicle(c, 8, 4, 0.85, 3)).toBe(true);
    expect(c.entries.map(e => e.text)).toEqual(['b8', 'b9', 'b10', 'b11']); // 4 most-recent kept raw
    expect(c.eras.length).toBe(1);
    expect(c.eras[0].text).toContain('8 births'); // the 8 oldest dissolved into a tally

    expect(consolidateChronicle(c, 8, 4, 0.85, 3)).toBe(false); // back under cap → no-op
  });

  it('bounds the era list by merging the oldest ages', () => {
    const c = createChronicle();
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 10; i++) chronicleAdd(c, { tick: r * 100 + i, importance: 0.7, kind: 'death', text: 'x' });
      consolidateChronicle(c, 5, 2, 0.85, 2);
    }
    expect(c.eras.length).toBeLessThanOrEqual(2); // maxEras respected via merging
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
