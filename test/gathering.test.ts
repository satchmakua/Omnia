import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_JOB, C_POSITION, C_RESOURCE, C_EVENTLOG, C_CLOCK,
} from '../src/sim/components.ts';
import type { Agent, Job, Resource } from '../src/sim/components.ts';
import { runGatherSystem } from '../src/sim/systems/GatherSystem.ts';
import { createEventLog, recentEvents } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';

const cfg = defaultConfig;

function worker(w: World, x: number, y: number, gathers: string | null, action: Agent['action'] = 'work') {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: 'Digg', action, ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Job>(e, C_JOB, { professionId: 'miner', professionName: 'Miner', employer: 1, wagePerTick: 0.04, gathers });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}

function oreNode(w: World, x: number, y: number, amount: number, renewable = false) {
  const e = w.createEntity();
  w.addComponent<Resource>(e, C_RESOURCE, { typeId: 'ore', name: 'Ore', color: '#b0b0b8', amount, renewable, regenPerTick: 0 });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}

function withLog(w: World) {
  w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
  w.addComponent(w.createEntity(), C_CLOCK, { tick: 5, day: 0, hour: 0, isDay: true });
}

describe('GatherSystem', () => {
  it('a working gatherer depletes the node it stands on', () => {
    const w = new World();
    const node = oreNode(w, 4, 4, 1.0);
    worker(w, 4, 4, 'ore');
    runGatherSystem(w, cfg);
    expect(w.getComponent<Resource>(node, C_RESOURCE)!.amount).toBeLessThan(1.0);
  });

  it('does not deplete a node the worker is not standing on', () => {
    const w = new World();
    const node = oreNode(w, 4, 4, 1.0);
    worker(w, 0, 0, 'ore');
    runGatherSystem(w, cfg);
    expect(w.getComponent<Resource>(node, C_RESOURCE)!.amount).toBe(1.0);
  });

  it('a non-gathering worker depletes nothing', () => {
    const w = new World();
    const node = oreNode(w, 4, 4, 1.0);
    worker(w, 4, 4, null);
    runGatherSystem(w, cfg);
    expect(w.getComponent<Resource>(node, C_RESOURCE)!.amount).toBe(1.0);
  });

  it('an exhausted finite node is destroyed and logged', () => {
    const w = new World();
    withLog(w);
    const node = oreNode(w, 4, 4, 0.001); // about to run dry
    worker(w, 4, 4, 'ore');
    runGatherSystem(w, cfg);
    expect(w.isAlive(node)).toBe(false);
    const log = w.getComponent<EventLogData>(w.query(C_EVENTLOG)[0], C_EVENTLOG)!;
    expect(recentEvents(log, 1)[0]?.kind).toBe('resource');
  });

  it('a renewable node is never destroyed even when emptied', () => {
    const w = new World();
    const node = oreNode(w, 4, 4, 0.001, true); // renewable
    worker(w, 4, 4, 'ore');
    runGatherSystem(w, cfg);
    expect(w.isAlive(node)).toBe(true);
    expect(w.getComponent<Resource>(node, C_RESOURCE)!.amount).toBe(0);
  });
});
