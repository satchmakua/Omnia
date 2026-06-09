// Placeholder per-species name generator (M1). Builds names from a species'
// curated sound pools (onset + nucleus + coda per syllable). Deterministic:
// all randomness flows through the seeded RNG. Replaced by language-derived
// naming in M7.
import { rngInt, rngChoice } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import type { Species } from './schema.ts';

export function generateName(rng: RNG, species: Species): string {
  const s = species.nameSounds;
  const sylCount = rngInt(rng, s.syllables.min, s.syllables.max);

  let name = '';
  for (let i = 0; i < sylCount; i++) {
    name += rngChoice(rng, s.onsets);
    name += rngChoice(rng, s.nuclei);
    name += rngChoice(rng, s.codas);
  }

  // Capitalise the first letter.
  return name.charAt(0).toUpperCase() + name.slice(1);
}
