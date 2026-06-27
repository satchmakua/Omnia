// Goods → gold (M25 slice 2): crafters sell their wares for gold, so crafting feeds wealth.
// Wares & tools sell off entirely; weapons & armour sell only in surplus (one kept for combat);
// raw materials are not goods, so they stay in the bag.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_INVENTORY, C_WALLET, C_CLOCK } from '../src/sim/components.ts';
import type { Agent, Inventory, Wallet, Clock } from '../src/sim/components.ts';
import { runTradeSystem } from '../src/sim/systems/TradeSystem.ts';
import { itemCount } from '../src/sim/inventory.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

function trader(w: World, items: Record<string, number>, gold = 0): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `T${e}`, action: 'wander', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Inventory>(e, C_INVENTORY, { items: { ...items } });
  w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
  return e;
}
function dailyWorld(): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  return w;
}
const inv = (w: World, e: EntityId) => w.getComponent<Inventory>(e, C_INVENTORY)!;
const gold = (w: World, e: EntityId) => w.getComponent<Wallet>(e, C_WALLET)!.gold;

describe('TradeSystem — goods become gold (M25)', () => {
  it('sells wares & tools for gold (half their value), emptying the bag of them', () => {
    const w = dailyWorld();
    const e = trader(w, { plank: 4, tool: 2 });   // 4×3 + 2×5 = 22 value; ×0.5 = 11 gold
    runTradeSystem(w, cfg, content);
    expect(gold(w, e)).toBeCloseTo(11, 6);
    expect(itemCount(inv(w, e), 'plank')).toBe(0);
    expect(itemCount(inv(w, e), 'tool')).toBe(0);
  });

  it('keeps one weapon & one armour for combat, selling only the surplus', () => {
    const w = dailyWorld();
    const e = trader(w, { blade: 3, shield: 1 });   // sell 2 blades (keep 1); keep the lone shield
    runTradeSystem(w, cfg, content);
    expect(itemCount(inv(w, e), 'blade')).toBe(1);   // one kept for defence
    expect(itemCount(inv(w, e), 'shield')).toBe(1);  // the only one — kept
    expect(gold(w, e)).toBeCloseTo(20 * 2 * 0.5, 6); // 2 surplus blades × 20 × 0.5 = 20 gold
  });

  it('does not sell raw materials (they are not goods)', () => {
    const w = dailyWorld();
    const e = trader(w, { timber: 10, ore: 5 });
    runTradeSystem(w, cfg, content);
    expect(itemCount(inv(w, e), 'timber')).toBe(10);   // materials stay for crafting
    expect(itemCount(inv(w, e), 'ore')).toBe(5);
    expect(gold(w, e)).toBe(0);
  });

  it('only trades on a daily tick', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay + 1, day: 1, hour: 0, isDay: true });
    const e = trader(w, { plank: 4 });
    runTradeSystem(w, cfg, content);
    expect(itemCount(inv(w, e), 'plank')).toBe(4);   // untouched off-schedule
    expect(gold(w, e)).toBe(0);
  });
});
