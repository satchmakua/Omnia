// Feuds & vendettas (M29 s2) — where the rivalry edges of slice 1 finally *act*. Once a day:
//  • **Reconciliation** — every grudge cools a little toward neutral, so old quarrels fade unless
//    renewed; time heals.
//  • **Feud fights** — a soul nursing a deep grudge who crosses paths with that rival may come to
//    blows (the combat engine), purely over the rivalry — no wickedness required. A fight can wound
//    or kill; a killing makes the slain's kin loathe the killer, so the vendetta *widens* across the
//    family (DF-style). This + hereditary grudges (spawnAgent) lets blood feuds span generations.
// Deterministic: the feud roll only fires when a deep rival is actually within reach, so it draws
// little RNG; reconciliation draws none. Bounded & rare, so the town stays stable (soak-checked).
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_POSITION, C_HEALTH, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Agent, Position, Health, Relationships, Lineage, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears, ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import { combatantOf, rollAttack, markCombat } from '../combat.ts';
import { killAgent } from '../death.ts';
import { kinGrudge } from '../relationships.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const FEUD_THRESHOLD = -0.6;     // a grudge this bitter drives the aggrieved to confront their enemy
const LETHAL_THRESHOLD = -0.8;   // only the bitterest grudges (a slain kinsman) turn a brawl deadly
const FEUD_CHANCE = 0.13;        // per day, an aggrieved soul seeks out their enemy
const RECONCILE_PER_DAY = 0.006; // *minor* rivalries cool toward neutral over weeks; blood feuds do not fade
const CATHARSIS = 0.08;          // a (non-lethal) feud fight vents the grudge a little — a few bouts and it cools
const BRAWL_FLOOR = 0.2;         // a non-lethal scuffle leaves you bloodied but standing (no death)

export function runFeudSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;
  const tick = clock.tick;
  const tpy = ticksPerYear(cfg);
  const chEnts = world.query(C_CHRONICLE);
  const chronicle = chEnts.length ? world.getComponent<ChronicleData>(chEnts[0], C_CHRONICLE) : undefined;

  // ── Reconciliation: a *minor* grudge cools toward neutral over time (time heals). A true blood
  //    feud (≤ threshold) does NOT quietly fade — it ends in a confrontation, or is carried for life. ──
  for (const e of world.query(C_AGENT, C_RELATIONSHIPS)) {
    const rel = world.getComponent<Relationships>(e, C_RELATIONSHIPS)!;
    for (const k in rel.edges) {
      const ed = rel.edges[k];
      if (ed.type === 'rival' && ed.sentiment < 0 && ed.sentiment > FEUD_THRESHOLD) {
        ed.sentiment = Math.min(0, ed.sentiment + RECONCILE_PER_DAY);
      }
    }
  }

  // ── Feud fights: a soul nursing a blood grudge seeks out their enemy and settles it (they hunt the
  //    rival down — a vendetta isn't waiting for a chance encounter). ──
  const fought = new Set<EntityId>();
  for (const e of world.query(C_AGENT, C_POSITION, C_HEALTH, C_RELATIONSHIPS)) {
    if (fought.has(e) || !world.hasComponent(e, C_AGENT)) continue;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;   // children don't feud
    const rel = world.getComponent<Relationships>(e, C_RELATIONSHIPS)!;

    // A living blood-rival they haven't already fought today.
    let foe: EntityId | null = null, depth = 0;
    for (const k in rel.edges) {
      const ed = rel.edges[k];
      if (ed.type !== 'rival' || ed.sentiment > FEUD_THRESHOLD) continue;
      const id = Number(k);
      if (!fought.has(id) && world.hasComponent(id, C_AGENT) && world.hasComponent(id, C_HEALTH)) { foe = id; depth = ed.sentiment; break; }
    }
    if (foe === null) continue;
    if (rng() >= FEUD_CHANCE) continue;

    fought.add(e); fought.add(foe);
    // Most feuds are bloody brawls; only a true blood-vengeance (a slain kinsman) turns lethal.
    feudFight(world, cfg, rng, e, foe, tick, tpy, chronicle, depth <= LETHAL_THRESHOLD);
  }
}

// Vent a grudge a little after a bout (catharsis) — a few non-lethal confrontations and the blood
// feud finally cools below boiling. Keeps the edge's type & reason; only eases the sentiment.
function easeGrudge(world: World, viewer: EntityId, other: EntityId): void {
  const ed = world.getComponent<Relationships>(viewer, C_RELATIONSHIPS)?.edges[other];
  if (ed) ed.sentiment = Math.min(0, ed.sentiment + CATHARSIS);
}

// A confrontation between two rivals. Each round both strike. A `lethal` blood-vengeance can end in a
// killing (which widens the feud to the slain's kin); most feuds are bloody **brawls** that leave
// both bruised and scarred but standing — so a quarrelsome town doesn't bleed itself to death.
function feudFight(
  world: World, cfg: SimConfig, rng: RNG, a: EntityId, b: EntityId, tick: number, tpy: number,
  chronicle: ChronicleData | undefined, lethal: boolean,
): void {
  const ah = world.getComponent<Health>(a, C_HEALTH)!, bh = world.getComponent<Health>(b, C_HEALTH)!;
  const an = world.getComponent<Agent>(a, C_AGENT)!.name, bn = world.getComponent<Agent>(b, C_AGENT)!.name;
  const apos = { ...world.getComponent<Position>(a, C_POSITION)! };
  const floor = lethal ? 0 : BRAWL_FLOOR;   // a non-lethal scuffle won't drop a combatant below the floor
  let outcome: 'brawl' | 'slain_b' | 'slain_a' = 'brawl';

  for (let round = 0; round < 3; round++) {
    const d1 = rollAttack(combatantOf(world, a), combatantOf(world, b), rng);
    bh.value = Math.max(floor, bh.value - d1);
    if (d1 >= cfg.combatScarThreshold) markCombat(world, b, 1, 0);
    if (bh.value <= 0) { outcome = 'slain_b'; break; }
    const d2 = rollAttack(combatantOf(world, b), combatantOf(world, a), rng);
    ah.value = Math.max(floor, ah.value - d2);
    if (d2 >= cfg.combatScarThreshold) markCombat(world, a, 1, 0);
    if (ah.value <= 0) { outcome = 'slain_a'; break; }
  }

  if (outcome === 'brawl') {
    easeGrudge(world, a, b); easeGrudge(world, b, a);   // they had it out — the grudge cools a little
    emitEvent(world, 'crime', `${an} sought out ${bn}, and they came to blows over a grudge.`, apos);
    return;
  }
  const killer = outcome === 'slain_b' ? a : b;
  const slain = outcome === 'slain_b' ? b : a;
  const slainLin = world.getComponent<Lineage>(slain, C_LINEAGE);   // captured before killAgent strips it
  const kName = world.getComponent<Agent>(killer, C_AGENT)!.name;
  markCombat(world, killer, 0, 1);
  const tomb = killAgent(world, slain, tick, 'slain in a feud', tpy, kName);   // fixed cause key
  kinGrudge(world, slainLin, tomb.name, killer);   // a death widens the feud to the kin
  emitEvent(world, 'crime', `${kName} hunted down and slew ${tomb.name} in a blood feud.`, apos);
  if (chronicle) chronicleAdd(chronicle, { tick, importance: 0.8, kind: 'death', text: `${kName} slew ${tomb.name} in a blood feud.` }, cfg.chronicleImportanceThreshold);
}
