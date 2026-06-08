import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';

describe('World.createEntity', () => {
  it('assigns unique ids', () => {
    const w = new World();
    const ids = new Set(Array.from({ length: 100 }, () => w.createEntity()));
    expect(ids.size).toBe(100);
  });
});

describe('World.addComponent / getComponent', () => {
  it('stores and retrieves a component', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'Foo', { x: 42 });
    expect(w.getComponent<{ x: number }>(e, 'Foo')).toEqual({ x: 42 });
  });

  it('returns undefined for missing component', () => {
    const w = new World();
    const e = w.createEntity();
    expect(w.getComponent(e, 'Missing')).toBeUndefined();
  });

  it('overwrites the previous value on re-add', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'V', { n: 1 });
    w.addComponent(e, 'V', { n: 2 });
    expect(w.getComponent<{ n: number }>(e, 'V')!.n).toBe(2);
  });
});

describe('World.destroyEntity', () => {
  it('marks entity as dead and removes all components', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'A', { v: 1 });
    w.destroyEntity(e);
    expect(w.isAlive(e)).toBe(false);
    expect(w.getComponent(e, 'A')).toBeUndefined();
  });
});

describe('World.query', () => {
  it('returns entities with all queried components', () => {
    const w = new World();
    const e1 = w.createEntity(); w.addComponent(e1, 'A', {}); w.addComponent(e1, 'B', {});
    const e2 = w.createEntity(); w.addComponent(e2, 'A', {});
    const e3 = w.createEntity(); w.addComponent(e3, 'B', {});

    const r = w.query('A', 'B');
    expect(r).toContain(e1);
    expect(r).not.toContain(e2);
    expect(r).not.toContain(e3);
  });

  it('excludes destroyed entities', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent(e, 'X', {});
    w.destroyEntity(e);
    expect(w.query('X')).not.toContain(e);
  });

  it('returns all alive entities when called with no args', () => {
    const w = new World();
    const a = w.createEntity();
    const b = w.createEntity();
    w.destroyEntity(a);
    expect(w.query()).toContain(b);
    expect(w.query()).not.toContain(a);
  });
});

describe('World.aliveCount', () => {
  it('tracks live entity count', () => {
    const w = new World();
    w.createEntity(); w.createEntity();
    const e = w.createEntity();
    expect(w.aliveCount).toBe(3);
    w.destroyEntity(e);
    expect(w.aliveCount).toBe(2);
  });
});
