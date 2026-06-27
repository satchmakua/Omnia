// Real animals (M21): recognizable wildlife — rabbit, deer, wild boar, wild horse (prey) and
// wolf, bear (predators) — woven into the biomes alongside the fantasy fauna, forming a real
// food web over the existing predator/prey FaunaSystem.
import { describe, it, expect } from 'vitest';
import { testContent } from './helpers.ts';

const content = testContent();
const REAL_PREY = ['rabbit', 'deer', 'wild_boar', 'wild_horse'];
const REAL_PREDATORS = ['wolf', 'bear'];

describe('real animals load with sensible roles (M21)', () => {
  it('the prey are grazers and the hunters are predators', () => {
    for (const id of REAL_PREY) {
      expect(content.fauna.has(id), id).toBe(true);
      expect(content.fauna.require(id).diet).toBe('grazer');
    }
    for (const id of REAL_PREDATORS) {
      expect(content.fauna.has(id), id).toBe(true);
      expect(content.fauna.require(id).diet).toBe('predator');
    }
  });

  it('rabbits breed fastest (the broad base) and big predators breed slowest', () => {
    const rabbit = content.fauna.require('rabbit');
    const bear = content.fauna.require('bear');
    // the prey base out-breeds every real predator
    for (const id of REAL_PREDATORS) {
      expect(rabbit.breedCooldownDays).toBeLessThan(content.fauna.require(id).breedCooldownDays);
    }
    expect(bear.size).toBe('large');
    expect(bear.diet).toBe('predator');
  });
});

describe('the food web is wired into the biomes (M21)', () => {
  it('every real animal appears in at least one biome spawn table', () => {
    const inTables = new Set<string>();
    for (const b of content.biomes.all()) for (const f of b.fauna) inTables.add(f.id);
    for (const id of [...REAL_PREY, ...REAL_PREDATORS]) {
      expect(inTables.has(id), `${id} is in no biome`).toBe(true);
    }
  });

  it('each passable land biome holds both grazers and predators (a working web)', () => {
    const diet = (id: string) => content.fauna.get(id)?.diet;
    for (const b of content.biomes.all()) {
      if (!b.passable || b.fauna.length === 0) continue;
      const diets = b.fauna.map(f => diet(f.id));
      expect(diets, `${b.id} grazers`).toContain('grazer');
      expect(diets, `${b.id} predators`).toContain('predator');
    }
  });
});
