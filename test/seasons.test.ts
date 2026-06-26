// Seasons (M19 slice 2): the calendar's seasons causally affect the world — plant
// growth (ecology) and the foraged commons / food price (farming) breathe with the
// year — and seasonal holidays fire only in their season.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig, seasonGrowthFactor, calendarOf, ticksPerYear, SEASON_NAMES } from '../src/sim/config.ts';
import { C_CLOCK, C_FLORA, C_POSITION, C_AGENT } from '../src/sim/components.ts';
import type { Clock, Flora, Agent, Position } from '../src/sim/components.ts';
import { createRNG } from '../src/sim/rng.ts';
import { runFloraSystem } from '../src/sim/systems/FloraSystem.ts';
import { measureSupplyDemand, clearingPrice } from '../src/sim/market.ts';
import { loadContentFromDisk } from '../src/content/fsSource.ts';

const cfg = defaultConfig;

// The tick at the start of each season (the year is split into 4 equal quarters).
function tickInSeason(name: string): number {
  const tpy = ticksPerYear(cfg);
  return Math.floor((SEASON_NAMES.indexOf(name as typeof SEASON_NAMES[number]) / 4) * tpy);
}

describe('seasonGrowthFactor (M19)', () => {
  it('maps each season to its configured abundance, averaging ~1 over the year', () => {
    const spring = seasonGrowthFactor(tickInSeason('Spring'), cfg);
    const winter = seasonGrowthFactor(tickInSeason('Winter'), cfg);
    expect(spring).toBe(cfg.seasonGrowthSpring);
    expect(winter).toBe(cfg.seasonGrowthWinter);
    expect(spring).toBeGreaterThan(winter);   // spring is lush, winter is lean
    const avg = SEASON_NAMES.reduce((s, n) => s + seasonGrowthFactor(tickInSeason(n), cfg), 0) / 4;
    expect(avg).toBeCloseTo(1, 1);            // annual food balance preserved
  });
});

// ── Ecology: plants grow faster in summer than in winter ────────────────────────
function floraWorld(tick: number): { w: World; floraGrowth: () => number } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 0, hour: 0, isDay: true });
  const f = w.createEntity();
  w.addComponent<Position>(f, C_POSITION, { x: 5, y: 5 });
  w.addComponent<Flora>(f, C_FLORA, { speciesId: 'x', name: 'x', color: '#0f0', maturity: 0, growthPerTick: 0.05, edibleAt: 0.5, foodYield: 1, spreadChancePerTick: 0 });
  return { w, floraGrowth: () => w.getComponent<Flora>(f, C_FLORA)!.maturity };
}

describe('seasons drive plant growth (M19)', () => {
  it('a plant ripens faster in spring than in winter', () => {
    const summer = floraWorld(tickInSeason('Spring'));
    const winter = floraWorld(tickInSeason('Winter'));
    for (let i = 0; i < 5; i++) {
      runFloraSystem(summer.w, cfg, createRNG(1));
      runFloraSystem(winter.w, cfg, createRNG(1));
    }
    expect(summer.floraGrowth()).toBeGreaterThan(winter.floraGrowth());
  });
});

// ── Farming: the foraged commons (and so the price) shrinks in winter ────────────
describe('seasons drive the food market (M19)', () => {
  it('the foraged commons is leaner in winter, lifting the clearing price', () => {
    const w = new World();
    // Many adults (demand) and no farmers → supply is the foraged commons only, and demand
    // outstrips it, so the price sits inside its band where the seasonal swing is visible.
    for (let i = 0; i < 30; i++) {
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, { name: `A${i}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    }
    const summer = measureSupplyDemand(w, cfg, cfg.seasonGrowthSummer);
    const winter = measureSupplyDemand(w, cfg, cfg.seasonGrowthWinter);
    expect(winter.supply).toBeLessThan(summer.supply);
    // Same demand, leaner winter supply → a higher clearing-price target.
    const summerPrice = clearingPrice(cfg.provisionBasePrice, summer.supply, summer.demand, cfg);
    const winterPrice = clearingPrice(cfg.provisionBasePrice, winter.supply, winter.demand, cfg);
    expect(winterPrice).toBeGreaterThan(summerPrice);
  });

  it('forageFactor defaults to 1 (season-neutral) so old callers are unaffected', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    expect(measureSupplyDemand(w, cfg).supply).toBe(cfg.baseForagedProvisions);
  });
});

// ── Seasonal holidays only fire in their season ──────────────────────────────────
describe('seasonal holiday content (M19)', () => {
  it('the shipped holidays are gated to their seasons', () => {
    const c = loadContentFromDisk('./content');
    const byId = new Map(c.events.all().map(e => [e.id, e]));
    expect(byId.get('spring_bloom')?.season).toBe('Spring');
    expect(byId.get('harvest_festival')?.season).toBe('Autumn');
    expect(byId.get('midwinter_feast')?.season).toBe('Winter');
    // ...and the slice-1 fortune events are season-agnostic (can fire any season).
    expect(byId.get('festival')?.season).toBeUndefined();
  });
});
