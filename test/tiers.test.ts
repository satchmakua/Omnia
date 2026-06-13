import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { C_AGENT, C_FAUNA, C_FLORA, C_RESOURCE } from '../src/sim/components.ts';
import { brainTier, isSapient, hasSingleTier } from '../src/sim/tiers.ts';
import { createSimulation } from '../src/sim/world.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { testContent } from './helpers.ts';

describe('brain tiers', () => {
  it('classifies each entity kind correctly', () => {
    const w = new World();
    const agent = w.createEntity(); w.addComponent(agent, C_AGENT, {});
    const fauna = w.createEntity(); w.addComponent(fauna, C_FAUNA, {});
    const flora = w.createEntity(); w.addComponent(flora, C_FLORA, {});
    const res   = w.createEntity(); w.addComponent(res, C_RESOURCE, {});

    expect(brainTier(w, agent)).toBe('sapient');
    expect(brainTier(w, fauna)).toBe('fauna');
    expect(brainTier(w, flora)).toBe('none');
    expect(brainTier(w, res)).toBe('none');
  });

  it('only sapient agents are LLM-eligible', () => {
    const w = new World();
    const agent = w.createEntity(); w.addComponent(agent, C_AGENT, {});
    const fauna = w.createEntity(); w.addComponent(fauna, C_FAUNA, {});
    expect(isSapient(w, agent)).toBe(true);
    expect(isSapient(w, fauna)).toBe(false);  // fauna get NO LLM, ever
  });

  it('in a generated world, no entity carries two brain tiers', () => {
    const { world } = createSimulation({ ...defaultConfig, seed: 5 }, testContent());
    for (const e of world.query()) {
      expect(hasSingleTier(world, e), `entity ${e} has multiple tiers`).toBe(true);
    }
  });

  it('fauna entities are never sapient in a generated world', () => {
    const { world } = createSimulation({ ...defaultConfig, seed: 5 }, testContent());
    for (const e of world.query(C_FAUNA)) {
      expect(brainTier(world, e)).toBe('fauna');
      expect(isSapient(world, e)).toBe(false);
    }
  });
});
