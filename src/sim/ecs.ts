export type EntityId = number;

export class World {
  private nextId = 1;
  private components = new Map<string, Map<EntityId, unknown>>();
  private alive = new Set<EntityId>();

  createEntity(): EntityId {
    const id = this.nextId++;
    this.alive.add(id);
    return id;
  }

  destroyEntity(id: EntityId): void {
    this.alive.delete(id);
    for (const store of this.components.values()) {
      store.delete(id);
    }
  }

  addComponent<T>(entity: EntityId, name: string, component: T): void {
    let store = this.components.get(name);
    if (!store) {
      store = new Map();
      this.components.set(name, store);
    }
    store.set(entity, component);
  }

  getComponent<T>(entity: EntityId, name: string): T | undefined {
    return this.components.get(name)?.get(entity) as T | undefined;
  }

  hasComponent(entity: EntityId, name: string): boolean {
    return this.components.get(name)?.has(entity) ?? false;
  }

  removeComponent(entity: EntityId, name: string): void {
    this.components.get(name)?.delete(entity);
  }

  // Returns alive entities that possess ALL of the listed components, in the first
  // component's insertion order (deterministic — systems rely on this order). Drives off
  // the first listed store and resolves the remaining stores ONCE (not per entity), so the
  // per-entity check is a handful of Map.has() calls rather than a Map lookup-by-name each.
  query(...componentNames: string[]): EntityId[] {
    if (componentNames.length === 0) return [...this.alive];
    const [first, ...rest] = componentNames;
    const firstStore = this.components.get(first);
    if (!firstStore) return [];
    const restStores: Map<EntityId, unknown>[] = [];
    for (const name of rest) {
      const store = this.components.get(name);
      if (!store) return [];   // a required component has no entities → nothing can match
      restStores.push(store);
    }
    const result: EntityId[] = [];
    for (const id of firstStore.keys()) {
      if (!this.alive.has(id)) continue;
      let ok = true;
      for (let i = 0; i < restStores.length; i++) {
        if (!restStores[i].has(id)) { ok = false; break; }
      }
      if (ok) result.push(id);
    }
    return result;
  }

  isAlive(entity: EntityId): boolean {
    return this.alive.has(entity);
  }

  get aliveCount(): number {
    return this.alive.size;
  }

  // ── Snapshot / restore (M12) ────────────────────────────────────────────────
  // A plain-data dump of the whole world, for instant (non-replay) save/load. `skip`
  // names components that must not be snapshotted (runtime-only, e.g. the live-model
  // AIRunner). The component data is referenced, not deep-cloned — serialize it before
  // mutating the world further.
  snapshot(skip: readonly string[] = []): WorldData {
    const components: Record<string, [EntityId, unknown][]> = {};
    for (const [name, store] of this.components) {
      if (skip.includes(name)) continue;
      components[name] = [...store.entries()];
    }
    return { nextId: this.nextId, alive: [...this.alive], components };
  }

  static fromSnapshot(data: WorldData): World {
    const w = new World();
    w.nextId = data.nextId;
    w.alive = new Set(data.alive);
    for (const name of Object.keys(data.components)) {
      w.components.set(name, new Map<EntityId, unknown>(data.components[name]));
    }
    return w;
  }
}

export interface WorldData {
  nextId: number;
  alive: EntityId[];
  components: Record<string, [EntityId, unknown][]>;
}
