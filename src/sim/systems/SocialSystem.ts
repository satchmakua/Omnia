// Relationships, the social need, and matchmaking. The social need decays and is
// restored by standing near others, which also warms sentiment into friendships.
// Marriage is handled by a separate matchmaking pass over all unattached adults
// (rather than relying on two wanderers happening to share a tile, which left the
// town slowly dying out): available adults pair off readily, so households keep
// forming generation after generation. Weddings are written to the Chronicle.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK, C_CHRONICLE, C_BODY, C_ALIGNMENT,
} from '../components.ts';
import type {
  Agent, Needs, Position, Relationships, RelationEdge, Lineage, Clock, Body, Alignment,
} from '../components.ts';
import { charismaWarmth, alignmentWarmth } from '../heredity.ts';
import { standingWarmth } from '../society.ts';
import { getReligionStore, faithFactor } from '../../religion/religionStore.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import type { RNG } from '../rng.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { remember } from '../../ai/memory.ts';
import { getCultureStore, getCulture, bondFactor, prefersEndogamy } from '../../culture/cultureStore.ts';
import type { CultureStoreData, RuntimeCulture } from '../../culture/cultureStore.ts';
import { intelligibility, langSynergy, learnTongue } from '../../lang/fluency.ts';
import { moodWarmth, MOOD_BASELINE } from './MoodSystem.ts';

// An agent's culture (D26 coupling), or undefined if they have none / no store yet.
function cultureOf(world: World, cstore: CultureStoreData | undefined, e: EntityId): RuntimeCulture | undefined {
  const cid = world.getComponent<Agent>(e, C_AGENT)!.cultureId;
  return cid && cstore ? getCulture(cstore, cid) : undefined;
}

const MAX_NEIGHBOURS = 6; // cap pairwise interactions per agent per tick
// The 8-neighbourhood + own tile: company comes from standing *near* someone, since
// collision (M6.5) now keeps two folk from sharing a tile.
const NEIGH: readonly [number, number][] = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function edge(rel: Relationships, other: EntityId): RelationEdge {
  let e = rel.edges[other];
  if (!e) { e = { type: 'friend', sentiment: 0 }; rel.edges[other] = e; }
  return e;
}

// Two agents are close kin if one is the other's parent/child or they share a parent.
function related(a: Lineage, b: Lineage, aId: EntityId, bId: EntityId): boolean {
  if (a.parents.includes(bId) || b.parents.includes(aId)) return true;
  return a.parents.some(p => b.parents.includes(p));
}

export function runSocialSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const decay = cfg.socialDecayPerDay / cfg.ticksPerDay;
  const marryChance = cfg.marryChancePerDay / cfg.ticksPerDay;

  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  const chronEnts = world.query(C_CHRONICLE);
  const chronicle = chronEnts.length ? world.getComponent<ChronicleData>(chronEnts[0], C_CHRONICLE) : undefined;
  const cstore = getCultureStore(world);   // for the culture→behaviour couplings (D26)

  // Decay everyone's social need and prune edges to the dead.
  const agents = world.query(C_AGENT, C_NEEDS, C_POSITION);
  for (const e of agents) {
    const needs = world.getComponent<Needs>(e, C_NEEDS)!;
    needs.social = Math.max(0, needs.social - decay);
    const rel = world.getComponent<Relationships>(e, C_RELATIONSHIPS);
    if (rel) {
      for (const k of Object.keys(rel.edges)) {
        if (!world.hasComponent(Number(k), C_AGENT)) delete rel.edges[Number(k)];
      }
    }
  }

  // Index agents by tile; neighbours (adjacent or same tile) interact (company +
  // friendship). Each unordered pair interacts once (only when at the smaller id).
  const byTile = new Map<number, EntityId[]>();
  for (const e of agents) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    const list = byTile.get(p.y * cfg.gridWidth + p.x);
    if (list) list.push(e); else byTile.set(p.y * cfg.gridWidth + p.x, [e]);
  }
  for (const e of agents) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    let met = 0;
    for (const [dx, dy] of NEIGH) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || nx >= cfg.gridWidth || ny < 0 || ny >= cfg.gridHeight) continue;
      const list = byTile.get(ny * cfg.gridWidth + nx);
      if (!list) continue;
      for (const o of list) {
        if (o <= e) continue;            // pair once, from the lower id
        interact(world, cfg, e, o, cstore, tick);
        if (++met >= MAX_NEIGHBOURS) break;
      }
      if (met >= MAX_NEIGHBOURS) break;
    }
  }

  matchmake(world, cfg, rng, marryChance, agents, tick, chronicle, cstore);
}

// Company restores the social need (met by anyone); repeated contact warms sentiment
// to friendship — but that warmth is damped two ways (D26): by how insular the pair is
// across cultures (the `open` axis, slice 2) AND by how well they can actually understand
// each other (language synergy, slice 4). Speakers of a shared tongue bond at full rate;
// strangers with no common tongue bond slowly, and meanwhile each LEARNS a little of the
// other's tongue — so mixed neighbours grow mutually intelligible over a life of contact.
// The moment a pair crosses into friendship is a remembered life event (M10 slice 3).
function interact(world: World, cfg: SimConfig, a: EntityId, b: EntityId, cstore: CultureStoreData | undefined, tick: number): void {
  const na = world.getComponent<Needs>(a, C_NEEDS)!;
  const nb = world.getComponent<Needs>(b, C_NEEDS)!;
  na.social = Math.min(1, na.social + cfg.socialGainPerInteract);
  nb.social = Math.min(1, nb.social + cfg.socialGainPerInteract);

  const ca = cultureOf(world, cstore, a);
  const cb = cultureOf(world, cstore, b);
  const agentA = world.getComponent<Agent>(a, C_AGENT)!;
  const agentB = world.getComponent<Agent>(b, C_AGENT)!;
  const bond = bondFactor(ca, cb);
  const synergy = langSynergy(intelligibility(agentA.fluency, agentB.fluency), cfg.langSynergyFloor);
  // Content folk warm to each other more readily; the lonely & miserable less so (D26).
  const mood = moodWarmth(agentA.mood ?? MOOD_BASELINE, agentB.mood ?? MOOD_BASELINE);
  // …and the charismatic befriend a touch faster (M13 — the first ability-score coupling).
  const bodyA = world.getComponent<Body>(a, C_BODY), bodyB = world.getComponent<Body>(b, C_BODY);
  const charisma = charismaWarmth(bodyA?.cha ?? 10.5, bodyB?.cha ?? 10.5);   // 10.5 ≈ avg ⇒ neutral
  // …and the good cooperate (M13): good pairs warm faster, the wicked slower (neutral ⇒ no-op).
  const alA = world.getComponent<Alignment>(a, C_ALIGNMENT), alB = world.getComponent<Alignment>(b, C_ALIGNMENT);
  const align = alignmentWarmth(alA?.good ?? 0, alB?.good ?? 0);
  // …and a shared faith warms bonds (M18, D26): co-religionists draw closer, scaled by how
  // devout the faith is; the differently-faithed are a touch cooler (neutral when unbelieving).
  const faith = faithFactor(getReligionStore(world), agentA.religionId, agentB.religionId);
  // …and the esteemed are sought out (M14 class/reputation): folk warm to the well-regarded.
  const standing = standingWarmth(agentA.standing ?? 0.5, agentB.standing ?? 0.5);
  const warm = cfg.sentimentGainPerInteract * bond * synergy * mood * charisma * align * faith * standing;

  const ea = edge(world.getComponent<Relationships>(a, C_RELATIONSHIPS)!, b);
  const eb = edge(world.getComponent<Relationships>(b, C_RELATIONSHIPS)!, a);
  const wasFriend = ea.type === 'partner' || ea.sentiment >= cfg.friendSentiment;  // already close?
  ea.sentiment = Math.min(1, ea.sentiment + warm);
  eb.sentiment = Math.min(1, eb.sentiment + warm);
  if (ea.type !== 'partner' && ea.sentiment >= cfg.friendSentiment) ea.type = 'friend';
  if (eb.type !== 'partner' && eb.sentiment >= cfg.friendSentiment) eb.type = 'friend';

  // Gradual learning: each picks up a little of the OTHER's native tongue through contact.
  if (agentA.fluency && cb) learnTongue(agentA.fluency, cb.language, cfg.langLearnPerInteract);
  if (agentB.fluency && ca) learnTongue(agentB.fluency, ca.language, cfg.langLearnPerInteract);

  if (!wasFriend && ea.type === 'friend' && ea.sentiment >= cfg.friendSentiment) {  // just became friends
    emitEvent(world, 'friendship', `${agentA.name} and ${agentB.name} became friends.`);
    remember(world, a, tick, `befriended ${agentB.name}`, 0.45);
    remember(world, b, tick, `befriended ${agentA.name}`, 0.45);
  }
}

// Pair up unattached adults (opposite sex, not close kin) so the town keeps
// forming households across the generations.
function matchmake(
  world: World, cfg: SimConfig, rng: RNG, marryChance: number,
  agents: EntityId[], tick: number, chronicle: ChronicleData | undefined,
  cstore: CultureStoreData | undefined,
): void {
  const males: EntityId[] = [];
  const females: EntityId[] = [];
  for (const e of agents) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    if (!lin || lin.partner !== null) continue;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;
    (agent.sex === 'male' ? males : females).push(e);
  }

  const taken = new Set<EntityId>();
  for (const m of males) {
    if (rng() >= marryChance) continue;
    const lm = world.getComponent<Lineage>(m, C_LINEAGE)!;
    const cm = cultureOf(world, cstore, m);
    // Traditional folk prefer a same-culture partner (endogamy, D26); fall back to
    // any eligible match if none of their own are available.
    const endogamous = prefersEndogamy(cm, rng());
    const eligible = (x: EntityId) =>
      !taken.has(x) && !related(lm, world.getComponent<Lineage>(x, C_LINEAGE)!, m, x);
    const f = (endogamous
      ? females.find(x => eligible(x) && cultureOf(world, cstore, x)?.id === cm?.id)
      : undefined) ?? females.find(eligible);
    if (f === undefined) continue;
    taken.add(m);
    taken.add(f);

    const lf = world.getComponent<Lineage>(f, C_LINEAGE)!;
    lm.partner = f;
    lf.partner = m;
    world.getComponent<Relationships>(m, C_RELATIONSHIPS)!.edges[f] = { type: 'partner', sentiment: 0.8 };
    world.getComponent<Relationships>(f, C_RELATIONSHIPS)!.edges[m] = { type: 'partner', sentiment: 0.8 };
    const mn = world.getComponent<Agent>(m, C_AGENT)!.name;
    const fn = world.getComponent<Agent>(f, C_AGENT)!.name;
    emitEvent(world, 'marriage', `${mn} and ${fn} were wed.`);
    remember(world, m, tick, `wed ${fn}`, 0.7);
    remember(world, f, tick, `wed ${mn}`, 0.7);
    if (chronicle) {
      chronicleAdd(chronicle, { tick, importance: 0.7, kind: 'marriage', text: `${mn} and ${fn} were wed.` }, cfg.chronicleImportanceThreshold);
    }
  }
}
