// Equipment (M23 slice 3): once a day, denormalise each agent's best carried weapon & armour
// into an `Equipment` component, so the hot combat path reads cheap numbers instead of scanning
// the inventory + goods content every blow (the same pattern as a tribe's `arms` tech). Carrying
// a blade = wielding it; carrying a shield = bearing it. Deterministic, a pure read of state.
import type { World } from '../ecs.ts';
import { C_AGENT, C_INVENTORY, C_EQUIPMENT, C_CLOCK } from '../components.ts';
import type { Inventory, Equipment, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import { qualityOf } from '../inventory.ts';
import { qualityPowerMultiplier } from '../quality.ts';

export function runEquipSystem(world: World, cfg: SimConfig, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  for (const e of world.query(C_AGENT, C_INVENTORY)) {
    const inv = world.getComponent<Inventory>(e, C_INVENTORY)!;
    // Pick the best weapon & armour by *quality-scaled* power (M33): a masterwork blade out-cuts a
    // shoddy one of the same make. The chosen good's id + tier are kept for the inspector.
    let weapon = 0, armour = 0;
    let weaponId: string | undefined, armourId: string | undefined, weaponQ = -1, armourQ = -1;
    for (const id in inv.items) {
      if (inv.items[id] <= 0) continue;
      const g = content.goods.get(id);
      if (!g || g.power <= 0) continue;
      const tier = qualityOf(inv, id);
      const power = g.power * (tier >= 0 ? qualityPowerMultiplier(tier) : 1);
      if (g.category === 'weapon' && power > weapon) { weapon = power; weaponId = id; weaponQ = tier; }
      else if (g.category === 'armour' && power > armour) { armour = power; armourId = id; armourQ = tier; }
    }
    const eq = world.getComponent<Equipment>(e, C_EQUIPMENT);
    if (weapon === 0 && armour === 0) {
      if (eq) world.removeComponent(e, C_EQUIPMENT);   // disarmed (e.g. an item traded away later)
    } else {
      const next: Equipment = { weapon, armour, weaponId, weaponQuality: weaponQ, armourId, armourQuality: armourQ };
      if (eq) Object.assign(eq, next); else world.addComponent<Equipment>(e, C_EQUIPMENT, next);
    }
  }
}
