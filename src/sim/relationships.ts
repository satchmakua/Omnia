// Opinions with reasons (M29 slice 1). A relationship edge is an opinion (a typed link + a
// sentiment) plus the headline reason behind it. This helper sets/strengthens an edge and records
// *why* — so the social graph reads as a story ("loathes X — X murdered their kin"), not just a
// number. Pure data: it draws no RNG and nothing yet *acts* on rivalry (that's slice 2), so adding
// reasons & grudges leaves the trajectory unchanged.
import type { World, EntityId } from './ecs.ts';
import { C_RELATIONSHIPS, C_AGENT } from './components.ts';
import type { Relationships, RelationEdge, RelationType, Lineage } from './components.ts';

const clamp = (x: number): number => Math.max(-1, Math.min(1, x));

/**
 * Form or update an opinion of `other`: set its type, nudge its sentiment by `delta` (clamped to
 * [-1,1]), and record the `reason` (the latest significant cause wins). Creates the edge if absent.
 */
export function opine(
  rel: Relationships, other: EntityId, type: RelationType, delta: number, reason: string,
): RelationEdge {
  const edge = rel.edges[other] ?? (rel.edges[other] = { type, sentiment: 0 });
  edge.type = type;
  edge.sentiment = clamp(edge.sentiment + delta);
  edge.reason = reason;
  return edge;
}

// A killing makes a feud: the slain's living kin come to loathe the killer (M29 — the seed of a
// vendetta). The reason is labelled from the GRIEVING kin's side (the victim was their child /
// parent / partner). Shared by the CrimeSystem and the FeudSystem.
export function kinGrudge(world: World, vlin: Lineage | undefined, victimName: string, killer: EntityId): void {
  if (!vlin) return;
  const kin: [EntityId, string][] = [];
  if (vlin.partner != null) kin.push([vlin.partner, 'partner']);
  for (const p of vlin.parents) kin.push([p, 'child']);    // a bereaved parent lost their child
  for (const c of vlin.children) kin.push([c, 'parent']);  // a bereaved child lost their parent
  for (const [rel, label] of kin) {
    if (rel === killer) continue;
    const krel = world.getComponent<Relationships>(rel, C_RELATIONSHIPS);
    if (!krel || !world.hasComponent(rel, C_AGENT)) continue;
    // A kin-slaying is a **blood feud**: it OVERRIDES whatever came before (even a friendship) and
    // sets a deep grudge — so it actually reaches the feud threshold and the vendetta begins.
    const edge = krel.edges[killer] ?? (krel.edges[killer] = { type: 'rival', sentiment: 0 });
    edge.type = 'rival';
    edge.sentiment = Math.min(edge.sentiment, -0.85);
    edge.reason = `murdered their ${label} ${victimName}`;
  }
}

// Does `viewer` hold an active grudge against `other`? (a rival edge, or notably sour sentiment)
export function isRivalOf(world: World, viewer: EntityId, other: EntityId): boolean {
  const ed = world.getComponent<Relationships>(viewer, C_RELATIONSHIPS)?.edges[other];
  return !!ed && (ed.type === 'rival' || ed.sentiment < -0.2);
}
