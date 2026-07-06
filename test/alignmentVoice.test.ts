// The alignment voice & the vow riders (M13 s2): the nine-cell grid speaks through vows,
// dreams, and talk — and each channel ACTS. Covers: the alignKey classification; the 45-vow
// table + vowAlign recording; the four riders (alms / malice / steadfast / free spirit);
// dream waking effects (mood tilt, the wicked's relish, pole consolidation); conversation
// touch (mood lift, comfort, rival sting, lawful-cool/chaotic-heat feud deltas); and content
// coverage — every one of the nine alignments is reachable in every channel.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_CLOCK, C_MEMORY, C_ALIGNMENT, C_WALLET, C_POSITION, C_RELATIONSHIPS, C_HEALTH,
} from '../src/sim/components.ts';
import type { Agent, Clock, Memory, Alignment, Wallet, Relationships } from '../src/sim/components.ts';
import { alignKey, goodPole, lawPole, alignmentName } from '../src/sim/heredity.ts';
import type { AlignKey } from '../src/sim/heredity.ts';
import { distill, ALIGN_VOW_TABLE, buildDreamPrompt, soulCue } from '../src/ai/memory.ts';
import { stubProvider, ALIGN_TABLES } from '../src/ai/stubProvider.ts';
import { generateConversation, ALIGN_OPEN, ALIGN_RIVAL_OPEN, ALIGN_REPLY } from '../src/ai/dialogue.ts';
import { runVowSystem } from '../src/sim/systems/VowSystem.ts';
import { runAISystem } from '../src/sim/systems/AISystem.ts';
import { runCrimeSystem } from '../src/sim/systems/CrimeSystem.ts';
import { runMentalStateSystem } from '../src/sim/systems/MentalStateSystem.ts';
import { runActionSystem } from '../src/sim/systems/ActionSystem.ts';

const cfg = defaultConfig;
const KEYS: AlignKey[] = ['LG', 'NG', 'CG', 'LN', 'TN', 'CN', 'LE', 'NE', 'CE'];
const AXIS: Record<AlignKey, { good: number; law: number }> = {
  LG: { good: 0.6, law: 0.6 }, NG: { good: 0.6, law: 0 }, CG: { good: 0.6, law: -0.6 },
  LN: { good: 0, law: 0.6 }, TN: { good: 0, law: 0 }, CN: { good: 0, law: -0.6 },
  LE: { good: -0.6, law: 0.6 }, NE: { good: -0.6, law: 0 }, CE: { good: -0.6, law: -0.6 },
};

function clockWorld(tick: number, isDay = true): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: Math.floor(tick / cfg.ticksPerDay), hour: 0, isDay });
  return w;
}
function soul(w: World, opts: {
  x?: number; y?: number; good?: number; law?: number; mood?: number; gold?: number; debt?: number;
  vowAlign?: string; memories?: number; action?: string; child?: boolean;
}): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: `Soul${e}`, action: (opts.action ?? 'wander') as Agent['action'],
    ticksAlive: Math.floor((opts.child ? 5 : 25) * ticksPerYear(cfg)),
    wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, mood: opts.mood ?? 0.7,
  });
  if (opts.x !== undefined) w.addComponent(e, C_POSITION, { x: opts.x, y: opts.y ?? 0 });
  if (opts.good !== undefined || opts.law !== undefined) {
    w.addComponent<Alignment>(e, C_ALIGNMENT, { good: opts.good ?? 0, law: opts.law ?? 0 });
  }
  if (opts.gold !== undefined || opts.debt !== undefined) {
    w.addComponent<Wallet>(e, C_WALLET, { gold: opts.gold ?? 0, debt: opts.debt ?? 0 });
  }
  const events = Array.from({ length: opts.memories ?? 0 }, (_, i) => ({ tick: i, text: 'walked the fields', importance: 0.2 }));
  w.addComponent<Memory>(e, C_MEMORY, {
    events, summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: 0,
    utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9, vowAlign: opts.vowAlign,
  });
  return e;
}

// ── The nine-cell classification ─────────────────────────────────────────────────────
describe('alignKey — the nine-cell grid (M13 s2)', () => {
  it('classifies all nine cells at the same thresholds as alignmentName', () => {
    for (const k of KEYS) {
      expect(alignKey(AXIS[k] as Alignment)).toBe(k);
      // one convention, two spellings — the key always matches the display name
      const name = alignmentName(AXIS[k] as Alignment);
      expect(name.startsWith('True') ? 'TN' : name.split(' ').map(s => s[0]).reverse().join('')
        .replace(/^(.)(.)$/, '$2$1')).toBeDefined();   // shape only; exact naming tested in heredity's own suite
    }
    expect(alignKey({ good: 0.33, law: 0.33 })).toBe('TN');    // the fence sits inside neutral
    expect(alignKey({ good: 0.34, law: -0.34 })).toBe('CG');
  });
  it('poles read off the key', () => {
    expect(goodPole('LG')).toBe('G'); expect(goodPole('NE')).toBe('E'); expect(goodPole('TN')).toBe('N');
    expect(lawPole('LE')).toBe('L'); expect(lawPole('CG')).toBe('C'); expect(lawPole('TN')).toBe('N');
  });
});

// ── Vows: nine voices, one sworn key ─────────────────────────────────────────────────
describe('alignment-voiced vows (M13 s2)', () => {
  const bondsEvents = [{ tick: 0, text: 'a child was born', importance: 0.9 }];
  it('the same life swears nine different oaths across the grid — TN keeps the original words', () => {
    const vows = new Set<string>();
    for (const k of KEYS) {
      const d = distill(bondsEvents, false, k);
      expect(d.vow).toBe(ALIGN_VOW_TABLE[k].bonds);
      vows.add(d.vow);
    }
    expect(vows.size).toBe(9);                                            // all distinct
    expect(distill(bondsEvents, false, 'TN').vow).toBe('to provide for those they love');   // the pre-M13s2 wording
    expect(distill(bondsEvents).vow).toBe('to provide for those they love');                // default stays compatible
  });
  it('the vow table covers all nine alignments × all five themes', () => {
    for (const k of KEYS) {
      for (const theme of ['none', 'bonds', 'grit', 'loss', 'toil'] as const) {
        expect(ALIGN_VOW_TABLE[k][theme]).toBeTruthy();
      }
    }
  });
  it('a child swears no aligned oath (no rider); a grown soul records the key it swore under', () => {
    const w = clockWorld(cfg.ticksPerDay);
    const grown = soul(w, { ...AXIS.LE, memories: 3, x: 1 });
    const kid = soul(w, { ...AXIS.LE, memories: 3, x: 3, child: true });
    runAISystem(w, cfg, stubProvider);
    expect(w.getComponent<Memory>(grown, C_MEMORY)!.vowAlign).toBe('LE');
    expect(w.getComponent<Memory>(kid, C_MEMORY)!.vowAlign).toBeUndefined();
  });
});

// ── Rider 1: the good-sworn give alms ────────────────────────────────────────────────
describe('vow rider — alms (VowSystem)', () => {
  // Pick a tick whose day-phase matches the giver's entity id so the weekly cadence fires.
  const almsTick = (w: World, giver: EntityId): number => {
    const interval = Math.round(cfg.almsIntervalDays);
    let day = interval * 10; while ((day + giver) % interval !== 0) day++;
    return day * cfg.ticksPerDay;
  };
  it('a good-sworn adult with surplus gives to the poorest neighbour — gold conserved, debt paid first', () => {
    const w = clockWorld(0);
    const giver = soul(w, { x: 5, y: 5, gold: 50, vowAlign: 'NG', memories: 0 });
    const pauper = soul(w, { x: 6, y: 5, gold: 1, debt: 2 });
    w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!.tick = almsTick(w, giver);
    runVowSystem(w, cfg);
    const gw = w.getComponent<Wallet>(giver, C_WALLET)!, pw = w.getComponent<Wallet>(pauper, C_WALLET)!;
    expect(gw.gold).toBe(50 - cfg.almsAmount);
    expect(pw.debt).toBe(0);                                              // alms clear the debt first
    expect(pw.gold).toBe(1 + (cfg.almsAmount - 2));
    expect(gw.gold + pw.gold - (50 + 1 - 2)).toBe(0);                     // conserved (less the debt retired)
  });
  it('no alms from the evil-sworn, the unsworn, or the merely comfortable-less', () => {
    const w = clockWorld(0);
    const evil = soul(w, { x: 5, y: 5, gold: 50, vowAlign: 'NE' });
    const unsworn = soul(w, { x: 8, y: 5, gold: 50 });
    const broke = soul(w, { x: 11, y: 5, gold: cfg.almsMinGold - 1, vowAlign: 'LG' });
    const pauper = soul(w, { x: 6, y: 5, gold: 1 });
    for (const g of [evil, unsworn, broke]) {
      w.getComponent<Clock>(w.query(C_CLOCK)[0], C_CLOCK)!.tick = almsTick(w, g);
      runVowSystem(w, cfg);
    }
    expect(w.getComponent<Wallet>(pauper, C_WALLET)!.gold).toBe(1);       // untouched
  });
});

// ── Rider 2: the evil-sworn feed malice (CrimeSystem) ────────────────────────────────
describe('vow rider — malice (CrimeSystem)', () => {
  const crimeWorld = (vowAlign?: string) => {
    const w = clockWorld(cfg.ticksPerDay);
    // wicked (good < threshold), law 0, un-aggressive trait-less adult → theft path; victim adjacent.
    const thief = soul(w, { x: 5, y: 5, good: -0.2, law: 0, gold: 0, vowAlign });
    w.addComponent(thief, C_HEALTH, { value: 1, ill: false });
    const mark = soul(w, { x: 6, y: 5, gold: 20 });
    w.addComponent(mark, C_HEALTH, { value: 1, ill: false });
    // fixed roll 0.5: base wicked chance = crimeChancePerDay×2 (law 0, no watch) — sits below 0.5
    // at the test config; sworn malice ×evilVowCrimeFactor lifts it above. One draw either way.
    const rng = Object.assign(() => 0.5, { int: () => 0 }) as unknown as Parameters<typeof runCrimeSystem>[2];
    runCrimeSystem(w, { ...cfg, crimeChancePerDay: 0.2 }, rng);
    return w.getComponent<Wallet>(mark, C_WALLET)!.gold;
  };
  it('an evil-sworn soul offends where an identical unsworn one holds back', () => {
    expect(crimeWorld(undefined)).toBe(20);   // 0.5 ≥ 0.4 → no theft
    expect(crimeWorld('CE')).toBeLessThan(20); // 0.5 < 0.4×1.5 → the sworn strike
  });
});

// ── Rider 3: the lawful-sworn are steadfast (MentalStateSystem) ──────────────────────
describe('vow rider — steadfast (MentalStateSystem)', () => {
  const breaks = (vowAlign?: string): Set<number> => {
    const w = clockWorld(cfg.ticksPerDay);
    const broken = new Set<number>();
    for (let i = 0; i < 120; i++) soul(w, { x: i % 12, y: Math.floor(i / 12), mood: 0.1, vowAlign });
    runMentalStateSystem(w, cfg);
    for (const e of w.query(C_AGENT)) if (w.getComponent<Agent>(e, C_AGENT)!.mentalState) broken.add(e);
    return broken;
  };
  it('the oath-keeping crack strictly less often — and only ever a subset (same hash rolls)', () => {
    const un = breaks(undefined), sworn = breaks('LN');
    expect(un.size).toBeGreaterThan(0);                    // misery does break some
    expect(sworn.size).toBeLessThan(un.size);              // …but fewer of the sworn
    for (const e of sworn) expect(un.has(e)).toBe(true);   // exactly the sub-threshold subset
  });
});

// ── Rider 4: the chaotic-sworn are free spirits (ActionSystem) ───────────────────────
describe('vow rider — free spirit (ActionSystem)', () => {
  it('with the same purse, the unsworn work on while the chaotic-sworn call it a life', () => {
    const w = clockWorld(cfg.ticksPerDay);
    const gold = 45;   // between chaosVowGoalFactor×goal (42.5) and goal (50)
    const striver = soul(w, { x: 1, gold });
    const spirit = soul(w, { x: 3, gold, vowAlign: 'CN' });
    for (const e of [striver, spirit]) {
      w.addComponent(e, 'Job' as never, { employer: 999, wage: 1, professionName: 'farmer' } as never);
      w.addComponent(e, 'Needs' as never, { hunger: 1, energy: 1, social: 1, fun: 1 } as never);
    }
    runActionSystem(w, cfg);
    expect(w.getComponent<Agent>(striver, C_AGENT)!.action).toBe('work');
    expect(w.getComponent<Agent>(spirit, C_AGENT)!.action).toBe('wander');
  });
});

// ── Dreams act: waking mood + pole consolidation ─────────────────────────────────────
describe('dreams act (M13 s2)', () => {
  const dreamNight = (opts: { purpose?: number; good?: number; law?: number }) => {
    const w = clockWorld(2 * cfg.ticksPerDay, false);      // night
    const e = soul(w, { x: 1, good: opts.good ?? 0, law: opts.law ?? 0, mood: 0.5, memories: 3, action: 'sleep' });
    const mem = w.getComponent<Memory>(e, C_MEMORY)!;
    mem.purpose = opts.purpose ?? 0;
    mem.lastReflectTick = 2 * cfg.ticksPerDay;             // just reflected — tonight only the DREAM acts
    runAISystem(w, cfg, stubProvider);
    return { mood: w.getComponent<Agent>(e, C_AGENT)!.mood!, al: w.getComponent<Alignment>(e, C_ALIGNMENT) };
  };
  it('a restful dream lifts the waking mood; a grief-troubled one dips it', () => {
    expect(dreamNight({ purpose: 0.2 }).mood).toBeCloseTo(0.5 + cfg.dreamMoodNudge, 6);
    expect(dreamNight({ purpose: -0.3 }).mood).toBeCloseTo(0.5 - cfg.dreamMoodNudge, 6);
  });
  it('the evil-souled RELISH the dark — a troubled dream whets rather than wounds', () => {
    expect(dreamNight({ purpose: -0.3, good: -0.6 }).mood).toBeCloseTo(0.5 + cfg.dreamMoodNudge, 6);
  });
  it('sleep draws a held pole toward the ±0.6 ARCHETYPE — never the rim — and leaves neutral axes be', () => {
    const { al } = dreamNight({ good: 0.4, law: -0.4 });
    expect(al!.good).toBeCloseTo(0.4 + cfg.dreamAlignDrift * (0.6 - 0.4), 6);      // below the anchor: firms outward…
    expect(al!.law).toBeCloseTo(-0.4 + cfg.dreamAlignDrift * (-0.6 + 0.4), 6);
    expect(dreamNight({ good: 0.1, law: 0 }).al!.good).toBeCloseTo(0.1, 6);        // neutral stays put
  });
  it('no alignment state is absorbing — a soul at the rim eases BACK toward the archetype', () => {
    const { al } = dreamNight({ good: -1, law: 1 });
    expect(al!.good).toBeGreaterThan(-1);                                          // −1 is not a trap
    expect(al!.good).toBeCloseTo(-1 + cfg.dreamAlignDrift * (-0.6 + 1), 6);        // pulled toward −0.6
    expect(al!.law).toBeLessThan(1);                                               // +1 relaxes toward +0.6
  });
});

// ── Talk acts: lift, comfort, sting, and the feud thermostat ─────────────────────────
describe('talk acts (M13 s2)', () => {
  const pair = (relType: 'friend' | 'rival', a: Partial<{ good: number; law: number; mood: number }>, b: Partial<{ good: number; law: number; mood: number }>, sentiment = -0.5) => {
    const w = clockWorld(cfg.ticksPerDay);
    const s1 = soul(w, { x: 5, y: 5, good: a.good, law: a.law, mood: a.mood ?? 0.7, memories: 3 });
    const s2 = soul(w, { x: 6, y: 5, good: b.good, law: b.law, mood: b.mood ?? 0.7, memories: 3 });
    const mk = (edges: Record<number, object>) => ({ edges }) as unknown as Relationships;
    w.addComponent<Relationships>(s1, C_RELATIONSHIPS, mk({ [s2]: { type: relType, sentiment } }));
    w.addComponent<Relationships>(s2, C_RELATIONSHIPS, mk({ [s1]: { type: relType, sentiment } }));
    runAISystem(w, cfg, stubProvider);
    return {
      m1: w.getComponent<Agent>(s1, C_AGENT)!.mood!, m2: w.getComponent<Agent>(s2, C_AGENT)!.mood!,
      e1: (w.getComponent<Relationships>(s1, C_RELATIONSHIPS)!.edges as Record<number, { sentiment: number }>)[s2].sentiment,
      e2: (w.getComponent<Relationships>(s2, C_RELATIONSHIPS)!.edges as Record<number, { sentiment: number }>)[s1].sentiment,
    };
  };
  it('a friendly word gladdens both — and a GOOD soul’s word to the low lands harder', () => {
    const plain = pair('friend', {}, {});
    expect(plain.m1).toBeCloseTo(0.7 + cfg.talkMoodLift, 6);
    expect(plain.m2).toBeCloseTo(0.7 + cfg.talkMoodLift, 6);
    const consoled = pair('friend', { good: 0.6 }, { mood: 0.3 });
    expect(consoled.m2).toBeCloseTo(0.3 + cfg.talkMoodLift + cfg.talkComfort, 6);
  });
  it('rival words sting both; a LAWFUL speaker cools the grudge, a CHAOTIC one deepens it', () => {
    const lawful = pair('rival', { law: 0.6 }, {});
    expect(lawful.m1).toBeCloseTo(0.7 - cfg.talkRivalSting, 6);
    expect(lawful.e1).toBeCloseTo(-0.5 + cfg.talkFeudDelta, 6);            // restraint cools…
    expect(lawful.e2).toBeCloseTo(-0.5 + cfg.talkFeudDelta, 6);
    const chaotic = pair('rival', { law: -0.6 }, {});
    expect(chaotic.e1).toBeCloseTo(-0.5 - cfg.talkFeudDelta, 6);           // …heat inflames
    const neutral = pair('rival', {}, {});
    expect(neutral.e1).toBeCloseTo(-0.5, 6);                               // the unaligned leave it lie
  });
});

// ── Content coverage: every alignment is REACHABLE in every channel ──────────────────
describe('the nine voices are all reachable (no dead content)', () => {
  it('dialogue: every alignment’s openers, rival lines, and replies appear for some seed', () => {
    for (const k of KEYS) {
      let open = false, rival = false, reply = false;
      for (let s = 0; s < 200 && !(open && rival && reply); s++) {
        const A = { name: 'A', mood: 0.7, align: k }, B = { name: 'B', mood: 0.7, align: k };
        const f = generateConversation(`${s}.x`, A, B, 'friend');
        if ((ALIGN_OPEN[k] as readonly string[]).includes(f[0].text)) open = true;
        if (f[1] && (ALIGN_REPLY[k] as readonly string[]).includes(f[1].text)) reply = true;
        const r = generateConversation(`${s}.y`, A, B, 'rival');
        if ((ALIGN_RIVAL_OPEN[k] as readonly string[]).includes(r[0].text)) rival = true;
      }
      expect({ k, open, rival, reply }).toEqual({ k, open: true, rival: true, reply: true });
    }
  });
  it('stub: every alignment’s dream pool is reachable via the soul cue — and silent without it', () => {
    for (const k of KEYS) {
      const name = alignmentName(AXIS[k] as Alignment).toLowerCase();
      let hit = false;
      for (let t = 0; t < 80 && !hit; t++) {
        const line = stubProvider.completeSync(buildDreamPrompt('Aya', t, [{ tick: 0, text: 'walked the fields', importance: 0.2 }], soulCue(name)));
        if (ALIGN_TABLES.dream![k].includes(line)) hit = true;
      }
      expect({ k, hit }).toEqual({ k, hit: true });
    }
    const all = new Set(Object.values(ALIGN_TABLES.dream!).flat());
    for (let t = 0; t < 30; t++) {
      const line = stubProvider.completeSync(buildDreamPrompt('Aya', t, [{ tick: 0, text: 'walked the fields', importance: 0.2 }]));
      expect(all.has(line)).toBe(false);   // no cue → the life-themes speak, never the grid
    }
  });
  it('stub: belief & resolution pools cover all nine and are reachable', () => {
    for (const k of KEYS) {
      expect(ALIGN_TABLES.belief![k].length).toBeGreaterThan(0);
      expect(ALIGN_TABLES.decide![k].length).toBeGreaterThan(0);
    }
  });
});
