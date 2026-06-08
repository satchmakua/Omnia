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

  // Returns alive entities that possess ALL of the listed components.
  query(...componentNames: string[]): EntityId[] {
    if (componentNames.length === 0) return [...this.alive];
    const [first, ...rest] = componentNames;
    const firstStore = this.components.get(first);
    if (!firstStore) return [];
    const result: EntityId[] = [];
    for (const id of firstStore.keys()) {
      if (!this.alive.has(id)) continue;
      if (rest.every(name => this.hasComponent(id, name))) result.push(id);
    }
    return result;
  }

  isAlive(entity: EntityId): boolean {
    return this.alive.has(entity);
  }

  get aliveCount(): number {
    return this.alive.size;
  }
}
