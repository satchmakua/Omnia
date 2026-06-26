// Procedural quests (M20 s3): folk take up apt goals (hunt/avenge/explore), and their own
// deeds — a kill, a ruin uncovered — fulfil them; stale quests are quietly abandoned.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import {
  C_AGENT, C_CLOCK, C_QUEST, C_COMBAT, C_PERSONALITY, C_RELATIONSHIPS, C_POSITION, C_RUIN, C_FAUNA, C_BODY, C_NEEDS, C_TILEMAP,
} from '../src/sim/components.ts';
import type { Agent, Clock, Quest, Combat, Personality, Relationships, Ruin, Fauna, Body, Needs, Position } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { runQuestSystem } from '../src/sim/systems/QuestSystem.ts';
import { combatantOf } from '../src/sim/combat.ts';
import { runMovementSystem } from '../src/sim/systems/MovementSystem.ts';
import { createRNG } from '../src/sim/rng.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;

function questWorld(tick = cfg.ticksPerDay): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  return w;
}
function adult(w: World, trait: string, over: Partial<Agent> = {}): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `A${e}`, action: 'wander', ticksAlive: Math.floor(30 * ticksPerYear(cfg)), wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, ...over });
  w.addComponent<Personality>(e, C_PERSONALITY, { trait });
  return e;
}
function predator(w: World): void {
  const e = w.createEntity();
  w.addComponent<Fauna>(e, C_FAUNA, { speciesId: 'stalker', name: 'Stalker', color: '#a55', size: 'medium', diet: 'predator', hunger: 0.8, hungerDecayPerTick: 0.01, breedThreshold: 0.7, breedCooldownTicks: 0, ticksAlive: 0 });
}
const questOf = (w: World, e: EntityId) => w.getComponent<Quest>(e, C_QUEST);

describe('QuestSystem — assignment (M20 s3)', () => {
  it('a bold soul takes up the hunt when beasts stalk the land', () => {
    const w = questWorld();
    predator(w);
    const e = adult(w, 'brave');
    runQuestSystem(w, cfg);
    expect(questOf(w, e)?.kind).toBe('hunt');
  });

  it('a wronged bold soul vows vengeance; a curious one seeks the ruins', () => {
    const wv = questWorld();
    const e = adult(wv, 'hot-headed');
    const rel: Relationships = { edges: { 9: { type: 'rival', sentiment: -0.5 } } };
    wv.addComponent<Relationships>(e, C_RELATIONSHIPS, rel);
    runQuestSystem(wv, cfg);
    expect(questOf(wv, e)?.kind).toBe('avenge');

    const wx = questWorld();
    const c = adult(wx, 'curious');
    const ru = wx.createEntity();
    wx.addComponent<Ruin>(ru, C_RUIN, { what: 'old ruins', discovered: false, sinceTick: 0 });
    wx.addComponent(ru, C_POSITION, { x: 5, y: 7 });
    runQuestSystem(wx, cfg);
    expect(questOf(wx, c)?.kind).toBe('explore');
    expect(questOf(wx, c)?.tx).toBe(5);
  });

  it('a placid soul takes up nothing; only one quest is granted a day', () => {
    const w = questWorld();
    predator(w);
    adult(w, 'gentle');           // not bold → no quest
    const b1 = adult(w, 'brave');
    const b2 = adult(w, 'brave');
    runQuestSystem(w, cfg);
    const got = [b1, b2].filter(e => questOf(w, e));
    expect(got.length).toBe(1);   // one a day
  });
});

describe('QuestSystem — resolution (M20 s3)', () => {
  it('a hunter who has slain fulfils the vow (quest cleared)', () => {
    const w = questWorld();
    const e = adult(w, 'brave');
    w.addComponent<Quest>(e, C_QUEST, { kind: 'hunt', text: 'hunt the beasts', sinceTick: 0, baseKills: 0 });
    w.addComponent<Combat>(e, C_COMBAT, { scars: 0, kills: 1 });   // a kill since the vow
    runQuestSystem(w, cfg);
    expect(w.hasComponent(e, C_QUEST)).toBe(false);
  });

  it('an explorer fulfils their quest when the target ruin is uncovered', () => {
    const w = questWorld();
    const e = adult(w, 'curious');
    w.addComponent<Quest>(e, C_QUEST, { kind: 'explore', text: 'seek the ruins', sinceTick: 0, tx: 5, ty: 7 });
    const ru = w.createEntity();
    w.addComponent<Ruin>(ru, C_RUIN, { what: 'old ruins', discovered: true, sinceTick: 0 });
    w.addComponent(ru, C_POSITION, { x: 5, y: 7 });
    runQuestSystem(w, cfg);
    expect(w.hasComponent(e, C_QUEST)).toBe(false);
  });

  it('a long-unfulfilled quest is quietly abandoned', () => {
    const w = questWorld(20 * ticksPerYear(cfg));   // far in the future
    const e = adult(w, 'brave');
    w.addComponent<Quest>(e, C_QUEST, { kind: 'hunt', text: 'hunt', sinceTick: 0, baseKills: 0 });   // vowed long ago
    runQuestSystem(w, cfg);
    expect(w.hasComponent(e, C_QUEST)).toBe(false);
  });
});

// ── Active pursuit (M20 s3): hunters fight harder; explorers seek their ruin ───────────
describe('QuestSystem — pursuit (M20 s3)', () => {
  it('a hunter on the quest fights with more zeal', () => {
    const w = new World();
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'H', action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Body>(e, C_BODY, { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, heightCm: 175, build: 0.5, eye: 0.5, hair: 0.5 });
    w.addComponent<Personality>(e, C_PERSONALITY, { trait: 'loyal' });   // ferocity-neutral trait
    const bare = combatantOf(w, e).ferocity;
    w.addComponent<Quest>(e, C_QUEST, { kind: 'hunt', text: 'hunt', sinceTick: 0, baseKills: 0 });
    expect(combatantOf(w, e).ferocity).toBeGreaterThan(bare);   // the vow lends fury
  });

  it('an explorer walks toward the ruin they vowed to seek (instead of wandering off)', () => {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 100, day: 0, hour: 0, isDay: true });
    const map: TileMapData = { width: 16, height: 16, biomeIndex: new Uint16Array(16 * 16), biomeIds: ['ground'], biomeNames: ['Ground'], colors: ['#333'], passableByBiome: [true] };
    w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, map);
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'E', action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Needs>(e, C_NEEDS, { hunger: 0.9, energy: 0.9, social: 0.9 });
    w.addComponent<Position>(e, C_POSITION, { x: 2, y: 2 });
    w.addComponent<Quest>(e, C_QUEST, { kind: 'explore', text: 'seek the ruins', sinceTick: 0, tx: 12, ty: 12 });
    const dist = () => { const p = w.getComponent<Position>(e, C_POSITION)!; return Math.abs(p.x - 12) + Math.abs(p.y - 12); };
    const before = dist();
    for (let t = 0; t < 5; t++) runMovementSystem(w, cfg, createRNG(1), testContent());
    expect(dist()).toBeLessThan(before);   // closing on the ruins, not wandering away
  });
});
