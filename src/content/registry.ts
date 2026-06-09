// An immutable, id-keyed lookup built at load time. Systems read registries;
// they never touch files. Iteration order is sorted by id for determinism.
export class Registry<T extends { id: string }> {
  private readonly byId: Map<string, T>;

  constructor(items: T[]) {
    this.byId = new Map();
    for (const item of items) {
      if (this.byId.has(item.id)) {
        throw new Error(`Duplicate content id '${item.id}'`);
      }
      this.byId.set(item.id, item);
    }
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  require(id: string): T {
    const item = this.byId.get(id);
    if (!item) throw new Error(`Required content id '${id}' not found in registry`);
    return item;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): T[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get size(): number {
    return this.byId.size;
  }
}
