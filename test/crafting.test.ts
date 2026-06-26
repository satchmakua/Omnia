// Crafting (M23 slice 2): the goods/recipes content + the CraftSystem turning carried
// materials into goods, skill-gated and learn-by-doing.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_JOB, C_CLOCK, C_INVENTORY, C_CRAFTING } from '../src/sim/components.ts';
import type { Agent, Job, Clock, Inventory, Crafting } from '../src/sim/components.ts';
import { loadContent } from '../src/content/loader.ts';
import { itemCount } from '../src/sim/inventory.ts';
import { runCraftSystem } from '../src/sim/systems/CraftSystem.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

// ── Content + referential integrity ─────────────────────────────────────────────
describe('goods & recipes content (M23)', () => {
  it('the shipped recipes load and point at real professions, materials and goods', () => {
    const plank = content.recipes.get('plank')!;
    expect(plank.profession).toBe('laborer');
    expect(content.professions.has(plank.profession)).toBe(true);
    expect(content.goods.has(plank.output)).toBe(true);
    for (const id of Object.keys(plank.inputs)) {
      expect(content.resources.has(id) || content.goods.has(id)).toBe(true);
    }
  });

  it('a recipe with an unknown output / profession fails loud, naming the file', () => {
    const SPECIES = `
id: "elf"
name: "Elf"
lifespanYears: { min: 300, max: 500 }
size: "medium"
color: "#88ff88"
needs: { hunger: 1.0, energy: 1.0 }
language: "old_vant"
`;
    const BAD = `
id: "junk"
name: "Junk"
profession: "no_such_job"
inputs: { timber: 2 }
output: "nonesuch"
`;
    expect(() => loadContent(new Map([
      ['species/elf.yaml', SPECIES],
      ['recipes/junk.yaml', BAD],
    ]))).toThrowError(/recipes\/junk/);
  });
});

// ── CraftSystem ─────────────────────────────────────────────────────────────────
function crafter(w: World, professionId: string, items: Record<string, number>, skill?: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `C${e}`, action: 'work', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Job>(e, C_JOB, { professionId, professionName: professionId, employer: 1, wagePerTick: 0.04, gathers: null });
  w.addComponent<Inventory>(e, C_INVENTORY, { items: { ...items } });
  if (skill !== undefined) w.addComponent<Crafting>(e, C_CRAFTING, { skill });
  return e;
}
function craftWorld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  return w;
}

describe('CraftSystem (M23)', () => {
  it('a labourer with timber saws planks — inputs consumed, a good produced, skill grows', () => {
    const w = craftWorld();
    const e = crafter(w, 'laborer', { timber: 5 });
    runCraftSystem(w, cfg, content);
    const inv = w.getComponent<Inventory>(e, C_INVENTORY)!;
    expect(itemCount(inv, 'timber')).toBe(3);                 // 2 consumed
    expect(itemCount(inv, 'plank')).toBe(1);                  // 1 produced
    expect(w.getComponent<Crafting>(e, C_CRAFTING)!.skill).toBeCloseTo(0.12, 5);   // learn-by-doing
  });

  it('skill gates the advanced recipe: a novice cannot dress beams, a master can', () => {
    const novice = craftWorld();
    const n = crafter(novice, 'laborer', { timber: 10 });     // skill 0
    runCraftSystem(novice, cfg, content);
    expect(itemCount(novice.getComponent<Inventory>(n, C_INVENTORY)!, 'beam')).toBe(0);   // beam needs skill 3
    expect(itemCount(novice.getComponent<Inventory>(n, C_INVENTORY)!, 'plank')).toBe(1);  // makes a plank instead

    const master = craftWorld();
    const m = crafter(master, 'laborer', { timber: 10 }, 3);  // skilled
    runCraftSystem(master, cfg, content);
    const inv = master.getComponent<Inventory>(m, C_INVENTORY)!;
    expect(itemCount(inv, 'beam')).toBe(1);                   // the master dresses a beam (the most advanced)
    expect(itemCount(inv, 'timber')).toBe(6);                 // 4 consumed
  });

  it('no materials → no craft; an off-day-boundary tick → nothing', () => {
    const w = craftWorld();
    const e = crafter(w, 'laborer', { timber: 1 });           // not enough for a plank (needs 2)
    runCraftSystem(w, cfg, content);
    expect(w.getComponent<Crafting>(e, C_CRAFTING)).toBeUndefined();   // never crafted

    const mid = new World();
    mid.addComponent<Clock>(mid.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay + 1, day: 1, hour: 0, isDay: true });
    const e2 = crafter(mid, 'laborer', { timber: 5 });
    runCraftSystem(mid, cfg, content);
    expect(itemCount(mid.getComponent<Inventory>(e2, C_INVENTORY)!, 'plank')).toBe(0);   // not a day boundary
  });
});
