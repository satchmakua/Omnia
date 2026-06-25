// Conflict (M16 slice 1): the threat model. A predator beside a folk may strike — an
// ability-score-driven exchange (combat.ts) that wounds (lowers Health), occasionally kills
// (the heavier, dramatic deaths that become legends), and leaves scars on the survivors. The
// folk fights back: a strong, brave one drives off or slays the beast and earns a kill (a
// veteran). Runs after movement/fauna so positions are final; uses 8-neighbour adjacency.
import type { World, EntityId } from '../ecs.ts';
import { C_FAUNA, C_AGENT, C_POSITION, C_HEALTH, C_CLOCK } from '../components.ts';
import type { Fauna, Agent, Health, Position, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import { combatantOf, beastCombatant, rollAttack, markCombat } from '../combat.ts';
import { killAgent } from '../death.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import { C_CHRONICLE } from '../components.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { getOrgStore, areAtWar } from '../../org/orgStore.ts';

export function runCombatSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const predators = world.query(C_FAUNA, C_POSITION).filter(
    e => world.getComponent<Fauna>(e, C_FAUNA)!.diet === 'predator',
  );
  if (predators.length === 0) return;

  // Folk indexed by tile, for cheap adjacency lookup.
  const folkAt = new Map<number, EntityId>();
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    folkAt.set(p.y * cfg.gridWidth + p.x, e);
  }
  if (folkAt.size === 0) return;

  const tick = world.getComponent<Clock>(world.query(C_CLOCK)[0], C_CLOCK)!.tick;
  const tpy = ticksPerYear(cfg);
  const OFF = [-1, 0, 1];

  for (const pe of predators) {
    const ppos = world.getComponent<Position>(pe, C_POSITION)!;
    // Find an adjacent folk to menace.
    let folk: EntityId | null = null;
    for (const dy of OFF) for (const dx of OFF) {
      if (dx === 0 && dy === 0) continue;
      const f = folkAt.get((ppos.y + dy) * cfg.gridWidth + (ppos.x + dx));
      if (f !== undefined) { folk = f; break; }
    }
    if (folk === null) continue;
    if (rng() >= cfg.predatorAggressionChance) continue;   // most encounters pass peacefully

    const beast = world.getComponent<Fauna>(pe, C_FAUNA)!;
    const atk = beastCombatant(beast.size, true);
    const def = combatantOf(world, folk);
    const health = world.getComponent<Health>(folk, C_HEALTH)!;
    const agent = world.getComponent<Agent>(folk, C_AGENT)!;

    // The beast strikes.
    const dmg = rollAttack(atk, def, rng);
    if (dmg > 0) {
      health.value = Math.max(0, health.value - dmg);
      if (dmg >= cfg.combatScarThreshold) markCombat(world, folk, 1, 0);
      if (health.value <= 0) {
        const tomb = killAgent(world, folk, tick, `slain by a ${beast.name.toLowerCase()}`, tpy);
        emitEvent(world, 'death', `${tomb.name} was slain by a ${beast.name.toLowerCase()}.`);
        const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
        if (ch) chronicleAdd(ch, {
          tick, importance: 0.72, kind: 'death',
          text: `${tomb.name} was slain by a ${beast.name.toLowerCase()}.`,
        }, cfg.chronicleImportanceThreshold);
        folkAt.delete(ppos.y * cfg.gridWidth + ppos.x); // (folk tile freed; harmless if mismatched)
        continue;
      }
      emitEvent(world, 'illness', `${agent.name} was mauled by a ${beast.name.toLowerCase()}.`);
    }

    // The folk fights back; a telling blow drives off (slays) the beast.
    const back = rollAttack(def, atk, rng);
    if (back >= cfg.combatKillBlow) {
      markCombat(world, folk, 0, 1);
      world.destroyEntity(pe);
      emitEvent(world, 'work', `${agent.name} fought off and slew a ${beast.name.toLowerCase()}.`);
    }
  }
}
