// A grand scene drawn from the durable history (M33 s2), for a masterwork or a wonder to depict —
// the Chronicle's loudest legends (wars, foundings, conquests) + its compressed ages, generated, not
// authored. Deterministic (keyed by a caller-supplied numeric seed — no sim RNG), so depicting never
// perturbs the trajectory. Shared by the ArtifactSystem (engraved masterworks) and the WonderSystem
// (a wonder raised in memory of a great event). Trailing '.' trimmed for clean inlining.
import type { ChronicleData } from './chronicle.ts';

const SCENE_IMPORTANCE = 0.78;   // only the loudest legends are worth graving into stone

export function hash32(n: number): number {
  let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}

export function depictableScene(ch: ChronicleData | undefined, seed: number): string | undefined {
  if (!ch) return undefined;
  const scenes: string[] = [];
  for (const era of ch.eras) scenes.push(era.text);
  for (const en of ch.entries) if (en.importance >= SCENE_IMPORTANCE) scenes.push(en.text);
  if (!scenes.length) return undefined;
  return scenes[hash32(seed) % scenes.length].replace(/\.\s*$/, '');
}
