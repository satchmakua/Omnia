// Special agents (M21): monsters & uncanny visitors that roam the map for a while, then leave.
// Content-driven (content/monsters/*.yaml), they are NOT folk — no brain, job, needs, or lineage,
// just Position + Health + Special. Two behaviours:
//   • predator (dragon / vampire / risen corpse / dire beast) — paths toward the nearest folk and
//     trades blows. It strikes one; every adjacent folk strikes back, so the town can gang up and
//     slay it. A slain predator makes a veteran (and oft a hero/legend) of whoever lands the killing
//     blow, and fulfils a hunter's vow (the kill credits their Combat record, which QuestSystem reads).
//   • haunt (ghost / alien) — drifts at random, drawing no blood; folk it drifts past are unsettled
//     (a mood dip + an eerie memory), once a day at most.
// Spawns are rare (per-monster daily chance), capped (MAX_SPECIALS at once), and time-limited
// (despawnDays), so specials are a recurring threat, never an extinction event — the soak verifies
// the town survives them. Runs late in the tick, after movement/fauna, so positions are final.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_FAUNA, C_SPECIAL, C_POSITION, C_HEALTH, C_TILEMAP, C_CLOCK, C_CHRONICLE,
} from '../components.ts';
import type { Special, Agent, Health, Position, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { makeEnterable, stepToward, wanderStep, buildOccupancy } from './movementUtil.ts';
import type { Enterable } from './movementUtil.ts';
import { SpatialGrid } from '../spatialGrid.ts';
import { combatantOf, rollAttack, markCombat } from '../combat.ts';
import type { Combatant } from '../combat.ts';
import { killAgent } from '../death.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { remember } from '../../ai/memory.ts';

const MAX_SPECIALS = 3;        // at most this many monsters roam at once (a rare, bounded threat)
const STRIKE_CHANCE = 0.55;    // per-tick chance an adjacent predator presses its attack (it is a monster — aggressive)
const RIPOSTE_CHANCE = 0.3;    // per-tick chance an adjacent folk lands a counter-blow — so it takes a MOB, not a lone soul, to fell a monster
const HAUNT_RADIUS = 2;        // how near a haunt must drift to unsettle a folk
const HAUNT_MOOD_DIP = 0.06;   // how much an eerie passing sours the mood

// A combatant built from a monster's own stats (it has no Body/culture/personality).
function specialCombatant(s: Special): Combatant {
  return { str: s.str, dex: s.dex, con: s.con, martial: 0.7, ferocity: s.ferocity, prowess: 0 };
}

// A random passable border tile — monsters come in from the wilds. Null if none found.
function edgeSpawn(cfg: SimConfig, enterable: Enterable, rng: RNG): Position | null {
  for (let tries = 0; tries < 24; tries++) {
    const along = Math.floor(rng() * (rng() < 0.5 ? cfg.gridWidth : cfg.gridHeight));
    const side = Math.floor(rng() * 4);
    const p = side === 0 ? { x: along, y: 0 }
      : side === 1 ? { x: along, y: cfg.gridHeight - 1 }
      : side === 2 ? { x: 0, y: along }
      : { x: cfg.gridWidth - 1, y: along };
    p.x = Math.min(cfg.gridWidth - 1, p.x); p.y = Math.min(cfg.gridHeight - 1, p.y);
    if (enterable(p.x, p.y)) return p;
  }
  return null;
}

export function runSpecialAgentSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const tick = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick;
  const tpy = ticksPerYear(cfg);

  const mapEnts = world.query(C_TILEMAP);
  const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
  const enterable = makeEnterable(cfg, map);
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0] ?? -1, C_CHRONICLE);

  let specials = world.query(C_SPECIAL, C_POSITION);

  // ── Spawn (daily, rare, capped) ── monsters drift in from the wilds.
  if (tick > 0 && tick % cfg.ticksPerDay === 0 && specials.length < MAX_SPECIALS && content.monsters.size > 0) {
    for (const m of content.monsters.all()) {
      if (rng() >= m.spawnChancePerDay) continue;
      const pos = edgeSpawn(cfg, enterable, rng);
      if (!pos) break;
      const e = world.createEntity();
      world.addComponent<Position>(e, C_POSITION, pos);
      world.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
      world.addComponent<Special>(e, C_SPECIAL, {
        kind: m.id, name: m.name, icon: m.icon, behavior: m.behavior,
        str: m.str, dex: m.dex, con: m.con, ferocity: m.ferocity,
        spawnTick: tick, despawnTick: tick + Math.round(m.despawnDays * cfg.ticksPerDay),
      });
      emitEvent(world, 'paranormal', `${capitalize(m.name)} appeared at the edge of the wilds.`, pos);
      if (ch) chronicleAdd(ch, {
        tick, importance: 0.6, kind: 'paranormal', text: `${capitalize(m.name)} was abroad in the land.`,
      }, cfg.chronicleImportanceThreshold);
      break;   // at most one new monster a day
    }
    specials = world.query(C_SPECIAL, C_POSITION);
  }
  if (specials.length === 0) return;

  // Folk indexed for adjacency + a spatial grid for nearest-search; occupancy for roaming.
  const folkAt = new Map<number, EntityId>();
  const folkGrid = new SpatialGrid(cfg.gridWidth, cfg.gridHeight);
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    folkAt.set(p.y * cfg.gridWidth + p.x, e);
    folkGrid.insert(p.x, p.y, e);
  }
  const occ = buildOccupancy(world, cfg.gridWidth, [C_AGENT, C_FAUNA, C_SPECIAL]);
  const OFF = [-1, 0, 1];

  for (const se of specials) {
    const s = world.getComponent<Special>(se, C_SPECIAL)!;
    const health = world.getComponent<Health>(se, C_HEALTH)!;
    const pos = world.getComponent<Position>(se, C_POSITION)!;

    // Already slain (health drained by folk last tick) or its time is up → it leaves.
    if (health.value <= 0) { world.destroyEntity(se); continue; }
    if (tick >= s.despawnTick) {
      world.destroyEntity(se);
      emitEvent(world, 'paranormal', `${capitalize(s.name)} melted back into the wilds.`, pos);
      continue;
    }

    if (s.behavior === 'haunt') {
      runHaunt(world, s, pos, folkGrid, tick, cfg);
      wanderStep(pos, rng, enterable, occ);
      continue;
    }

    // ── Predator: hunt the nearest folk; trade blows when adjacent ──
    const prey = folkGrid.nearest(pos.x, pos.y);
    if (!prey) { wanderStep(pos, rng, enterable, occ); continue; }
    const dist = Math.abs(prey.x - pos.x) + Math.abs(prey.y - pos.y);
    if (dist > 1) { stepToward(pos, prey.x, prey.y, rng, enterable, occ); continue; }

    // Adjacent: the monster strikes its target, then every adjacent folk strikes back.
    const atk = specialCombatant(s);
    if (rng() < STRIKE_CHANCE) {
      strikeFolk(world, s, atk, prey.id as EntityId, rng, tick, tpy, cfg, ch, folkAt);
    }

    // The folk fight back — but each only ripostes some ticks, so it takes a MOB (not a lone soul)
    // to bring a monster down. The folk who lands the killing blow becomes its slayer.
    for (const dy of OFF) for (const dx of OFF) {
      if (health.value <= 0) break;
      const f = folkAt.get((pos.y + dy) * cfg.gridWidth + (pos.x + dx));
      if (f === undefined || !world.hasComponent(f, C_AGENT)) continue;
      if (rng() >= RIPOSTE_CHANCE) continue;
      const back = rollAttack(combatantOf(world, f), atk, rng);
      if (back <= 0) continue;
      health.value = Math.max(0, health.value - back);
      if (health.value <= 0) { slaySpecial(world, se, s, f, pos, tick, cfg, ch); break; }
    }
  }
}

// A monster wounds (and sometimes kills) one folk — a heavy, legend-making death.
function strikeFolk(
  world: World, s: Special, atk: Combatant, folk: EntityId, rng: RNG,
  tick: number, tpy: number, cfg: SimConfig, ch: ChronicleData | undefined,
  folkAt: Map<number, EntityId>,
): void {
  if (!world.hasComponent(folk, C_AGENT)) return;
  const def = combatantOf(world, folk);
  const health = world.getComponent<Health>(folk, C_HEALTH)!;
  const agent = world.getComponent<Agent>(folk, C_AGENT)!;
  const fpos = world.getComponent<Position>(folk, C_POSITION)!;
  const dmg = rollAttack(atk, def, rng);
  if (dmg <= 0) return;
  health.value = Math.max(0, health.value - dmg);
  if (dmg >= cfg.combatScarThreshold) markCombat(world, folk, 1, 0);
  if (health.value <= 0) {
    folkAt.delete(fpos.y * cfg.gridWidth + fpos.x);
    const tomb = killAgent(world, folk, tick, `slain by ${s.name.toLowerCase()}`, tpy);
    emitEvent(world, 'death', `${tomb.name} was slain by ${s.name.toLowerCase()}.`, fpos);
    if (ch) chronicleAdd(ch, {
      tick, importance: 0.8, kind: 'death', text: `${tomb.name} was slain by ${s.name.toLowerCase()}.`,
    }, cfg.chronicleImportanceThreshold);
  } else {
    emitEvent(world, 'illness', `${agent.name} was wounded by ${s.name.toLowerCase()}.`, fpos);
  }
}

// A haunt drifts past: every folk nearby is unsettled (mood dip + an eerie memory), once a day.
function runHaunt(
  world: World, s: Special, pos: Position, folkGrid: SpatialGrid, tick: number, cfg: SimConfig,
): void {
  if (s.lastHauntTick !== undefined && tick - s.lastHauntTick < cfg.ticksPerDay) return;
  let unsettled = false;
  for (const near of folkGrid.within(pos.x, pos.y, HAUNT_RADIUS)) {
    const agent = world.getComponent<Agent>(near.id as EntityId, C_AGENT);
    if (!agent) continue;
    if (agent.mood !== undefined) agent.mood = Math.max(0, agent.mood - HAUNT_MOOD_DIP);
    remember(world, near.id as EntityId, tick, `was unsettled by ${s.name.toLowerCase()}`, 0.4);
    unsettled = true;
  }
  if (unsettled) {
    s.lastHauntTick = tick;
    emitEvent(world, 'paranormal', `Folk felt the eerie presence of ${s.name.toLowerCase()}.`, pos);
  }
}

// A folk slays the monster — a veteran is made, a vow is fulfilled, a legend is born.
function slaySpecial(
  world: World, se: EntityId, s: Special, slayer: EntityId, pos: Position,
  tick: number, cfg: SimConfig, ch: ChronicleData | undefined,
): void {
  markCombat(world, slayer, 0, 1);   // the killing blow → a kill on their record (QuestSystem reads this)
  world.destroyEntity(se);
  const name = world.getComponent<Agent>(slayer, C_AGENT)?.name ?? 'A brave soul';
  emitEvent(world, 'work', `${name} slew ${s.name.toLowerCase()}!`, pos);
  if (ch) chronicleAdd(ch, {
    tick, importance: 0.85, kind: 'paranormal', text: `${name} slew ${s.name.toLowerCase()} — a deed of legend.`,
  }, cfg.chronicleImportanceThreshold);
  remember(world, slayer, tick, `slew ${s.name.toLowerCase()} — a deed I will never forget`, 0.85);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
