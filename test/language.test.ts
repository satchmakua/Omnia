import { describe, it, expect } from 'vitest';
import { personalName, familyName, word } from '../src/lang/language.ts';
import type { Language } from '../src/content/schema.ts';
import { testContent } from './helpers.ts';

const content = testContent();
const vant = content.languages.require('old_vant');
const drakhan = content.languages.require('drakhan');

// The characters a name may legitimately contain: every character of every phoneme,
// plus the literal (non-token) characters in the name patterns (e.g. "-").
function allowedChars(lang: Language): Set<string> {
  const set = new Set<string>();
  for (const p of [...lang.phonemes.consonants, ...lang.phonemes.vowels]) for (const c of p) set.add(c);
  for (const pat of [...lang.namePatterns.personal, ...lang.namePatterns.family]) {
    for (const c of pat.replace(/\{syl\}/g, '')) set.add(c);
  }
  return set;
}

function onlyUsesPhonemes(lang: Language, name: string): boolean {
  const allowed = allowedChars(lang);
  return [...name.toLowerCase()].every(c => allowed.has(c));
}

const sylvaen = content.languages.require('sylvaen');
const bergmund = content.languages.require('bergmund');
const urgakh = content.languages.require('urgakh');
const gnish = content.languages.require('gnish');

describe('seed languages load', () => {
  it('provides the authored tongues (the six base races — M21)', () => {
    for (const id of ['old_vant', 'drakhan', 'sylvaen', 'bergmund', 'urgakh', 'gnish']) {
      expect(content.languages.has(id), id).toBe(true);
    }
    expect(vant.phonemes.vowels.length).toBeGreaterThan(0);
  });
});

describe('the new tongues build valid, distinct names (M21)', () => {
  it('the four new tongues build names only from their own phonemes', () => {
    for (const lang of [sylvaen, bergmund, urgakh, gnish]) {
      for (let k = 0; k < 60; k++) {
        const p = personalName(lang, String(k)), f = familyName(lang, String(k));
        expect(onlyUsesPhonemes(lang, p), `${lang.id} personal "${p}"`).toBe(true);
        expect(onlyUsesPhonemes(lang, f), `${lang.id} family "${f}"`).toBe(true);
      }
    }
  });

  it('the four tongues sound distinct (Sylvaen is vowel-bright; Bergmund is consonant-heavy)', () => {
    const vowelRatio = (lang: Language) => {
      const vset = new Set(lang.phonemes.vowels.join(''));
      const names = Array.from({ length: 60 }, (_, k) => personalName(lang, String(k)).toLowerCase()).join('');
      const v = [...names].filter(c => vset.has(c)).length;
      return v / names.length;
    };
    // the romance/elven tongue is markedly more vowel-rich than the hearty German one
    expect(vowelRatio(sylvaen)).toBeGreaterThan(vowelRatio(bergmund));
  });
});

describe('language-derived naming', () => {
  it('is deterministic: same language + key → same name', () => {
    expect(personalName(vant, '42')).toBe(personalName(vant, '42'));
    expect(familyName(drakhan, 'house-7')).toBe(familyName(drakhan, 'house-7'));
    expect(word(vant, 'river')).toBe(word(vant, 'river'));
  });

  it('builds names only from the language’s own phonemes (and pattern literals)', () => {
    for (let k = 0; k < 60; k++) {
      const pv = personalName(vant, String(k));
      const fv = familyName(vant, String(k));
      const pd = personalName(drakhan, String(k));
      const fd = familyName(drakhan, String(k));
      expect(onlyUsesPhonemes(vant, pv), `vant personal "${pv}"`).toBe(true);
      expect(onlyUsesPhonemes(vant, fv), `vant family "${fv}"`).toBe(true);
      expect(onlyUsesPhonemes(drakhan, pd), `drakhan personal "${pd}"`).toBe(true);
      expect(onlyUsesPhonemes(drakhan, fd), `drakhan family "${fd}"`).toBe(true);
    }
  });

  it('names are non-empty and capitalised', () => {
    const n = personalName(vant, '3');
    expect(n.length).toBeGreaterThan(0);
    expect(n[0]).toBe(n[0].toUpperCase());
  });

  it('varies with the key (not one name for everyone)', () => {
    const names = new Set(Array.from({ length: 40 }, (_, k) => personalName(vant, String(k))));
    expect(names.size).toBeGreaterThan(10);
  });

  it('two tongues sound different (drakhan uses clusters/gutturals vant lacks)', () => {
    const drakhanNames = Array.from({ length: 40 }, (_, k) => personalName(drakhan, String(k)).toLowerCase());
    // 'z', 'th', 'kh', 'g', 'd' are in Drakhan but not Old Vant.
    expect(drakhanNames.some(n => /z|th|kh|g|d/.test(n))).toBe(true);
    const vantNames = Array.from({ length: 40 }, (_, k) => personalName(vant, String(k)).toLowerCase());
    expect(vantNames.every(n => !/z|kh|g|b/.test(n))).toBe(true); // none of Drakhan's signature sounds
  });
});
