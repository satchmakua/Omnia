// Equipment (M23 slice 3): carried weapon/armour goods are denormalised into an Equipment
// bonus (EquipSystem) and fed into the combat engine — a crafted blade bites, a shield soaks.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_INVENTORY, C_EQUIPMENT } from '../src/sim/components.ts';
import type { Agent, Clock, Inventory, Equipment } from '../src/sim/components.ts';
import { runEquipSystem } from '../src/sim/systems/EquipSystem.ts';
import { hitDamage, combatantOf } from '../src/sim/combat.ts';
import type { Combatant } from '../src/sim/combat.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

const baseCombatant = (): Combatant => ({ str: 12, dex: 10, con: 10, martial: 0.5, ferocity: 1, prowess: 0 });

// ── Combat reads weapon & armour ─────────────────────────────────────────────────
describe('equipment in combat (M23 s3)', () => {
  it('a weapon makes blows keener; armour soaks them', () => {
    const atk = baseCombatant(), def = baseCombatant();
    const armedDmg = hitDamage({ ...atk, weapon: 3 }, def);
    const bareDmg = hitDamage(atk, def);
    expect(armedDmg).toBeGreaterThan(bareDmg);                       // a blade bites harder

    const vsArmoured = hitDamage(atk, { ...def, armour: 3 });
    expect(vsArmoured).toBeLessThan(bareDmg);                        // a shield turns the blow
  });
});

// ── EquipSystem denormalises carried goods ───────────────────────────────────────
function carrier(w: World, items: Record<string, number>): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `E${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Inventory>(e, C_INVENTORY, { items: { ...items } });
  return e;
}
function dayWorld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  return w;
}

describe('EquipSystem (M23 s3)', () => {
  it('a carried blade & shield become weapon & armour bonuses; combatantOf picks them up', () => {
    const w = dayWorld();
    const e = carrier(w, { blade: 1, shield: 2, plank: 5 });   // a ware (plank) confers nothing
    runEquipSystem(w, cfg, content);
    const eq = w.getComponent<Equipment>(e, C_EQUIPMENT)!;
    expect(eq.weapon).toBe(content.goods.get('blade')!.power);
    expect(eq.armour).toBe(content.goods.get('shield')!.power);
    const c = combatantOf(w, e);
    expect(c.weapon).toBe(eq.weapon);
    expect(c.armour).toBe(eq.armour);
  });

  it('carrying only wares (no weapon/armour) leaves no equipment', () => {
    const w = dayWorld();
    const e = carrier(w, { plank: 9, tool: 1 });   // tool is a 'tool', not weapon/armour
    runEquipSystem(w, cfg, content);
    expect(w.getComponent(e, C_EQUIPMENT)).toBeUndefined();
  });

  it('takes the best of several carried weapons', () => {
    const w = dayWorld();
    const e = carrier(w, { blade: 3 });
    runEquipSystem(w, cfg, content);
    expect(w.getComponent<Equipment>(e, C_EQUIPMENT)!.weapon).toBe(content.goods.get('blade')!.power);
  });
});
