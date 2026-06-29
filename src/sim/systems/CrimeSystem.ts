// Conflict (M16 slice 2): crime & vice, alignment-driven. Once a day a wicked (low-`good`)
// or desperate (in-debt) agent may offend against a neighbour — **theft** (lift their gold)
// or, if wicked and aggressive, **assault** (the combat engine), which can become **murder**.
// Crime hardens the offender (alignment drifts darker) and makes them a known "outlaw"; the
// victim defends themselves and a good neighbour may mete out rough **justice** on the spot.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_ALIGNMENT, C_WALLET, C_POSITION, C_HEALTH, C_PERSONALITY, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK, C_CRIME, C_CHRONICLE,
} from '../components.ts';
import type {
  Agent, Alignment, Wallet, Position, Health, Personality, Relationships, Lineage, Clock, Crime,
} from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears, ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import { earn } from '../economy.ts';
import { opine } from '../relationships.ts';
import { lawCrimeFactor } from '../heredity.ts';
import { combatantOf, rollAttack, markCombat } from '../combat.ts';
import { killAgent } from '../death.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { wardFactor } from './CivicSystem.ts';

const OFF = [-1, 0, 1];
const AGGRESSIVE = new Set(['hot-headed', 'brave', 'ambitious']);

function markCrime(world: World, e: EntityId, kind: 'theft' | 'assault' | 'murder'): void {
  let c = world.getComponent<Crime>(e, C_CRIME);
  if (!c) { c = { thefts: 0, assaults: 0, murders: 0 }; world.addComponent<Crime>(e, C_CRIME, c); }
  if (kind === 'theft') c.thefts++; else if (kind === 'assault') c.assaults++; else c.murders++;
}
// Crime darkens the soul AND loosens it from order — repeat offenders drift toward Chaotic
// Evil over a criminal life (an emergent villain's arc, D26), not just darker on one axis.
function harden(al: Alignment, d: number): void {
  al.good = Math.max(-1, al.good - d);
  al.law = Math.max(-1, al.law - d * 0.5);
}

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
  // The wronged turn on the wrongdoer — a rival edge with the reason why (M29 s1).
  const rivalrise = (victim: EntityId, criminal: EntityId, reason: string): void => {
    const rel = world.getComponent<Relationships>(victim, C_RELATIONSHIPS);
    if (rel) opine(rel, criminal, 'rival', -0.5, reason);
  };
  // A murder makes a feud: the victim's living kin loathe the killer (the seed of M29 s2 vendettas).
  const kinGrudge = (vlin: Lineage | undefined, victimName: string, killer: EntityId): void => {
    if (!vlin) return;
    // Label the bond from the GRIEVING kin's side: the victim is their partner / child / parent.
    const kin: [EntityId, string][] = [];
    if (vlin.partner != null) kin.push([vlin.partner, 'partner']);
    for (const p of vlin.parents) kin.push([p, 'child']);    // a bereaved parent lost their child
    for (const c of vlin.children) kin.push([c, 'parent']);  // a bereaved child lost their parent
    for (const [k, rel] of kin) {
      if (k === killer) continue;
      const krel = world.getComponent<Relationships>(k, C_RELATIONSHIPS);
      if (krel && world.hasComponent(k, C_AGENT)) opine(krel, killer, 'rival', -0.7, `murdered their ${rel} ${victimName}`);
    }
  };

  for (const e of world.query(C_AGENT, C_ALIGNMENT, C_WALLET, C_POSITION)) {
    if (!world.hasComponent(e, C_AGENT)) continue;   // may have been killed earlier this pass
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;   // children don't offend
    const al = world.getComponent<Alignment>(e, C_ALIGNMENT)!;
    const wallet = world.getComponent<Wallet>(e, C_WALLET)!;
    const wicked = al.good < cfg.crimeAlignmentThreshold;
    const desperate = wallet.debt > 0 && al.good < 0.4;
    const enraged = agent.mentalState === 'anger';   // a rage loosens even an honest hand (M28 s2)
    if (!wicked && !desperate && !enraged) continue;
    // The lawful resist, the chaotic indulge (D26): law scales the offend chance. Under the eye
    // of a watch-house the wicked think twice (M21): `wardFactor` cuts the chance near the watch.
    // A mental rage sharply raises the odds (and can override a peaceable nature, below).
    const p0 = world.getComponent<Position>(e, C_POSITION)!;
    if (rng() >= cfg.crimeChancePerDay * (wicked ? 2 : 1) * (enraged ? 3 : 1) * lawCrimeFactor(al.law) * wardFactor(world, p0.x, p0.y)) continue;

    const victim = nearby(e, 3, () => true);   // a mark somewhere in the vicinity
    if (victim === null) continue;
    const vName = world.getComponent<Agent>(victim, C_AGENT)!.name;
    const trait = world.getComponent<Personality>(e, C_PERSONALITY)?.trait;
    // Crime-site positions for on-map FX (captured now, before any killAgent strips them).
    const cpos = { ...world.getComponent<Position>(e, C_POSITION)! };
    const vp = world.getComponent<Position>(victim, C_POSITION)!;
    const vpos = { x: vp.x, y: vp.y };

    if (enraged || (wicked && trait && AGGRESSIVE.has(trait))) {
      // ── Assault: a short brawl (a rage strikes out even without a wicked streak). The aggressor
      //    strikes; the victim defends each round. It
      //    ends in a beating (assault), a killing (murder), or the aggressor's own death. ──
      const vh = world.getComponent<Health>(victim, C_HEALTH)!;
      const ah = world.getComponent<Health>(e, C_HEALTH)!;
      let outcome: 'assault' | 'murder' | 'felled' = 'assault';
      rivalrise(victim, e, 'assaulted them');
      const vlin = world.getComponent<Lineage>(victim, C_LINEAGE);   // captured before any killAgent strips it
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
        kinGrudge(vlin, tomb.name, e);   // the victim's kin now loathe the killer (M29 s1 — a feud is born)
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
      rivalrise(victim, e, 'robbed them');
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
