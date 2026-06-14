// Relationships, the social need, and matchmaking. The social need decays and is
// restored by standing near others, which also warms sentiment into friendships.
// Marriage is handled by a separate matchmaking pass over all unattached adults
// (rather than relying on two wanderers happening to share a tile, which left the
// town slowly dying out): available adults pair off readily, so households keep
// forming generation after generation. Weddings are written to the Chronicle.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_RELATIONSHIPS, C_LINEAGE, C_CLOCK, C_CHRONICLE,
} from '../components.ts';
import type {
  Agent, Needs, Position, Relationships, RelationEdge, Lineage, Clock,
} from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import type { RNG } from '../rng.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const MAX_TILE_GROUP = 6; // cap pairwise interactions per crowded tile

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

  // Group agents by tile; co-located agents interact (company + friendship).
  const byTile = new Map<number, EntityId[]>();
  for (const e of agents) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    const key = p.y * cfg.gridWidth + p.x;
    const list = byTile.get(key);
    if (list) list.push(e); else byTile.set(key, [e]);
  }
  for (const group of byTile.values()) {
    if (group.length < 2) continue;
    const n = Math.min(group.length, MAX_TILE_GROUP);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) interact(world, cfg, group[i], group[j]);
    }
  }

  matchmake(world, cfg, rng, marryChance, agents, tick, chronicle);
}

// Company restores the social need; repeated contact warms sentiment to friendship.
function interact(world: World, cfg: SimConfig, a: EntityId, b: EntityId): void {
  const na = world.getComponent<Needs>(a, C_NEEDS)!;
  const nb = world.getComponent<Needs>(b, C_NEEDS)!;
  na.social = Math.min(1, na.social + cfg.socialGainPerInteract);
  nb.social = Math.min(1, nb.social + cfg.socialGainPerInteract);

  const ea = edge(world.getComponent<Relationships>(a, C_RELATIONSHIPS)!, b);
  const eb = edge(world.getComponent<Relationships>(b, C_RELATIONSHIPS)!, a);
  ea.sentiment = Math.min(1, ea.sentiment + cfg.sentimentGainPerInteract);
  eb.sentiment = Math.min(1, eb.sentiment + cfg.sentimentGainPerInteract);
  if (ea.type !== 'partner' && ea.sentiment >= cfg.friendSentiment) ea.type = 'friend';
  if (eb.type !== 'partner' && eb.sentiment >= cfg.friendSentiment) eb.type = 'friend';
}

// Pair up unattached adults (opposite sex, not close kin) so the town keeps
// forming households across the generations.
function matchmake(
  world: World, cfg: SimConfig, rng: RNG, marryChance: number,
  agents: EntityId[], tick: number, chronicle: ChronicleData | undefined,
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
    const f = females.find(x => !taken.has(x) &&
      !related(lm, world.getComponent<Lineage>(x, C_LINEAGE)!, m, x));
    if (f === undefined) continue;
    taken.add(m);
    taken.add(f);

    const lf = world.getComponent<Lineage>(f, C_LINEAGE)!;
    lm.partner = f;
    lf.partner = m;
    world.getComponent<Relationships>(m, C_RELATIONSHIPS)!.edges[f] = { type: 'partner', sentiment: 0.8 };
    world.getComponent<Relationships>(f, C_RELATIONSHIPS)!.edges[m] = { type: 'partner', sentiment: 0.8 };
    if (chronicle) {
      const mn = world.getComponent<Agent>(m, C_AGENT)!.name;
      const fn = world.getComponent<Agent>(f, C_AGENT)!.name;
      chronicleAdd(chronicle, { tick, importance: 0.7, text: `${mn} and ${fn} were wed.` });
    }
  }
}
