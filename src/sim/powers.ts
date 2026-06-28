// The CODE side of the god-power data/behaviour boundary (M27 s2, D9 — mirrors src/event/effects.ts
// and src/magic/effects.ts). Content (content/powers/*.yaml) declares the roster — each power's name,
// its `effect` tag, what it targets, cost/cooldown; this file implements what each tag actually does to
// the world. Declaring an effect tag in YAML without a matching implementation here is a load-time
// error (see loader.ts). A power is applied as a recorded `Intervention` (interventions.ts), so the run
// still replays exactly: the effects are deterministic, drawing only from the supplied seeded `rng`
// (and most draw none at all). Every change is bounded so a divine act can't push state out of range.
import type { World, EntityId } from './ecs.ts';
import {
  C_AGENT, C_NEEDS, C_HEALTH, C_WALLET, C_POSITION, C_CHRONICLE,
} from './components.ts';
import type { Agent, Needs, Health, Wallet, Position } from './components.ts';
import type { SimConfig } from './config.ts';
import { ticksPerYear } from './config.ts';
import type { RNG } from './rng.ts';
import type { Content } from '../content/loader.ts';
import type { Power } from '../content/schema.ts';
import { killAgent } from './death.ts';
import { emitEvent } from '../history/eventlog.ts';
import { chronicleAdd } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';
import { fireWorldEvent } from '../event/effects.ts';

export interface PowerEffectContext {
  world: World;
  cfg: SimConfig;
  rng: RNG;
  content: Content;
  tick: number;
  power: Power;          // the invoked power (carries `event` for summon, etc.)
  target: EntityId | null;
  amount: number;        // resolved magnitude (the Intervention's, or the power's default)
}

export type PowerEffectFn = (ctx: PowerEffectContext) => void;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// Shared helpers for the targeted powers.
function chronicleOf(world: World): ChronicleData | undefined {
  const ents = world.query(C_CHRONICLE);
  return ents.length ? world.getComponent<ChronicleData>(ents[0], C_CHRONICLE) : undefined;
}
function nameOf(world: World, id: EntityId | null): string {
  return (id !== null ? world.getComponent<Agent>(id, C_AGENT)?.name : undefined) ?? 'a soul';
}
function posOf(world: World, id: EntityId | null): Position | undefined {
  return id !== null ? world.getComponent<Position>(id, C_POSITION) ?? undefined : undefined;
}
const livingTarget = (world: World, id: EntityId | null): boolean => id !== null && world.hasComponent(id, C_AGENT);

export const POWER_EFFECTS: Record<string, PowerEffectFn> = {
  // A bolt from on high — strike a soul down. The heaviest act, so it earns a Chronicle legend.
  smite: ({ world, cfg, target, tick }) => {
    if (!livingTarget(world, target)) return;
    const pos = posOf(world, target);
    const tomb = killAgent(world, target!, tick, 'struck down by the gods', ticksPerYear(cfg));
    emitEvent(world, 'paranormal', `${tomb.name} was struck down by a bolt from on high.`, pos);
    const ch = chronicleOf(world);
    if (ch) chronicleAdd(ch, { tick, importance: 0.82, kind: 'paranormal', text: `${tomb.name} was struck down by the gods.` }, cfg.chronicleImportanceThreshold);
  },

  // Divine favour — restore body & spirit (needs, health, a mood lift).
  bless: ({ world, target }) => {
    if (!livingTarget(world, target)) return;
    const needs = world.getComponent<Needs>(target!, C_NEEDS); if (needs) { needs.hunger = 1; needs.energy = 1; needs.social = 1; }
    const h = world.getComponent<Health>(target!, C_HEALTH); if (h) { h.value = 1; h.ill = false; }
    const a = world.getComponent<Agent>(target!, C_AGENT); if (a && a.mood !== undefined) a.mood = clamp01(a.mood + 0.4);
    emitEvent(world, 'paranormal', `${nameOf(world, target)} was touched by divine favour — restored in body and spirit.`, posOf(world, target));
  },

  // Divine wrath, short of death — sap the body & mood.
  curse: ({ world, target }) => {
    if (!livingTarget(world, target)) return;
    const h = world.getComponent<Health>(target!, C_HEALTH); if (h) h.value = Math.max(0.1, h.value - 0.5);
    const a = world.getComponent<Agent>(target!, C_AGENT); if (a && a.mood !== undefined) a.mood = clamp01(a.mood - 0.4);
    emitEvent(world, 'paranormal', `${nameOf(world, target)} was cursed by the gods — laid low in body and spirit.`, posOf(world, target));
  },

  // A gift of gold from the heavens.
  bestow: ({ world, target, amount }) => {
    if (!livingTarget(world, target)) return;
    const w = world.getComponent<Wallet>(target!, C_WALLET); const gold = amount || 50;
    if (w) w.gold += gold;
    emitEvent(world, 'paranormal', `the gods bestowed ${gold}g upon ${nameOf(world, target)}.`, posOf(world, target));
  },

  // Stir the heavens — fire a named world event through the M19 pipeline (a festival, a bounty, a
  // plague). The power names which event in its `event` field (loader-checked it exists). Town-wide,
  // so it ignores the target. Reuses the event's own effect/message/Chronicle handling.
  summon: ({ world, cfg, rng, content, power, tick }) => {
    if (!power.event) return;
    const ev = content.events.get(power.event);
    if (ev) fireWorldEvent(world, cfg, rng, ev, tick);
  },
};

export function isKnownPowerEffect(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(POWER_EFFECTS, tag);
}
