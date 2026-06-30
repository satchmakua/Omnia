// Carried-inventory helpers (M23). An `Inventory` is an id → quantity bag; these are the
// only ways the systems touch it, so the bookkeeping (capping, removing emptied slots) lives
// in one place. Pure, no RNG — gathering/crafting deposits and withdrawals are deterministic.
import type { World, EntityId } from './ecs.ts';
import { C_INVENTORY } from './components.ts';
import type { Inventory } from './components.ts';

const EPS = 1e-9;

// Add `qty` of `id`, clamped so the slot never exceeds `cap`. Returns the amount actually
// added (less than `qty` if the slot was near its cap) — so a gatherer on a full bag stops.
export function addItem(inv: Inventory, id: string, qty: number, cap = Infinity): number {
  const cur = inv.items[id] ?? 0;
  const next = Math.min(cap, cur + qty);
  inv.items[id] = next;
  return next - cur;
}

// Remove `qty` of `id` only if the bag holds at least that much; true on success. Emptied
// slots are deleted so the bag stays a clean tally of what's actually carried.
export function takeItem(inv: Inventory, id: string, qty: number): boolean {
  if ((inv.items[id] ?? 0) + EPS < qty) return false;
  inv.items[id] -= qty;
  if (inv.items[id] <= EPS) delete inv.items[id];
  return true;
}

export function itemCount(inv: Inventory, id: string): number {
  return inv.items[id] ?? 0;
}

// Record the craft-quality of a good just made (M33): the bag keeps the *best* tier carried of each
// id (you wield / sell your finest). −1 means none carried.
export function recordQuality(inv: Inventory, id: string, tier: number): void {
  if (!inv.quality) inv.quality = {};
  inv.quality[id] = Math.max(inv.quality[id] ?? -1, tier);
}
export function qualityOf(inv: Inventory, id: string): number {
  return inv.quality?.[id] ?? -1;
}

export function totalItems(inv: Inventory): number {
  let n = 0;
  for (const id in inv.items) n += inv.items[id];
  return n;
}

// Fetch the entity's inventory, creating an empty one on first use (lazy, like Combat/Crime).
export function ensureInventory(world: World, e: EntityId): Inventory {
  let inv = world.getComponent<Inventory>(e, C_INVENTORY);
  if (!inv) { inv = { items: {} }; world.addComponent<Inventory>(e, C_INVENTORY, inv); }
  return inv;
}
