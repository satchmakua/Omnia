// Magic in action (M17 s3, M26 s2): a mage practises a school (content/magic/*.yaml) and, when
// mana allows, casts its signature spell on a neighbour — so magic is *useful and visible* (D35):
// elementalists blast marauding beasts, restorers mend the wounded, conjurers feed the hungry,
// diviners hearten the low; and the M26 battle-mages **abjurers shield** an endangered ally and
// **maleficents curse** a beast so the folk can cut it down. Mastery grows over a life, unlocking
// stronger spells. Runs after movement/combat so positions are final. Mana (slow to regen)
// throttles it. This system is also the sole bounding authority for the temporary battle
// enchantments — it sweeps expired wards/curses each tick (even when no mages remain).
import type { World, EntityId } from '../ecs.ts';
import {
  C_MAGIC, C_POSITION, C_AGENT, C_FAUNA, C_HEALTH, C_NEEDS, C_CLOCK, C_WARD, C_CURSE,
} from '../components.ts';
import type { Magic, Position, Agent, Fauna, Health, Needs, Clock, Ward, Curse } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { schoolOf, topSpell } from '../../magic/schools.ts';
import { markCombat } from '../combat.ts';
import { emitEvent } from '../../history/eventlog.ts';

const MASTERY_MAX = 6;
const MASTERY_GROWTH_PER_DAY = 0.03;
const SPELL_COST = 22;
const WARD_DURATION = 80;     // ticks a ward shields its bearer (~1/3 day at 240/day)
const CURSE_DURATION = 80;    // ticks a curse saps its victim
const OFF = [-1, 0, 1];

export function runMagicSystem(world: World, cfg: SimConfig, _rng: unknown): void {
  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;

  // Sweep expired battle enchantments (M26 s2) — before the no-mages early return, so a ward/curse
  // laid by a mage who then died still lifts on schedule.
  for (const e of world.query(C_WARD)) {
    if (tick >= world.getComponent<Ward>(e, C_WARD)!.expiresTick) world.removeComponent(e, C_WARD);
  }
  for (const e of world.query(C_CURSE)) {
    if (tick >= world.getComponent<Curse>(e, C_CURSE)!.expiresTick) world.removeComponent(e, C_CURSE);
  }

  const mages = world.query(C_MAGIC, C_POSITION, C_AGENT);
  if (mages.length === 0) return;

  const dayBoundary = tick > 0 && tick % cfg.ticksPerDay === 0;

  // Index folk + predators by tile for cheap adjacency lookups.
  const folkAt = new Map<number, EntityId>();
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    folkAt.set(p.y * cfg.gridWidth + p.x, e);
  }
  const predatorAt = new Map<number, EntityId>();
  for (const e of world.query(C_FAUNA, C_POSITION)) {
    if (world.getComponent<Fauna>(e, C_FAUNA)!.diet !== 'predator') continue;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    predatorAt.set(p.y * cfg.gridWidth + p.x, e);
  }
  const neighbourKeys = function* (p: Position): Generator<number> {
    for (const dy of OFF) for (const dx of OFF) {
      if (dx === 0 && dy === 0) continue;
      yield (p.y + dy) * cfg.gridWidth + (p.x + dx);
    }
  };
  // Is this folk in immediate danger — a predator on one of its eight neighbours?
  const inDanger = (e: EntityId): boolean => {
    const p = world.getComponent<Position>(e, C_POSITION);
    if (!p) return false;
    for (const k of neighbourKeys(p)) if (predatorAt.has(k)) return true;
    return false;
  };

  for (const e of mages) {
    const magic = world.getComponent<Magic>(e, C_MAGIC)!;
    if (dayBoundary) magic.mastery = Math.min(MASTERY_MAX, (magic.mastery ?? 1) + MASTERY_GROWTH_PER_DAY);

    const school = schoolOf(magic.school);
    const spell = topSpell(magic.school, magic.mastery ?? 1);
    if (!school || !spell || (magic.mana ?? 0) < SPELL_COST) continue;
    const pos = world.getComponent<Position>(e, C_POSITION)!;
    const name = world.getComponent<Agent>(e, C_AGENT)!.name;
    const mastery = magic.mastery ?? 1;
    const m = 1 + mastery * 0.1;

    if (school.signature === 'bolt') {
      // Blast a marauding beast beside the mage — and earn the slaying (a battle-mage).
      for (const k of neighbourKeys(pos)) {
        const beast = predatorAt.get(k);
        if (beast !== undefined && world.hasComponent(beast, C_FAUNA)) {
          magic.mana -= SPELL_COST;
          markCombat(world, e, 0, 1);
          const bn = world.getComponent<Fauna>(beast, C_FAUNA)!.name.toLowerCase();
          world.destroyEntity(beast);
          emitEvent(world, 'magic', `${name} blasted a ${bn} with ${spell.name}.`, pos);
          break;
        }
      }
    } else if (school.signature === 'heal') {
      // Mend the most-wounded neighbour.
      let worst: EntityId | null = null, worstHp = 0.75;
      for (const k of neighbourKeys(pos)) {
        const f = folkAt.get(k);
        if (f === undefined || f === e) continue;
        const h = world.getComponent<Health>(f, C_HEALTH);
        if (h && h.value < worstHp) { worstHp = h.value; worst = f; }
      }
      if (worst !== null) {
        magic.mana -= SPELL_COST;
        const h = world.getComponent<Health>(worst, C_HEALTH)!;
        h.value = Math.min(1, h.value + 0.18 * m);
        emitEvent(world, 'magic', `${name} mended ${world.getComponent<Agent>(worst, C_AGENT)!.name}'s wounds with ${spell.name}.`, pos);
      }
    } else if (school.signature === 'inspire') {
      // Hearten a downcast neighbour.
      for (const k of neighbourKeys(pos)) {
        const f = folkAt.get(k);
        if (f === undefined || f === e) continue;
        const a = world.getComponent<Agent>(f, C_AGENT)!;
        if (a.mood !== undefined && a.mood < 0.6) {
          magic.mana -= SPELL_COST;
          a.mood = Math.min(1, a.mood + 0.12 * m);
          emitEvent(world, 'magic', `${name}'s ${spell.name} heartened ${a.name}.`, pos);
          break;
        }
      }
    } else if (school.signature === 'sustain') {
      // Conjure a meal for a hungry neighbour (the mage's own needs are met in CapabilitySystem).
      for (const k of neighbourKeys(pos)) {
        const f = folkAt.get(k);
        if (f === undefined || f === e) continue;
        const nd = world.getComponent<Needs>(f, C_NEEDS);
        if (nd && nd.hunger < cfg.actionThreshold) {
          magic.mana -= SPELL_COST;
          nd.hunger = Math.min(1, nd.hunger + 0.5);
          emitEvent(world, 'magic', `${name} conjured a meal for ${world.getComponent<Agent>(f, C_AGENT)!.name}.`, pos);
          break;
        }
      }
    } else if (school.signature === 'ward') {
      // Shield the neighbour in most danger (one beside a predator); failing that, the wounded.
      let target: EntityId | null = null, fallback: EntityId | null = null;
      for (const k of neighbourKeys(pos)) {
        const f = folkAt.get(k);
        if (f === undefined || f === e || world.hasComponent(f, C_WARD)) continue;
        if (inDanger(f)) { target = f; break; }
        if (fallback === null) {
          const h = world.getComponent<Health>(f, C_HEALTH);
          if (h && h.value < 0.6) fallback = f;
        }
      }
      const ally = target ?? fallback;
      if (ally !== null) {
        magic.mana -= SPELL_COST;
        world.addComponent<Ward>(ally, C_WARD, { soak: 2 + mastery, expiresTick: tick + WARD_DURATION });
        emitEvent(world, 'magic', `${name} shielded ${world.getComponent<Agent>(ally, C_AGENT)!.name} with ${spell.name}.`, pos);
      }
    } else if (school.signature === 'curse') {
      // Hex a marauding beast beside the mage so it strikes weaker — support, not the kill.
      for (const k of neighbourKeys(pos)) {
        const beast = predatorAt.get(k);
        if (beast !== undefined && world.hasComponent(beast, C_FAUNA) && !world.hasComponent(beast, C_CURSE)) {
          magic.mana -= SPELL_COST;
          const bn = world.getComponent<Fauna>(beast, C_FAUNA)!.name.toLowerCase();
          world.addComponent<Curse>(beast, C_CURSE, { weaken: Math.min(0.6, 0.2 + mastery * 0.06), expiresTick: tick + CURSE_DURATION });
          emitEvent(world, 'magic', `${name} hexed a ${bn} with ${spell.name}, sapping its strength.`, pos);
          break;
        }
      }
    }
  }
}
