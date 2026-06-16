// Deterministic, on-demand word & name generation from a seed language (M7 slice 1,
// CULTURE_AND_LANGUAGE.md). A word/name is a pure function of (language, key): the
// key is hashed to seed a *local* RNG stream, so the same key always yields the same
// word and we never store whole lexicons — forgotten words regenerate identically
// (D12). This consumes none of the simulation's RNG stream.
import { createRNG, rngChoice } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import { hashString } from '../ai/provider.ts';
import type { Language } from '../content/schema.ts';

function streamFor(lang: Language, key: string): RNG {
  return createRNG(hashString(`${lang.id}|${key}`) || 1);
}

// One syllable: fill a randomly-chosen shape, C → consonant, V → vowel.
function syllable(lang: Language, r: RNG): string {
  const shape = rngChoice(r, lang.syllableShapes);
  let s = '';
  for (const slot of shape) {
    s += slot === 'C' ? rngChoice(r, lang.phonemes.consonants) : rngChoice(r, lang.phonemes.vowels);
  }
  return s;
}

// Render a name pattern: every {syl} token becomes a fresh syllable; any other
// characters (e.g. "-") are kept as literals.
function render(lang: Language, r: RNG, pattern: string): string {
  return pattern.replace(/\{syl\}/g, () => syllable(lang, r));
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function personalName(lang: Language, key: string): string {
  const r = streamFor(lang, `p:${key}`);
  return capitalise(render(lang, r, rngChoice(r, lang.namePatterns.personal)));
}

export function familyName(lang: Language, key: string): string {
  const r = streamFor(lang, `f:${key}`);
  return capitalise(render(lang, r, rngChoice(r, lang.namePatterns.family)));
}

// A generic two-syllable lexeme (place-names, glosses, coined words later).
export function word(lang: Language, key: string): string {
  const r = streamFor(lang, `w:${key}`);
  return render(lang, r, '{syl}{syl}');
}
