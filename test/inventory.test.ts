// Carried inventory (M23 slice 1): the id→quantity bag helpers, and gathering depositing
// the raw materials a worker extracts (bounded by the carrying cap).
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_JOB, C_POSITION, C_RESOURCE, C_INVENTORY } from '../src/sim/components.ts';
import type { Agent, Job, Resource, Inventory } from '../src/sim/components.ts';
import { addItem, takeItem, itemCount, totalItems, ensureInventory } from '../src/sim/inventory.ts';
import { runGatherSystem } from '../src/sim/systems/GatherSystem.ts';

const cfg = defaultConfig;

describe('inventory helpers (M23)', () => {
  it('addItem accumulates and caps, returning the amount actually added', () => {
    const inv: Inventory = { items: {} };
    expect(addItem(inv, 'timber', 5)).toBe(5);
    expect(addItem(inv, 'timber', 3)).toBe(3);
    expect(itemCount(inv, 'timber')).toBe(8);
    expect(addItem(inv, 'timber', 100, 10)).toBe(2);   // capped at 10 → only 2 fit
    expect(itemCount(inv, 'timber')).toBe(10);
  });

  it('takeItem removes only when enough is held, and clears emptied slots', () => {
    const inv: Inventory = { items: { ore: 4 } };
    expect(takeItem(inv, 'ore', 5)).toBe(false);   // not enough
    expect(itemCount(inv, 'ore')).toBe(4);
    expect(takeItem(inv, 'ore', 3)).toBe(true);
    expect(itemCount(inv, 'ore')).toBe(1);
    expect(takeItem(inv, 'ore', 1)).toBe(true);
    expect('ore' in inv.items).toBe(false);          // emptied slot removed
  });

  it('totalItems sums the bag', () => {
    expect(totalItems({ items: { a: 2, b: 3.5 } })).toBeCloseTo(5.5, 6);
  });

  it('ensureInventory lazily attaches an empty bag', () => {
    const w = new World();
    const e = w.createEntity();
    expect(w.getComponent(e, C_INVENTORY)).toBeUndefined();
    const inv = ensureInventory(w, e);
    expect(inv.items).toEqual({});
    expect(w.getComponent<Inventory>(e, C_INVENTORY)).toBe(inv);   // same object reused
  });
});

// ── Gathering deposits the extracted material ───────────────────────────────────
function worker(w: World, x: number, y: number, gathers: string) {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: 'Digg', action: 'work', ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Job>(e, C_JOB, { professionId: 'miner', professionName: 'Miner', employer: 1, wagePerTick: 0.04, gathers });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}
function oreNode(w: World, x: number, y: number, amount: number) {
  const e = w.createEntity();
  w.addComponent<Resource>(e, C_RESOURCE, { typeId: 'ore', name: 'Ore', color: '#b0b0b8', amount, renewable: true, regenPerTick: 0 });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}

describe('gathering fills the bag (M23)', () => {
  it('a working gatherer keeps what they extract', () => {
    const w = new World();
    oreNode(w, 4, 4, 1.0);
    const e = worker(w, 4, 4, 'ore');
    runGatherSystem(w, cfg);
    const inv = w.getComponent<Inventory>(e, C_INVENTORY)!;
    expect(inv).toBeDefined();
    expect(itemCount(inv, 'ore')).toBeCloseTo(cfg.gatherPerDay / cfg.ticksPerDay, 6);
  });

  it('the bag is bounded by the carrying cap', () => {
    const w = new World();
    oreNode(w, 4, 4, 1e9);   // effectively endless so only the cap stops it
    const e = worker(w, 4, 4, 'ore');
    const tiny = { ...cfg, inventoryMaxPerItem: 0.01 };
    for (let t = 0; t < 50; t++) runGatherSystem(w, tiny);
    expect(itemCount(w.getComponent<Inventory>(e, C_INVENTORY)!, 'ore')).toBeLessThanOrEqual(0.01);
  });
});
