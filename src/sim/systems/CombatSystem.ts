// Conflict (M16 slice 1): the threat model. A predator beside a folk may strike — an
// ability-score-driven exchange (combat.ts) that wounds (lowers Health), occasionally kills
// (the heavier, dramatic deaths that become legends), and leaves scars on the survivors. The
// folk fights back: a strong, brave one drives off or slays the beast and earns a kill (a
// veteran). Runs after movement/fauna so positions are final; uses 8-neighbour adjacency.
import type { World, EntityId } from '../ecs.ts';
import { C_FAUNA, C_AGENT, C_POSITION, C_HEALTH, C_CLOCK, C_CURSE } from '../components.ts';
import type { Fauna, Agent, Health, Position, Clock, Curse } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import { combatantOf, beastCombatant, rollAttack, markCombat } from '../combat.ts';
import { inflictWound, labelOf } from '../afflictions.ts';
import { killAgent } from '../death.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import { C_CHRONICLE } from '../components.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { getOrgStore, areAtWar } from '../../org/orgStore.ts';

export function runCombatSystem(world: World, cfg: SimConfig, rng: RNG): void {
  // Folk indexed by tile, for cheap adjacency lookup.
  const folkAt = new Map<number, EntityId>();
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    folkAt.set(p.y * cfg.gridWidth + p.x, e);
  }
  if (folkAt.size === 0) return;

  const clockEnts = world.query(C_CLOCK);
  if (clockEnts.length === 0) return;
  const tick = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick;
  const tpy = ticksPerYear(cfg);
  const OFF = [-1, 0, 1];

  const predators = world.query(C_FAUNA, C_POSITION).filter(
    e => world.getComponent<Fauna>(e, C_FAUNA)!.diet === 'predator',
  );
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
    // A maleficent mage's curse (M26 s2) saps the beast: it strikes less often & softer, so the
    // folk it menaces can cut it down. Expiry is swept by the MagicSystem.
    const curse = world.getComponent<Curse>(pe, C_CURSE);
    if (curse) { const k = 1 - curse.weaken; atk.str *= k; atk.dex *= k; atk.ferocity *= k; }
    const def = combatantOf(world, folk);
    const health = world.getComponent<Health>(folk, C_HEALTH)!;
    const agent = world.getComponent<Agent>(folk, C_AGENT)!;
    const fpos = world.getComponent<Position>(folk, C_POSITION)!;   // where the clash happens (for FX)

    // The beast strikes.
    const dmg = rollAttack(atk, def, rng);
    if (dmg > 0) {
      health.value = Math.max(0, health.value - dmg);
      if (dmg >= cfg.combatScarThreshold) markCombat(world, folk, 1, 0);
      if (health.value <= 0) {
        const tomb = killAgent(world, folk, tick, `slain by a ${beast.name.toLowerCase()}`, tpy);
        emitEvent(world, 'death', `${tomb.name} was slain by a ${beast.name.toLowerCase()}.`, fpos);
        const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
        if (ch) chronicleAdd(ch, {
          tick, importance: 0.72, kind: 'death',
          text: `${tomb.name} was slain by a ${beast.name.toLowerCase()}.`,
        }, cfg.chronicleImportanceThreshold);
        folkAt.delete(ppos.y * cfg.gridWidth + ppos.x); // (folk tile freed; harmless if mismatched)
        continue;
      }
      emitEvent(world, 'illness', `${agent.name} was mauled by a ${beast.name.toLowerCase()}.`, fpos);
      const injury = inflictWound(world, folk, tick, health.value, cfg.maimGrievousHealth, cfg.maimChance);   // surviving a mauling can cripple (M30)
      if (injury) emitEvent(world, 'illness', `${agent.name} survived, but was left with ${labelOf(injury)}.`, fpos);
    }

    // The folk fights back; a telling blow drives off (slays) the beast.
    const back = rollAttack(def, atk, rng);
    if (back >= cfg.combatKillBlow) {
      markCombat(world, folk, 0, 1);
      world.destroyEntity(pe);
      emitEvent(world, 'work', `${agent.name} fought off and slew a ${beast.name.toLowerCase()}.`, fpos);
    }
  }

  // ── War (M16 slice 3): members of warring tribes who meet come to blows ──
  const store = getOrgStore(world);
  if (!store || (store.wars?.length ?? 0) === 0) return;
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
  const fellInBattle = (victim: EntityId, slayer: EntityId): void => {
    const vpos = world.getComponent<Position>(victim, C_POSITION);   // capture before killAgent strips it
    const slayerName = world.getComponent<Agent>(slayer, C_AGENT)?.name;
    markCombat(world, slayer, 0, 1);
    const tomb = killAgent(world, victim, tick, 'fell in battle', tpy, slayerName);
    emitEvent(world, 'death', `${tomb.name} fell in battle.`, vpos ?? undefined);
    if (ch) chronicleAdd(ch, { tick, importance: 0.66, kind: 'war', text: `${tomb.name} fell in battle.` }, cfg.chronicleImportanceThreshold);
  };

  for (const e of world.query(C_AGENT, C_POSITION)) {
    if (!world.hasComponent(e, C_AGENT)) continue;   // may have already fallen as someone's foe this pass
    const aOrg = world.getComponent<Agent>(e, C_AGENT)!.orgId;
    if (!aOrg) continue;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    for (const dy of OFF) for (const dx of OFF) {
      if (dx === 0 && dy === 0) continue;
      const o = folkAt.get((p.y + dy) * cfg.gridWidth + (p.x + dx));
      if (o === undefined || o <= e || !world.hasComponent(o, C_AGENT)) continue;   // each pair once
      const bOrg = world.getComponent<Agent>(o, C_AGENT)!.orgId;
      if (!bOrg || bOrg === aOrg || !areAtWar(store, aOrg, bOrg)) continue;
      if (rng() >= cfg.battleChancePerTick) continue;

      // A clash: each lands a blow; either may fall.
      const ce = combatantOf(world, e), co = combatantOf(world, o);
      const ho = world.getComponent<Health>(o, C_HEALTH)!;
      const d1 = rollAttack(ce, co, rng);
      ho.value = Math.max(0, ho.value - d1);
      if (d1 >= cfg.combatScarThreshold) markCombat(world, o, 1, 0);
      if (ho.value <= 0) { fellInBattle(o, e); continue; }
      inflictWound(world, o, tick, ho.value, cfg.maimGrievousHealth, cfg.maimChance);   // a war wound can maim the survivor (M30)
      const he = world.getComponent<Health>(e, C_HEALTH)!;
      const d2 = rollAttack(co, ce, rng);
      he.value = Math.max(0, he.value - d2);
      if (d2 >= cfg.combatScarThreshold) markCombat(world, e, 1, 0);
      if (he.value <= 0) { fellInBattle(e, o); break; }   // e is gone — stop scanning its neighbours
      inflictWound(world, e, tick, he.value, cfg.maimGrievousHealth, cfg.maimChance);
    }
  }
}
