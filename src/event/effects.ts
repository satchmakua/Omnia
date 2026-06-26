// The CODE side of the world-event data/behaviour boundary (M19, D9, mirrors
// src/capability/effects.ts). Content (content/events/*.yaml) declares which
// `effect` tag an event triggers; this file implements what each tag actually
// does to the world. Declaring an effect tag in YAML without a matching
// implementation here is a load-time error (see loader.ts).
//
// Effects are pure functions of the world (no RNG of their own → an event firing
// is deterministic given the seed), and every change is bounded/clamped so an
// event can never push state out of its valid range. Slice 1 ships benign
// "fortune" effects; disasters/paranormal land on this same registry later.
import type { World } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import { C_AGENT, C_FLORA } from '../sim/components.ts';
import type { Agent, Flora } from '../sim/components.ts';
import { getOrgStore } from '../org/orgStore.ts';

export interface EventEffectContext {
  world: World;
  cfg: SimConfig;
}

export type EventEffectFn = (ctx: EventEffectContext) => void;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export const EVENT_EFFECTS: Record<string, EventEffectFn> = {
  // A bountiful harvest: every plant surges toward ripeness, so foraging is easy
  // for a while. Bounded by the [0,1] maturity range.
  bountiful_harvest: ({ world }) => {
    for (const e of world.query(C_FLORA)) {
      const f = world.getComponent<Flora>(e, C_FLORA)!;
      f.maturity = clamp01(f.maturity + 0.4);
    }
  },

  // A festival / day of gladness: the town's spirits lift. A temporary bump that
  // MoodSystem then drifts back toward each agent's circumstance — joy fades.
  festival: ({ world }) => {
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      if (a.mood !== undefined) a.mood = clamp01(a.mood + 0.15);
    }
  },

  // A great discovery: a windfall of insight speeds every living tribe's research,
  // nudging the tech ladder forward (the ResearchSystem spends the accumulated points).
  great_discovery: ({ world, cfg }) => {
    const store = getOrgStore(world);
    if (!store) return;
    const windfall = cfg.researchBasePerDay * 15;   // ~a couple of weeks of progress, free
    for (const org of Object.values(store.byId)) {
      if (!org.extinct) org.research = (org.research ?? 0) + windfall;
    }
  },
};

export function isKnownEventEffect(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_EFFECTS, tag);
}
