// The CODE side of the world-event data/behaviour boundary (M19, D9, mirrors
// src/capability/effects.ts). Content (content/events/*.yaml) declares which
// `effect` tag an event triggers; this file implements what each tag actually
// does to the world. Declaring an effect tag in YAML without a matching
// implementation here is a load-time error (see loader.ts).
//
// Effects may draw from the supplied seeded `rng` (so a disaster can pick its
// victims/epicenter) but nothing else random — a firing stays deterministic and
// replayable for a given seed. Every change is bounded/clamped so an event can
// never push state out of its valid range. Slice 1 ships benign "fortune"
// effects; slice 2 (disasters) adds real negative — but survivable — consequences.
import type { World, EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import { C_AGENT, C_FLORA, C_HEALTH, C_POSITION, C_TILEMAP, C_HOME, C_MEMORY, C_MAGIC, C_CHRONICLE } from '../sim/components.ts';
import type { Agent, Flora, Health, Position, Magic } from '../sim/components.ts';
import type { TileMapData } from '../world/tilemap.ts';
import type { RNG } from '../sim/rng.ts';
import type { WorldEvent } from '../content/schema.ts';
import { ageInYears } from '../sim/config.ts';
import { getOrgStore } from '../org/orgStore.ts';
import { getCultureStore } from '../culture/cultureStore.ts';
import { remember } from '../ai/memory.ts';
import { emitEvent } from '../history/eventlog.ts';
import type { EventKind } from '../history/eventlog.ts';
import { chronicleAdd } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';

export interface EventEffectContext {
  world: World;
  cfg: SimConfig;
  rng: RNG;
  tick: number;
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

  // ── Disasters (slice 2): real, but survivable, harm ─────────────────────────────
  // Famine: the crops fail — every plant withers most of the way back, so foraging
  // grows lean until the land recovers. Hardship pulls folk together: each living
  // culture drifts a touch more *communal* (thriftier, more sharing — the long-deferred
  // famine→thrift value response, D26, via wealthGoalFactor). Bounded; no deaths of its own.
  famine: ({ world }) => {
    for (const e of world.query(C_FLORA)) {
      const f = world.getComponent<Flora>(e, C_FLORA)!;
      f.maturity *= 0.4;
    }
    const cs = getCultureStore(world);
    if (cs) for (const c of Object.values(cs.byId)) {
      if (!c.extinct) c.values.communal = clamp01(c.values.communal + 0.04);
    }
  },

  // Plague: a sickness sweeps the town — about half the folk fall ill and lose health.
  // The hale shrug it off (HealthSystem heals them); the frail and the old may not. The
  // health hit is modest, so it's a brush with mortality, not a culling.
  plague: ({ world, rng }) => {
    for (const e of world.query(C_AGENT, C_HEALTH)) {
      if (rng() < 0.5) {
        const h = world.getComponent<Health>(e, C_HEALTH)!;
        h.value = Math.max(0, h.value - 0.3);
        h.ill = true;
      }
    }
  },

  // Earthquake: the ground heaves near an epicenter — folk caught close are hurt, and the
  // nearest home is toppled to ruin (its owner rebuilds in time). Spatial and structural,
  // distinct from the town-wide plague. Bounded: one building, a small blast radius.
  earthquake: ({ world, rng }) => {
    const mapEnts = world.query(C_TILEMAP);
    const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP)! : undefined;
    if (!map) return;
    const cx = Math.floor(rng() * map.width), cy = Math.floor(rng() * map.height);
    const near = (p: Position): number => Math.abs(p.x - cx) + Math.abs(p.y - cy);

    for (const e of world.query(C_AGENT, C_HEALTH, C_POSITION)) {
      if (near(world.getComponent<Position>(e, C_POSITION)!) <= 3) {
        const h = world.getComponent<Health>(e, C_HEALTH)!;
        h.value = Math.max(0, h.value - 0.3);
        h.ill = true;
      }
    }
    // Topple the single nearest home (homes have no agent back-pointer, so this is safe —
    // the occupant simply loses it, like a farm folding; BuildSystem/RentSystem re-derive).
    let victim: EntityId | undefined; let best = Infinity;
    for (const e of world.query(C_HOME, C_POSITION)) {
      const d = near(world.getComponent<Position>(e, C_POSITION)!);
      if (d < best) { best = d; victim = e; }
    }
    if (victim !== undefined) world.destroyEntity(victim);
  },

  // ── Paranormal (slice 4): uncommon, eerie, with real (mostly inner-life) consequences ──
  // Abduction: a single adult is taken by lights in the sky and returned *changed* — a vivid,
  // impossible memory (a turning point that the M10 distill may forge into a vow) and a jolt
  // of unease. No one is lost; the mark is on the soul. rng picks who.
  abduction: ({ world, cfg, rng, tick }) => {
    const adults = world.query(C_AGENT, C_MEMORY).filter(
      e => ageInYears(world.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg) >= cfg.adultAgeYears,
    );
    if (adults.length === 0) return;
    const victim = adults[Math.floor(rng() * adults.length)];
    remember(world, victim, tick, 'was taken by lights in the sky, and returned changed', 0.8);
    const a = world.getComponent<Agent>(victim, C_AGENT)!;
    if (a.mood !== undefined) a.mood = clamp01(a.mood - 0.25);
  },

  // Haunting: the restless dead are seen abroad — a town-wide dread settles, every soul's
  // mood dips (the festival's dark mirror, dampened by the mood→social coupling). Bounded.
  haunting: ({ world }) => {
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      if (a.mood !== undefined) a.mood = clamp01(a.mood - 0.12);
    }
  },

  // Wild magic surge: raw magic floods the land — every mage is overcharged to full mana and
  // marked by the surge (a remembered wonder). With no mages it's a portent the Chronicle still
  // keeps. Bounded (mana sits at maxMana).
  wild_magic: ({ world, tick }) => {
    for (const e of world.query(C_AGENT, C_MAGIC)) {
      const m = world.getComponent<Magic>(e, C_MAGIC)!;
      m.mana = m.maxMana;
      remember(world, e, tick, 'felt a wild surge of magic course through them', 0.65);
    }
  },
};

export function isKnownEventEffect(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_EFFECTS, tag);
}

/**
 * Fire one world event: run its code-side effect, write the feed line, and (if notable enough)
 * record a Chronicle legend. The shared "what happens when an event fires" step, called by the
 * scheduled EventSystem (M19) AND by a god-summoned event (M27 s2 — the roadmap's "summon an event
 * via the M19 pipeline"). Deterministic: effects draw only from the supplied seeded `rng`.
 */
export function fireWorldEvent(world: World, cfg: SimConfig, rng: RNG, ev: WorldEvent, tick: number): void {
  const effect = EVENT_EFFECTS[ev.effect];
  if (effect) effect({ world, cfg, rng, tick });

  // Disasters and the paranormal get their own feed kinds; fortune/seasonal read as ✷ events.
  const kind: EventKind = ev.category === 'disaster' ? 'disaster'
    : ev.category === 'paranormal' ? 'paranormal' : 'event';
  emitEvent(world, kind, ev.message);

  const chEnts = world.query(C_CHRONICLE);
  const ch = chEnts.length ? world.getComponent<ChronicleData>(chEnts[0], C_CHRONICLE) : undefined;
  if (ch) {
    chronicleAdd(ch, { tick, importance: ev.importance, text: ev.message, kind: 'event' },
      cfg.chronicleImportanceThreshold);
  }
}
