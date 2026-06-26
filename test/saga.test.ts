// The world-history generator (M20 s2c): the ages-of-civilization saga, composed from the
// durable record — a pure read that turns the same state into the same story.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { worldHistory } from '../src/history/saga.ts';
import { testContent } from './helpers.ts';

describe('worldHistory (M20 s2c)', () => {
  it('is graceful on an empty world (still narrates the present)', () => {
    const sections = worldHistory(new World(), defaultConfig);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some(s => s.heading === 'The Present Day')).toBe(true);
  });

  it('narrates a lived-in town: founding, the ages climbed, and the present', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 8 }, testContent());
    runTicks(sim.world, sim.rng, defaultConfig, sim.clockEntity, sim.content, 12000);
    const sections = worldHistory(sim.world, defaultConfig);
    const byHeading = new Map(sections.map(s => [s.heading, s.text]));

    // Founding names the clans the town descends from.
    expect(byHeading.has('The Founding')).toBe(true);
    expect(byHeading.get('The Founding')).toMatch(/clan/);

    // The ages section always appears and names an age the town stands in.
    expect(byHeading.has('The Ages of Civilization')).toBe(true);
    expect(byHeading.get('The Ages of Civilization')).toMatch(/Age/);

    // The present reports a living population in some year.
    const present = byHeading.get('The Present Day')!;
    expect(present).toMatch(/year \d+/);
    expect(present).toMatch(/souls?/);
  }, 20_000);

  it('is deterministic — the same state tells the same story', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 8 }, testContent());
    runTicks(sim.world, sim.rng, defaultConfig, sim.clockEntity, sim.content, 4000);
    const a = worldHistory(sim.world, defaultConfig);
    const b = worldHistory(sim.world, defaultConfig);   // re-read, no mutation
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 20_000);
});
