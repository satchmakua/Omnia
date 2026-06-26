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
import { C_AGENT, C_FLORA, C_HEALTH, C_POSITION, C_TILEMAP, C_HOME } from '../sim/components.ts';
import type { Agent, Flora, Health, Position } from '../sim/components.ts';
import type { TileMapData } from '../world/tilemap.ts';
import type { RNG } from '../sim/rng.ts';
import { getOrgStore } from '../org/orgStore.ts';
import { getCultureStore } from '../culture/cultureStore.ts';

export interface EventEffectContext {
  world: World;
  cfg: SimConfig;
  rng: RNG;
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
};

export function isKnownEventEffect(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_EFFECTS, tag);
}
