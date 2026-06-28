// The family forest pedigree graph (M35) — a pure read of living agents + tombstones into a
// generational tree. Tests the generation depth, that the dead are included, couples, and that a
// dangling parent reference is dropped (not crash).
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_LINEAGE, C_TOMBSTONE, C_CLOCK } from '../src/sim/components.ts';
import type { Agent, Lineage, Tombstone, Clock } from '../src/sim/components.ts';
import { buildForest, bloodline, livingLines } from '../src/history/genealogy.ts';

const cfg = defaultConfig;

function world(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 100_000, day: 0, hour: 0, isDay: true });
  return w;
}
function living(w: World, name: string, sex: 'male' | 'female', parents: EntityId[], children: EntityId[], partner: EntityId | null): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name, action: 'wander', ticksAlive: 20_000, wealthGoal: 50, sex, lifespanTicks: 1e9 });
  w.addComponent<Lineage>(e, C_LINEAGE, { partner, parents, children, reproCooldownTicks: 0 });
  return e;
}
function buried(w: World, name: string, sex: 'male' | 'female', parents: EntityId[], children: EntityId[], partner: EntityId | null): EntityId {
  const e = w.createEntity();
  w.addComponent<Tombstone>(e, C_TOMBSTONE, {
    name, speciesName: 'Human', sex, bornTick: 0, diedTick: 50_000, ageYears: 50, role: null,
    cause: 'old age', legacy: `${name} lived and died.`, partner, parents, children,
  });
  return e;
}

describe('family forest — buildForest (M35)', () => {
  it('builds a 3-generation pedigree spanning the living and the dead', () => {
    const w = world();
    // founder couple (both buried) -> Tov (living) ⚭ Mira (living founder) -> Esk (living)
    const e1 = buried(w, 'Rok Vant', 'male', [], [], null);
    const e2 = buried(w, 'Vyn Vant', 'female', [], [], null);
    const e3 = living(w, 'Tov Vant', 'male', [e1, e2], [], null);
    const e4 = living(w, 'Mira Drak', 'female', [], [], e3);
    const e5 = living(w, 'Esk Drak', 'male', [e3, e4], [], null);
    // wire the down-links + the founder marriage
    (w.getComponent<Tombstone>(e1, C_TOMBSTONE)!).children = [e3]; (w.getComponent<Tombstone>(e1, C_TOMBSTONE)!).partner = e2;
    (w.getComponent<Tombstone>(e2, C_TOMBSTONE)!).children = [e3]; (w.getComponent<Tombstone>(e2, C_TOMBSTONE)!).partner = e1;
    (w.getComponent<Lineage>(e3, C_LINEAGE)!).partner = e4; (w.getComponent<Lineage>(e3, C_LINEAGE)!).children = [e5];
    (w.getComponent<Lineage>(e4, C_LINEAGE)!).children = [e5];

    const f = buildForest(w, cfg);

    expect(f.nodes.length).toBe(5);
    expect(f.generations).toBe(3);
    expect(f.byId.get(e1)!.gen).toBe(0);   // founder
    expect(f.byId.get(e3)!.gen).toBe(1);   // their child
    expect(f.byId.get(e5)!.gen).toBe(2);   // grandchild
    expect(f.byId.get(e1)!.alive).toBe(false);   // buried
    expect(f.byId.get(e3)!.alive).toBe(true);    // living
    expect(f.byId.get(e1)!.diedYear).not.toBeNull();
    // couples: the founders, and Tov ⚭ Mira
    expect(f.couples.length).toBe(2);
    expect(f.couples).toContainEqual([Math.min(e1, e2), Math.max(e1, e2)]);
  });

  it('colours a family consistently (same surname → same colour) and distinct families differ', () => {
    const w = world();
    const a = buried(w, 'Rok Vant', 'male', [], [], null);
    const b = buried(w, 'Vyn Vant', 'female', [], [], null);
    const c = living(w, 'Mira Drak', 'female', [], [], null);
    const f = buildForest(w, cfg);
    expect(f.byId.get(a)!.color).toBe(f.byId.get(b)!.color);     // both Vant
    expect(f.byId.get(a)!.color).not.toBe(f.byId.get(c)!.color); // Vant ≠ Drak
  });

  it('drops a dangling parent reference instead of crashing (treats the soul as a founder)', () => {
    const w = world();
    const orphan = living(w, 'Lone Soul', 'male', [99999], [], null);   // parent 99999 doesn't exist
    const f = buildForest(w, cfg);
    expect(f.byId.get(orphan)!.parents).toEqual([]);
    expect(f.byId.get(orphan)!.gen).toBe(0);
    expect(f.nodes.length).toBe(1);
  });

  it('is empty-safe on a world with no souls', () => {
    const f = buildForest(world(), cfg);
    expect(f.nodes.length).toBe(0);
    expect(f.generations).toBe(0);
    expect(f.width).toBe(0);
  });
});

describe('family forest — filters (M35 s2)', () => {
  // A living line (Foss -> Dax, living) and an extinct dead-end line (Rok+Vyn -> Cy -> Gel, all dead).
  function townWorld() {
    const w = world();
    const rok = buried(w, 'Rok Vant', 'male', [], [], null);
    const vyn = buried(w, 'Vyn Vant', 'female', [], [], null);
    const cy = buried(w, 'Cy Vant', 'male', [rok, vyn], [], null);
    const gel = buried(w, 'Gel Vant', 'female', [cy], [], null);   // extinct: all dead, no living below
    (w.getComponent<Tombstone>(rok, C_TOMBSTONE)!).children = [cy]; (w.getComponent<Tombstone>(rok, C_TOMBSTONE)!).partner = vyn;
    (w.getComponent<Tombstone>(vyn, C_TOMBSTONE)!).children = [cy]; (w.getComponent<Tombstone>(vyn, C_TOMBSTONE)!).partner = rok;
    (w.getComponent<Tombstone>(cy, C_TOMBSTONE)!).children = [gel];
    const foss = buried(w, 'Foss Drak', 'male', [], [], null);
    const dax = living(w, 'Dax Drak', 'male', [foss], [], null);   // living → keeps the Drak line alive
    (w.getComponent<Tombstone>(foss, C_TOMBSTONE)!).children = [dax];
    return { w, rok, vyn, cy, gel, foss, dax };
  }

  it('bloodline(focus) = ancestors + descendants + self (+ partners)', () => {
    const { w, rok, vyn, cy, gel } = townWorld();
    const f = buildForest(w, cfg);
    const line = bloodline(f, cy);
    expect(line.has(cy)).toBe(true);          // self
    expect(line.has(rok)).toBe(true);         // ancestor
    expect(line.has(vyn)).toBe(true);         // ancestor (+ partner of rok)
    expect(line.has(gel)).toBe(true);         // descendant
    expect(line.has(f.byId.get(cy)!.id)).toBe(true);
  });

  it('livingLines = the living + their ancestors; extinct dead-end lines are excluded', () => {
    const { w, rok, vyn, cy, gel, foss, dax } = townWorld();
    const f = buildForest(w, cfg);
    const alive = livingLines(f);
    expect(alive.has(dax)).toBe(true);        // living
    expect(alive.has(foss)).toBe(true);       // ancestor of the living
    expect(alive.has(rok)).toBe(false);       // extinct line — pruned
    expect(alive.has(cy)).toBe(false);
    expect(alive.has(gel)).toBe(false);
  });
});
