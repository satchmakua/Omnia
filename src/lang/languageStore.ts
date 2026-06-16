// Runtime language store (M7 slice 3). Like cultures, languages become live, mutable
// shared objects so they can **drift** over the generations (sound change) — names of
// the later-born then sound subtly different from the founders'. Seeded (deep-cloned)
// from the authored tongues; daughter languages fork from these in slice 4.
import { C_LANGUAGESTORE } from '../sim/components.ts';
import type { World } from '../sim/ecs.ts';
import type { Content } from '../content/loader.ts';
import type { Language } from '../content/schema.ts';
import { rngChoice } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';

export interface LanguageStoreData {
  byId: Record<string, Language>;
  soundChanges: number;   // cumulative count, for metrics / legibility
}

export function createLanguageStore(content: Content): LanguageStoreData {
  const byId: Record<string, Language> = {};
  for (const l of content.languages.all()) {
    byId[l.id] = {
      ...l,
      phonemes: { consonants: [...l.phonemes.consonants], vowels: [...l.phonemes.vowels] },
      syllableShapes: [...l.syllableShapes],
      namePatterns: { personal: [...l.namePatterns.personal], family: [...l.namePatterns.family] },
    };
  }
  return { byId, soundChanges: 0 };
}

export function getLanguageStore(world: World): LanguageStoreData | undefined {
  const ents = world.query(C_LANGUAGESTORE);
  return ents.length ? world.getComponent<LanguageStoreData>(ents[0], C_LANGUAGESTORE) : undefined;
}

export function getLanguage(store: LanguageStoreData, id: string): Language | undefined {
  return store.byId[id];
}

// A small table of historically-plausible shifts (within a category): voicing,
// lenition, vowel raising/rounding. A sound change picks one phoneme in the
// inventory and systematically becomes its shifted form across the whole tongue.
export const SOUND_SHIFTS: Record<string, string> = {
  // consonants
  p: 'b', b: 'd', t: 'd', d: 't', k: 'g', g: 'k', v: 'f', f: 'p', s: 'z', z: 's',
  r: 'l', l: 'r', m: 'n', n: 'm', th: 't', kh: 'k', gr: 'g', dr: 'd', rk: 'k',
  // vowels
  a: 'o', o: 'u', u: 'a', i: 'e', e: 'i',
};

// Apply one sound change to a (runtime) language, mutating its inventory. Returns
// the change, or null if no phoneme has a defined shift. Deterministic via `rng`.
export function applySoundChange(lang: Language, rng: RNG): { from: string; to: string } | null {
  const cands: { p: string; to: string; key: 'consonants' | 'vowels' }[] = [];
  for (const p of lang.phonemes.consonants) {
    const to = SOUND_SHIFTS[p]; if (to && to !== p) cands.push({ p, to, key: 'consonants' });
  }
  for (const p of lang.phonemes.vowels) {
    const to = SOUND_SHIFTS[p]; if (to && to !== p) cands.push({ p, to, key: 'vowels' });
  }
  if (cands.length === 0) return null;

  const pick = rngChoice(rng, cands);
  const arr = lang.phonemes[pick.key];
  const idx = arr.indexOf(pick.p);
  if (idx >= 0) arr.splice(idx, 1);          // the old sound is gone…
  if (!arr.includes(pick.to)) arr.push(pick.to);  // …merged into / replaced by the new one
  return { from: pick.p, to: pick.to };
}
