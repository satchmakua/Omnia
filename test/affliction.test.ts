// Specific afflictions (M30 slice 1): injuries & conditions that are mechanically real — a maimed
// leg slows movement, a lost eye / crippled arm sap DEX / STR, the frailty of age weakens the old, a
// chronic illness lingers. These tests pin the model, the combat & movement effects, the age/illness
// sources, and that a serious wound leaves a *lasting* effect (the DoD).
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_HEALTH, C_BODY, C_POSITION, C_NEEDS, C_AFFLICTIONS, C_CLOCK, C_TILEMAP, C_LINEAGE,
} from '../src/sim/components.ts';
import type { Agent, Health, Body, Position, Needs, Afflictions, Clock, Lineage } from '../src/sim/components.ts';
import {
  addAffliction, inflictWound, abilityMod, isSlowed, recoveryFactor, hasAffliction, afflictionLabels,
} from '../src/sim/afflictions.ts';
import { combatantOf } from '../src/sim/combat.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { runHealthSystem } from '../src/sim/systems/HealthSystem.ts';
import { killAgent } from '../src/sim/death.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const tpy = ticksPerYear(cfg);
const content = testContent();
const aff = (w: World, e: EntityId) => w.getComponent<Afflictions>(e, C_AFFLICTIONS);

describe('the affliction model (M30)', () => {
  it('only a grievous wound maims, and a slain or unhurt body never does', () => {
    const w = new World();
    const e = w.createEntity();
    expect(inflictWound(w, e, 100, 0.5, cfg.maimGrievousHealth, 1)).toBeNull();   // hurt, but not to the brink
    expect(inflictWound(w, e, 100, 0, cfg.maimGrievousHealth, 1)).toBeNull();     // slain outright — the dead aren't maimed
    expect(aff(w, e)).toBeUndefined();
    const kind = inflictWound(w, e, 100, 0.1, cfg.maimGrievousHealth, 1);          // beaten to the brink, but lived
    expect(kind).toMatch(/maimed_leg|lost_eye|maimed_arm/);
    expect(aff(w, e)!.list.length).toBe(1);
  });

  it('most who survive a grievous wound are left whole (chance gates it)', () => {
    const w = new World();
    let maimed = 0;
    for (let e = 0; e < 200; e++) { w.createEntity(); if (inflictWound(w, e, 7, 0.1, cfg.maimGrievousHealth, cfg.maimChance)) maimed++; }
    expect(maimed).toBeGreaterThan(0);            // it does happen
    expect(maimed).toBeLessThan(200 * 0.6);       // …but is the exception, not the rule
  });

  it('the same grievous wound always maims the same way (deterministic, no RNG)', () => {
    const w1 = new World(); const e1 = w1.createEntity(); for (let i=0;i<5;i++) w1.createEntity();
    const w2 = new World(); const e2 = w2.createEntity(); for (let i=0;i<5;i++) w2.createEntity();
    expect(inflictWound(w1, e1, 50, 0.1, cfg.maimGrievousHealth, 1)).toBe(inflictWound(w2, e2, 50, 0.1, cfg.maimGrievousHealth, 1));
  });

  it('does not stack the same injury, and caps how much a body bears', () => {
    const w = new World(); const e = w.createEntity();
    expect(addAffliction(w, e, 'maimed_leg', 0)).toBe(true);
    expect(addAffliction(w, e, 'maimed_leg', 0)).toBe(false);   // already carries it
    addAffliction(w, e, 'lost_eye', 0); addAffliction(w, e, 'maimed_arm', 0); addAffliction(w, e, 'infirmity', 0);
    expect(addAffliction(w, e, 'chronic_illness', 0)).toBe(false);   // body is already as broken as it bears (cap 4)
  });

  it('the accessors read the mechanical effects', () => {
    const w = new World(); const e = w.createEntity();
    addAffliction(w, e, 'maimed_arm', 0); addAffliction(w, e, 'lost_eye', 0);
    expect(abilityMod(aff(w, e), 'str')).toBe(-3);
    expect(abilityMod(aff(w, e), 'dex')).toBe(-3);
    expect(isSlowed(aff(w, e))).toBe(false);            // arm/eye don't slow you
    addAffliction(w, e, 'maimed_leg', 0);
    expect(isSlowed(aff(w, e))).toBe(true);
    expect(afflictionLabels(aff(w, e))).toContain('a maimed leg');
    expect(abilityMod(undefined, 'str')).toBe(0);       // unafflicted = no effect
  });
});

describe('afflictions are mechanically real (M30)', () => {
  function bodied(w: World, str = 14, dex = 14): EntityId {
    const e = w.createEntity();
    w.addComponent<Body>(e, C_BODY, { str, dex, con: 12, int: 10, wis: 10, cha: 10, heightCm: 170, build: 0.5, eye: 0.5, hair: 0.5 });
    return e;
  }

  it('a crippled arm / lost eye make a worse combatant (the DoD: a lasting mechanical effect)', () => {
    const w = new World();
    const e = bodied(w, 14, 14);
    expect(combatantOf(w, e).str).toBe(14);
    inflictWound(w, e, 0, 0.1, cfg.maimGrievousHealth, 1);   // survived a grievous wound (seed → leg/arm/eye)
    const c = combatantOf(w, e);
    expect(c.str < 14 || c.dex < 14 || isSlowed(aff(w, e))).toBe(true);   // they're lessened, forever after
  });

  it('an ability can never be dropped below 1', () => {
    const w = new World();
    const e = bodied(w, 2, 2);
    addAffliction(w, e, 'maimed_arm', 0);   // -3 would take str to -1
    expect(combatantOf(w, e).str).toBe(1);
  });
});

describe('a maimed leg slows movement, but never starves (M30)', () => {
  function mvWorld(): World {
    const w = new World();
    const W = 16, H = 16;
    const map: TileMapData = {
      width: W, height: H, biomeIndex: new Uint16Array(W * H),
      biomeIds: ['ground'], biomeNames: ['Ground'], colors: ['#333'], passableByBiome: [true],
    };
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, map);
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
    return w;
  }
  function mover(w: World, x: number, y: number, action: Agent['action']): EntityId {
    const e = w.createEntity();
    w.addComponent<Position>(e, C_POSITION, { x, y });
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 1, energy: 1, social: 1, fun: 1 });
    w.addComponent<Agent>(e, C_AGENT, { name: `M${e}`, action, ticksAlive: 0, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    return e;
  }
  // Run one simulation with a *persistent* rng and count, per agent, the ticks on which it moved.
  function countMoves(w: World, ids: EntityId[], ticks: number): Map<EntityId, number> {
    const clk = w.query(C_CLOCK)[0];
    const rng = createRNG(1);
    const last = new Map(ids.map(e => [e, { ...w.getComponent<Position>(e, C_POSITION)! }]));
    const n = new Map(ids.map(e => [e, 0]));
    for (let t = 0; t < ticks; t++) {
      w.getComponent<Clock>(clk, C_CLOCK)!.tick = t;
      runMovementSystem(w, cfg, rng, content);
      for (const e of ids) {
        const p = w.getComponent<Position>(e, C_POSITION)!;
        const l = last.get(e)!;
        if (p.x !== l.x || p.y !== l.y) n.set(e, n.get(e)! + 1);
        last.set(e, { ...p });
      }
    }
    return n;
  }

  it('the maim slows wandering, but a survival errand is spared (no death-spiral)', () => {
    const w = mvWorld();
    const fit = mover(w, 3, 3, 'wander');            // sound of limb
    const maimed = mover(w, 12, 3, 'wander');        // hobbling about
    const seeking = mover(w, 3, 12, 'seek_food');    // maimed, but driven by hunger
    addAffliction(w, maimed, 'maimed_leg', 0);
    addAffliction(w, seeking, 'maimed_leg', 0);
    const n = countMoves(w, [fit, maimed, seeking], 60);
    expect(n.get(maimed)!).toBeLessThan(n.get(fit)!);          // the leg hampers idle getting-about
    expect(n.get(seeking)!).toBeGreaterThan(n.get(maimed)!);   // …but never the search for food
  });
});

describe('age & illness inflict afflictions (M30)', () => {
  function healthWorld(): World {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
    return w;
  }
  function elder(w: World, ageRatio: number): EntityId {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: `E${e}`, action: 'wander', ticksAlive: Math.floor(ageRatio * 100 * tpy), wealthGoal: 50, sex: 'male', lifespanTicks: 100 * tpy });
    w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
    w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
    return e;
  }

  it('the very old gain the frailty of age', () => {
    const w = healthWorld();
    const old = elder(w, 0.9), young = elder(w, 0.2);
    runHealthSystem(w, cfg, createRNG(999));   // a seed that won't roll illness/death this single day
    expect(hasAffliction(aff(w, old), 'infirmity')).toBe(true);
    expect(aff(w, young)).toBeUndefined();
  });

  it('chronic illness halves recovery', () => {
    const w = new World();
    const e = w.createEntity();
    addAffliction(w, e, 'chronic_illness', 0);
    expect(recoveryFactor(aff(w, e))).toBe(0.5);
  });
});

describe('death clears afflictions (M30)', () => {
  it('a corpse carries no injuries', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'X', action: 'wander', ticksAlive: 1000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children: [], reproCooldownTicks: 0 });
    addAffliction(w, e, 'maimed_leg', 0);
    killAgent(w, e, 100, 'an accident', tpy);
    expect(aff(w, e)).toBeUndefined();
  });
});
