// Conflict (M16 slice 2): crime & vice, alignment-driven. Once a day a wicked (low-`good`)
// or desperate (in-debt) agent may offend against a neighbour — **theft** (lift their gold)
// or, if wicked and aggressive, **assault** (the combat engine), which can become **murder**.
// Crime hardens the offender (alignment drifts darker) and makes them a known "outlaw"; the
// victim defends themselves and a good neighbour may mete out rough **justice** on the spot.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_ALIGNMENT, C_WALLET, C_POSITION, C_HEALTH, C_PERSONALITY, C_RELATIONSHIPS, C_CLOCK, C_CRIME, C_CHRONICLE,
} from '../components.ts';
import type {
  Agent, Alignment, Wallet, Position, Health, Personality, Relationships, Clock, Crime,
} from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears, ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import { earn } from '../economy.ts';
import { combatantOf, rollAttack, markCombat } from '../combat.ts';
import { killAgent } from '../death.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const OFF = [-1, 0, 1];
const AGGRESSIVE = new Set(['hot-headed', 'brave', 'ambitious']);

function markCrime(world: World, e: EntityId, kind: 'theft' | 'assault' | 'murder'): void {
  let c = world.getComponent<Crime>(e, C_CRIME);
  if (!c) { c = { thefts: 0, assaults: 0, murders: 0 }; world.addComponent<Crime>(e, C_CRIME, c); }
  if (kind === 'theft') c.thefts++; else if (kind === 'assault') c.assaults++; else c.murders++;
}
function harden(al: Alignment, d: number): void { al.good = Math.max(-1, al.good - d); }

export function runCrimeSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;
  const tick = clock.tick;
  const tpy = ticksPerYear(cfg);

  // Folk indexed by tile for adjacency.
  const folkAt = new Map<number, EntityId>();
  for (const e of world.query(C_AGENT, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    folkAt.set(p.y * cfg.gridWidth + p.x, e);
  }
  // The nearest folk within `r` tiles that the predicate accepts (a crime of opportunity
  // against someone in the vicinity, not strictly the next tile over).
  const nearby = (e: EntityId, r: number, accept: (id: EntityId) => boolean): EntityId | null => {
    const p = world.getComponent<Position>(e, C_POSITION);
    if (!p) return null;
    for (let ring = 1; ring <= r; ring++) {
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;   // only this ring's edge
        const f = folkAt.get((p.y + dy) * cfg.gridWidth + (p.x + dx));
        if (f !== undefined && f !== e && world.hasComponent(f, C_AGENT) && accept(f)) return f;
      }
    }
    return null;
  };
  const goodOf = (id: EntityId): number => world.getComponent<Alignment>(id, C_ALIGNMENT)?.good ?? 0;
  const rivalrise = (victim: EntityId, criminal: EntityId): void => {
    const rel = world.getComponent<Relationships>(victim, C_RELATIONSHIPS);
    if (!rel) return;
    const edge = rel.edges[criminal] ?? (rel.edges[criminal] = { type: 'rival', sentiment: 0 });
    edge.type = 'rival';
    edge.sentiment = Math.max(-1, edge.sentiment - 0.5);
  };

  for (const e of world.query(C_AGENT, C_ALIGNMENT, C_WALLET, C_POSITION)) {
    if (!world.hasComponent(e, C_AGENT)) continue;   // may have been killed earlier this pass
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;   // children don't offend
    const al = world.getComponent<Alignment>(e, C_ALIGNMENT)!;
    const wallet = world.getComponent<Wallet>(e, C_WALLET)!;
    const wicked = al.good < cfg.crimeAlignmentThreshold;
    const desperate = wallet.debt > 0 && al.good < 0.4;
    if (!wicked && !desperate) continue;
    if (rng() >= cfg.crimeChancePerDay * (wicked ? 2 : 1)) continue;

    const victim = nearby(e, 3, () => true);   // a mark somewhere in the vicinity
    if (victim === null) continue;
    const vName = world.getComponent<Agent>(victim, C_AGENT)!.name;
    const trait = world.getComponent<Personality>(e, C_PERSONALITY)?.trait;
    // Crime-site positions for on-map FX (captured now, before any killAgent strips them).
    const cpos = { ...world.getComponent<Position>(e, C_POSITION)! };
    const vp = world.getComponent<Position>(victim, C_POSITION)!;
    const vpos = { x: vp.x, y: vp.y };

    if (wicked && trait && AGGRESSIVE.has(trait)) {
      // ── Assault: a short brawl. The aggressor strikes; the victim defends each round. It
      //    ends in a beating (assault), a killing (murder), or the aggressor's own death. ──
      const vh = world.getComponent<Health>(victim, C_HEALTH)!;
      const ah = world.getComponent<Health>(e, C_HEALTH)!;
      let outcome: 'assault' | 'murder' | 'felled' = 'assault';
      rivalrise(victim, e);
      for (let round = 0; round < 3; round++) {
        const dmg = rollAttack(combatantOf(world, e), combatantOf(world, victim), rng);
        vh.value = Math.max(0, vh.value - dmg);
        if (dmg >= cfg.combatScarThreshold) markCombat(world, victim, 1, 0);
        if (vh.value <= 0) { outcome = 'murder'; break; }
        const back = rollAttack(combatantOf(world, victim), combatantOf(world, e), rng);
        ah.value = Math.max(0, ah.value - back);
        if (ah.value <= 0) { outcome = 'felled'; break; }
      }
      if (outcome === 'murder') {
        // The cause is a *fixed* category (the killer's name lives in the feed/legend) so the
        // cumulative cause-of-death histogram (WorldStats) keeps its small, bounded key-set.
        const tomb = killAgent(world, victim, tick, 'murdered', tpy, agent.name);
        markCrime(world, e, 'murder');
        harden(al, 0.08);
        emitEvent(world, 'crime', `${agent.name} murdered ${tomb.name}.`, vpos);
        const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
        if (ch) chronicleAdd(ch, { tick, importance: 0.82, kind: 'death', text: `${agent.name} murdered ${tomb.name}.` }, cfg.chronicleImportanceThreshold);
      } else {
        markCrime(world, e, 'assault');
        harden(al, 0.03);
        emitEvent(world, 'crime', `${agent.name} assaulted ${vName}.`, vpos);
        if (outcome === 'felled') {
          markCombat(world, victim, 0, 1);
          const tomb = killAgent(world, e, tick, 'killed while attacking', tpy, vName);   // fixed cause key
          emitEvent(world, 'crime', `${tomb.name} died attacking ${vName}.`, cpos);
        }
      }
    } else {
      // ── Theft ──
      const vw = world.getComponent<Wallet>(victim, C_WALLET)!;
      const loot = Math.min(vw.gold, cfg.theftAmount);
      if (loot <= 0) continue;
      vw.gold -= loot;
      earn(wallet, loot);
      markCrime(world, e, 'theft');
      harden(al, 0.02);
      rivalrise(victim, e);
      emitEvent(world, 'crime', `${agent.name} robbed ${vName} of ${loot.toFixed(0)} gold.`, vpos);
    }

    // ── Rough justice: a good neighbour confronts the criminal (if still standing) ──
    if (world.hasComponent(e, C_AGENT)) {
      const avenger = nearby(e, 2, (id) => id !== victim && goodOf(id) > 0.3);
      if (avenger !== null) {
        const blow = rollAttack(combatantOf(world, avenger), combatantOf(world, e), rng);
        const ah = world.getComponent<Health>(e, C_HEALTH);
        if (ah && blow > 0) {
          ah.value = Math.max(0, ah.value - blow);
          if (ah.value <= 0) {
            markCombat(world, avenger, 0, 1);
            const avengerName = world.getComponent<Agent>(avenger, C_AGENT)?.name;
            const tomb = killAgent(world, e, tick, 'struck down for their crimes', tpy, avengerName);
            emitEvent(world, 'crime', `${tomb.name} was struck down for their crimes.`, cpos);
          }
        }
      }
    }
  }
}
