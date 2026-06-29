// Opinions with reasons (M29 slice 1). A relationship edge is an opinion (a typed link + a
// sentiment) plus the headline reason behind it. This helper sets/strengthens an edge and records
// *why* — so the social graph reads as a story ("loathes X — X murdered their kin"), not just a
// number. Pure data: it draws no RNG and nothing yet *acts* on rivalry (that's slice 2), so adding
// reasons & grudges leaves the trajectory unchanged.
import type { EntityId } from './ecs.ts';
import type { Relationships, RelationEdge, RelationType } from './components.ts';

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
