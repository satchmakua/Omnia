// Legendary artifacts (M20 s2): a master smith's masterwork — a crafted weapon or armour
// (M23) borne by a skilled maker — becomes a named, remembered item with a forging history.
// It stays with its maker until death, then is lost to history as a relic (set up for
// archaeology, later). The store is bounded; the oldest lost relics prune. Pure helpers.
import type { ArtifactsData, Artifact } from '../sim/components.ts';

export function createArtifacts(): ArtifactsData {
  return { artifacts: [] };
}

// The (un-lost) artifact a given agent bears, if any — so each maker has one signature work.
export function bearerArtifact(data: ArtifactsData, bearer: number): Artifact | undefined {
  return data.artifacts.find(a => a.bearer === bearer && !a.lost);
}

export function enshrineArtifact(data: ArtifactsData, a: Artifact): void {
  data.artifacts.push(a);
}

// Bound the store: once over `cap`, drop the oldest LOST relics (the borne ones are kept).
export function pruneArtifacts(data: ArtifactsData, cap: number): void {
  if (data.artifacts.length <= cap) return;
  const lost = data.artifacts
    .filter(a => a.lost)
    .sort((x, y) => (x.lostTick ?? 0) - (y.lostTick ?? 0));
  for (const a of lost) {
    if (data.artifacts.length <= cap) break;
    const i = data.artifacts.indexOf(a);
    if (i >= 0) data.artifacts.splice(i, 1);
  }
}
