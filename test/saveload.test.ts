import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_FAUNA, C_FLORA, C_POSITION, C_CLOCK } from '../src/sim/components.ts';
import type { Agent, Position, Clock } from '../src/sim/components.ts';
import { createSimulation } from '../src/sim/world.ts';
import type { Simulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { buildSave, loadSave, serializeSave, parseSave, SAVE_VERSION } from '../src/sim/saveload.ts';
import { testContent } from './helpers.ts';

// A comparable fingerprint of a world: tick, headcounts, and every agent's id/name/
// position — enough to catch any divergence in state (entity ids are deterministic).
function snapshot(sim: Simulation): string {
  const w = sim.world;
  const tick = w.getComponent<Clock>(sim.clockEntity, C_CLOCK)!.tick;
  const agents = w.query(C_AGENT, C_POSITION).sort((a, b) => a - b).map(e => {
    const p = w.getComponent<Position>(e, C_POSITION)!;
    const a = w.getComponent<Agent>(e, C_AGENT)!;
    return `${e}:${a.name}@${p.x},${p.y}`;
  });
  return JSON.stringify({
    tick, pop: agents.length, fauna: w.query(C_FAUNA).length, flora: w.query(C_FLORA).length, agents,
  });
}

describe('save / load', () => {
  it('round-trips a save through JSON, failing loud on a bad version', () => {
    const save = buildSave(createSimulation({ ...defaultConfig, seed: 3 }, testContent()), { ...defaultConfig, seed: 3 });
    expect(save.version).toBe(SAVE_VERSION);
    expect(parseSave(serializeSave(save)).savedAtTick).toBe(save.savedAtTick);
    expect(() => parseSave('{"version":999,"savedAtTick":0,"config":{"seed":1},"ai":[]}')).toThrow(/version/);
    expect(() => parseSave('not json')).toThrow(/JSON/);
  });

  it('reloads to a byte-identical, continuable state', () => {
    const content = testContent();
    const cfg = { ...defaultConfig, seed: 8 };

    // Original run.
    const a = createSimulation(cfg, content);
    runTicks(a.world, a.rng, cfg, a.clockEntity, content, 6000);

    // Save → serialise → parse → load (replay).
    const loaded = loadSave(parseSave(serializeSave(buildSave(a, cfg))), content);

    // Identical state immediately after load.
    expect(snapshot(loaded)).toBe(snapshot(a));

    // …and continuable identically: run both forward, they stay in lock-step (proves
    // the RNG was restored exactly, not just the entity state).
    runTicks(a.world, a.rng, cfg, a.clockEntity, content, 1500);
    runTicks(loaded.world, loaded.rng, cfg, loaded.clockEntity, content, 1500);
    expect(snapshot(loaded)).toBe(snapshot(a));
  }, 20_000);
});
