// Craft quality (M33 slice 1): a good is as fine as the hand that made it — quality (from skill) is
// fixed at crafting and scales the good's trade value and, for arms, its combat power. These tests
// pin the skill→tier model, the inventory record, and the value/combat effects.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_INVENTORY, C_WALLET, C_CLOCK, C_EQUIPMENT } from '../src/sim/components.ts';
import type { Agent, Inventory, Wallet, Clock, Equipment } from '../src/sim/components.ts';
import { qualityFromSkill, qualityValueMultiplier, qualityPowerMultiplier, qualityName, isMasterwork, MASTERWORK } from '../src/sim/quality.ts';
import { recordQuality, qualityOf } from '../src/sim/inventory.ts';
import { runEquipSystem } from '../src/sim/systems/EquipSystem.ts';
import { runTradeSystem } from '../src/sim/systems/TradeSystem.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const tpd = cfg.ticksPerDay;
const content = testContent();

describe('quality is the measure of the maker (M33 s1)', () => {
  it('skill grades the work — a novice shoddy, a master a masterwork', () => {
    expect(qualityFromSkill(0)).toBe(0);          // shoddy
    expect(qualityName(qualityFromSkill(0))).toBe('shoddy');
    expect(qualityFromSkill(3.5)).toBe(2);        // plain — the competent norm
    expect(qualityFromSkill(7)).toBe(4);          // superior
    expect(qualityFromSkill(9)).toBe(MASTERWORK); // masterwork
    expect(isMasterwork(qualityFromSkill(10))).toBe(true);
    // monotonic: more skill never yields worse work
    for (let s = 0; s < 10; s += 0.5) expect(qualityFromSkill(s + 0.5)).toBeGreaterThanOrEqual(qualityFromSkill(s));
  });

  it('quality is a bonus-only lift — mastery rewarded, mediocrity not penalised (preserves balance)', () => {
    // common work (shoddy..plain) sits at the journeyman baseline (×1); fine+ commands more.
    expect(qualityValueMultiplier(0)).toBe(1);
    expect(qualityValueMultiplier(2)).toBe(1);
    expect(qualityValueMultiplier(MASTERWORK)).toBeGreaterThan(1.5);
    expect(qualityPowerMultiplier(0)).toBe(1);
    expect(qualityPowerMultiplier(MASTERWORK)).toBeGreaterThan(1.3);
    expect(qualityPowerMultiplier(MASTERWORK)).toBeGreaterThan(qualityPowerMultiplier(2));
  });

  it('the bag keeps the best tier carried of each good', () => {
    const inv: Inventory = { items: { blade: 2 } };
    expect(qualityOf(inv, 'blade')).toBe(-1);   // none recorded
    recordQuality(inv, 'blade', 1);
    recordQuality(inv, 'blade', 4);
    recordQuality(inv, 'blade', 2);             // a lesser one doesn't downgrade the stack
    expect(qualityOf(inv, 'blade')).toBe(4);
  });
});

describe('quality affects combat & value (M33 s1)', () => {
  function agent(w: World, items: Record<string, number>, quality?: Record<string, number>, gold = 0): EntityId {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'C', action: 'wander', ticksAlive: 5000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Inventory>(e, C_INVENTORY, { items: { ...items }, quality });
    w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
    return e;
  }
  function dayWorld(): World {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: tpd, day: 1, hour: 0, isDay: true });
    return w;
  }

  it('a masterwork blade out-cuts a shoddy one (combat power scales with quality)', () => {
    const w = dayWorld();
    const master = agent(w, { blade: 1 }, { blade: MASTERWORK });
    const novice = agent(w, { blade: 1 }, { blade: 0 });
    runEquipSystem(w, cfg, content);
    const mw = w.getComponent<Equipment>(master, C_EQUIPMENT)!;
    const sw = w.getComponent<Equipment>(novice, C_EQUIPMENT)!;
    expect(mw.weapon).toBeGreaterThan(sw.weapon);
    expect(mw.weaponId).toBe('blade');
    expect(mw.weaponQuality).toBe(MASTERWORK);   // tier carried through for legibility
  });

  it('a finer good fetches more at sale (value scales with quality)', () => {
    const w = dayWorld();
    const master = agent(w, { blade: 2 }, { blade: MASTERWORK });   // 2 → keep one, sell one
    const novice = agent(w, { blade: 2 }, { blade: 0 });
    runTradeSystem(w, cfg, content);
    const mg = w.getComponent<Wallet>(master, C_WALLET)!.gold;
    const ng = w.getComponent<Wallet>(novice, C_WALLET)!.gold;
    expect(mg).toBeGreaterThan(ng);
    expect(ng).toBeGreaterThan(0);
  });
});
