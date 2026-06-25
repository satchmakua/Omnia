// The Kids Pass: children are economic dependents (no work, no upkeep, no debt), and they
// have their own age-appropriate inner life (child vows) that *graduates* into an adult one
// when they come of age. These tests pin all three: the child vow vocabulary, the upkeep
// gate, and the coming-of-age transition through the reflection system.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_WALLET, C_MEMORY, C_CLOCK, C_AIRECORD, C_EVENTLOG,
} from '../src/sim/components.ts';
import type { Agent, Wallet, Memory, MemoryEntry, AIRecord } from '../src/sim/components.ts';
import { distill, CHILD_VOW_SET } from '../src/ai/memory.ts';
import { runEconomySystem } from '../src/sim/systems/EconomySystem.ts';
import { runAISystem } from '../src/sim/systems/AISystem.ts';
import { stubProvider } from '../src/ai/stubProvider.ts';
import { createEventLog, recentEvents } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';

const cfg = defaultConfig;
const tpy = ticksPerYear(cfg);

// ── 1. Child vow vocabulary ──────────────────────────────────────────────────────

describe('distill: children speak an age-appropriate vow (Kids Pass)', () => {
  const bonds: MemoryEntry[] = [{ tick: 1, text: 'befriended Pim', importance: 0.45 }];

  it('the same memories give a child a child vow and an adult an adult vow', () => {
    expect(distill(bonds, true).vow).toBe('to make a true friend');
    expect(distill(bonds, false).vow).toBe('to provide for those they love');
  });

  it('every theme maps to a distinct child vow, all in the child set', () => {
    expect(distill([{ tick: 1, text: 'survived a grave illness', importance: 0.5 }], true).vow).toBe('to be brave');
    expect(distill([{ tick: 1, text: 'lost their parent', importance: 0.9 }], true).vow).toBe('to stay close to family');
    expect(distill([], true).vow).toBe('to see what the world holds');
    for (const m of [bonds, [{ tick: 1, text: 'survived', importance: 0.5 }], []]) {
      expect(CHILD_VOW_SET.has(distill(m, true).vow)).toBe(true);
      expect(CHILD_VOW_SET.has(distill(m, false).vow)).toBe(false);  // adult vows are NOT in the child set
    }
  });

  it('the drive (purpose) is unchanged — only the words differ by age', () => {
    expect(distill(bonds, true).purpose).toBe(distill(bonds, false).purpose);
  });
});

// ── 2. Children are economic dependents (no upkeep, no debt) ──────────────────────

describe('EconomySystem: children pay no cost of living (Kids Pass)', () => {
  function townAt(dayBoundaryTick: number): { w: World; adult: number; kid: number } {
    const w = new World();
    w.addComponent(w.createEntity(), C_CLOCK, { tick: dayBoundaryTick, day: 1, hour: 0, isDay: true });
    const make = (ageYears: number, gold: number) => {
      const e = w.createEntity();
      w.addComponent<Agent>(e, C_AGENT, {
        name: 'A', action: 'wander', ticksAlive: Math.floor(ageYears * tpy),
        wealthGoal: 50, sex: 'female', lifespanTicks: 1e9,
      });
      w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
      return e;
    };
    return { w, adult: make(30, 10), kid: make(8, 0) };
  }

  it('on a day boundary an adult pays upkeep but a child does not', () => {
    const { w, adult, kid } = townAt(cfg.ticksPerDay);   // tick % ticksPerDay === 0, > 0
    // subsistence off to isolate the child-vs-adult upkeep distinction (subsistence is
    // tested in economy.test.ts); the adult here is jobless so would otherwise also earn it.
    runEconomySystem(w, { ...cfg, subsistencePerDay: 0 });
    expect(w.getComponent<Wallet>(adult, C_WALLET)!.gold).toBe(10 - cfg.dailyUpkeep);
    const kw = w.getComponent<Wallet>(kid, C_WALLET)!;
    expect(kw.gold).toBe(0);    // a child with no gold is NOT pushed into debt
    expect(kw.debt).toBe(0);
  });

  it('a child never accrues debt across many days, so it comes of age solvent', () => {
    const { w, kid } = townAt(0);
    const clock = w.getComponent<{ tick: number }>(w.query(C_CLOCK)[0], C_CLOCK)!;
    for (let d = 1; d <= 50; d++) { clock.tick = d * cfg.ticksPerDay; runEconomySystem(w, cfg); }
    const kw = w.getComponent<Wallet>(kid, C_WALLET)!;
    expect(kw.debt).toBe(0);
    expect(kw.gold).toBe(0);
  });
});

// ── 3. Coming of age: the child mind graduates into an adult one ──────────────────

describe('coming of age: a child vow gives way to an adult vow (Kids Pass)', () => {
  function youthWorld() {
    const w = new World();
    w.addComponent(w.createEntity(), C_CLOCK, { tick: 100_000, day: 0, hour: 0, isDay: true });
    w.addComponent<AIRecord>(w.createEntity(), C_AIRECORD, { entries: [] });
    w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, {
      name: 'Mael', action: 'wander', ticksAlive: Math.floor(10 * tpy),   // a child (< 16y)
      wealthGoal: 50, sex: 'male', lifespanTicks: 1e9,
    });
    w.addComponent<Memory>(e, C_MEMORY, {
      events: [
        { tick: 10, text: 'befriended Pim', importance: 0.45 },
        { tick: 20, text: 'befriended Sora', importance: 0.45 },
        { tick: 30, text: 'befriended Ted', importance: 0.45 },
      ],
      summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
      utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9,
    });
    return { w, e };
  }

  it('reflects a child vow, then comes of age into an adult vow with a feed line', () => {
    const { w, e } = youthWorld();

    // As a child: the bonds theme resolves to a CHILD vow.
    runAISystem(w, cfg, stubProvider);
    const mem = w.getComponent<Memory>(e, C_MEMORY)!;
    expect(mem.vow).toBe('to make a true friend');
    expect(CHILD_VOW_SET.has(mem.vow!)).toBe(true);

    // Grow up and let enough time pass to reflect again.
    w.getComponent<Agent>(e, C_AGENT)!.ticksAlive = Math.floor(20 * tpy);   // now an adult
    const clock = w.getComponent<{ tick: number }>(w.query(C_CLOCK)[0], C_CLOCK)!;
    clock.tick += cfg.reflectionIntervalDays * cfg.ticksPerDay + 1;
    runAISystem(w, cfg, stubProvider);

    // The same bonds theme now resolves to the ADULT vow…
    expect(mem.vow).toBe('to provide for those they love');
    // …announced as a coming-of-age, and remembered as a milestone.
    const log = w.getComponent<EventLogData>(w.query(C_EVENTLOG)[0], C_EVENTLOG)!;
    expect(recentEvents(log, 20).some(ev => ev.kind === 'decide' && /comes of age/.test(ev.text))).toBe(true);
    expect(mem.events.some(ev => ev.text === 'came of age')).toBe(true);
  });
});
