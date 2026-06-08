import { describe, it, expect } from 'vitest';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_NEEDS, C_POSITION } from '../src/sim/components.ts';
import type { Agent, Needs, Position } from '../src/sim/components.ts';
import type { World } from '../src/sim/ecs.ts';

function captureState(world: World) {
  return world.query(C_AGENT, C_NEEDS, C_POSITION)
    .sort((a, b) => a - b)
    .map(e => ({
      id:     e,
      name:   world.getComponent<Agent>(e, C_AGENT)!.name,
      action: world.getComponent<Agent>(e, C_AGENT)!.action,
      hunger: world.getComponent<Needs>(e, C_NEEDS)!.hunger,
      energy: world.getComponent<Needs>(e, C_NEEDS)!.energy,
      x:      world.getComponent<Position>(e, C_POSITION)!.x,
      y:      world.getComponent<Position>(e, C_POSITION)!.y,
    }));
}

describe('Seed determinism', () => {
  it('same seed → identical state at tick 100', () => {
    const cfg = { ...defaultConfig, seed: 42 };

    const s1 = createSimulation(cfg);
    runTicks(s1.world, s1.rng, cfg, s1.clockEntity, 100);

    const s2 = createSimulation(cfg);
    runTicks(s2.world, s2.rng, cfg, s2.clockEntity, 100);

    expect(captureState(s1.world)).toEqual(captureState(s2.world));
  });

  it('different seeds → different states at tick 100', () => {
    const s1 = createSimulation({ ...defaultConfig, seed: 1 });
    runTicks(s1.world, s1.rng, { ...defaultConfig, seed: 1 }, s1.clockEntity, 100);

    const s2 = createSimulation({ ...defaultConfig, seed: 2 });
    runTicks(s2.world, s2.rng, { ...defaultConfig, seed: 2 }, s2.clockEntity, 100);

    expect(captureState(s1.world)).not.toEqual(captureState(s2.world));
  });
});
