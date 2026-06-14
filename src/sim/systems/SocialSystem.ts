// Relationships and the social need. The social need decays over time; standing
// beside another agent restores it and warms the pair's sentiment. Warm-enough
// edges become friendships; adults who are fond enough and both unattached may
// wed. Marriages are written to the Chronicle.
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

  // Group agents by tile; co-located agents interact.
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
      for (let j = i + 1; j < n; j++) {
        interact(world, cfg, rng, group[i], group[j], marryChance, tick, chronicle);
      }
    }
  }
}

function interact(
  world: World, cfg: SimConfig, rng: RNG, a: EntityId, b: EntityId,
  marryChance: number, tick: number, chronicle: ChronicleData | undefined,
): void {
  const na = world.getComponent<Needs>(a, C_NEEDS)!;
  const nb = world.getComponent<Needs>(b, C_NEEDS)!;
  na.social = Math.min(1, na.social + cfg.socialGainPerInteract);
  nb.social = Math.min(1, nb.social + cfg.socialGainPerInteract);

  const ra = world.getComponent<Relationships>(a, C_RELATIONSHIPS)!;
  const rb = world.getComponent<Relationships>(b, C_RELATIONSHIPS)!;
  const ea = edge(ra, b);
  const eb = edge(rb, a);
  ea.sentiment = Math.min(1, ea.sentiment + cfg.sentimentGainPerInteract);
  eb.sentiment = Math.min(1, eb.sentiment + cfg.sentimentGainPerInteract);
  if (ea.type !== 'partner' && ea.sentiment >= cfg.friendSentiment) ea.type = 'friend';
  if (eb.type !== 'partner' && eb.sentiment >= cfg.friendSentiment) eb.type = 'friend';

  // Courtship → marriage: both adult, both unattached, fond enough.
  const aa = world.getComponent<Agent>(a, C_AGENT)!;
  const ab = world.getComponent<Agent>(b, C_AGENT)!;
  const la = world.getComponent<Lineage>(a, C_LINEAGE)!;
  const lb = world.getComponent<Lineage>(b, C_LINEAGE)!;
  const adults = ageInYears(aa.ticksAlive, cfg) >= cfg.adultAgeYears
              && ageInYears(ab.ticksAlive, cfg) >= cfg.adultAgeYears;
  if (
    adults && la.partner === null && lb.partner === null &&
    ea.sentiment >= cfg.marrySentiment && eb.sentiment >= cfg.marrySentiment &&
    rng() < marryChance
  ) {
    la.partner = b;
    lb.partner = a;
    ea.type = 'partner';
    eb.type = 'partner';
    if (chronicle) {
      chronicleAdd(chronicle, { tick, importance: 0.7, text: `${aa.name} and ${ab.name} were wed.` });
    }
  }
}
