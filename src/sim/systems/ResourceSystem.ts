// Resources have no brain. Renewable nodes regrow toward full; finite nodes do
// not. (Extraction by agents arrives with the economy in M3.)
import type { World } from '../ecs.ts';
import { C_RESOURCE } from '../components.ts';
import type { Resource } from '../components.ts';

export function runResourceSystem(world: World): void {
  for (const e of world.query(C_RESOURCE)) {
    const r = world.getComponent<Resource>(e, C_RESOURCE)!;
    if (r.renewable && r.amount < 1) {
      r.amount = Math.min(1, r.amount + r.regenPerTick);
    }
  }
}
