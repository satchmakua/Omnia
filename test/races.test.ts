// The four base races (M21): human · dwarf · elf · halfling. Each is a content-defined
// species naming itself from a tongue that a seeded culture speaks — so the species →
// language → culture chain must resolve for every race, and the new folk must carry their
// intended flavour (elves long-lived & magical; halflings small & hardy).
import { describe, it, expect } from 'vitest';
import { testContent } from './helpers.ts';
import { createCultureStore, cultureForLanguage } from '../src/culture/cultureStore.ts';

const content = testContent();

describe('the four base races load (M21)', () => {
  it('provides human, dwarf, elf and halfling', () => {
    for (const id of ['human', 'dwarf', 'elf', 'halfling']) {
      expect(content.species.has(id)).toBe(true);
    }
  });

  it('elves are the longest-lived and most magical of the folk', () => {
    const elf = content.species.require('elf');
    const human = content.species.require('human');
    const dwarf = content.species.require('dwarf');
    expect(elf.lifespanYears.min).toBeGreaterThan(human.lifespanYears.max);   // far outlive humans
    expect(elf.magicAptitudeChance).toBeGreaterThan(human.magicAptitudeChance);
    expect(elf.magicAptitudeChance).toBeGreaterThan(dwarf.magicAptitudeChance);
    expect(elf.abilityMods.dex ?? 0).toBeGreaterThan(0);   // graceful
  });

  it('halflings are small, nimble and hardy', () => {
    const h = content.species.require('halfling');
    expect(h.size).toBe('small');
    expect((h.abilityMods.dex ?? 0)).toBeGreaterThan(0);
    expect((h.abilityMods.con ?? 0)).toBeGreaterThan(0);
    expect((h.abilityMods.str ?? 0)).toBeLessThan(0);
  });
});

describe('every race names itself from a tongue a culture speaks (M21)', () => {
  it('species → language → culture resolves for all four races', () => {
    const store = createCultureStore(content);
    for (const sp of content.species.all()) {
      expect(content.languages.has(sp.language), `${sp.id} → ${sp.language}`).toBe(true);
      const cid = cultureForLanguage(store, sp.language);
      expect(cid !== undefined, `no culture speaks ${sp.language} (for ${sp.id})`).toBe(true);
    }
  });

  it('the new tongues map to the new courts/hearths', () => {
    const store = createCultureStore(content);
    expect(cultureForLanguage(store, 'sylvaen')).toBe('sylvaen_courts');     // elves
    expect(cultureForLanguage(store, 'bergmund')).toBe('bergmund_hearths');  // halflings
  });
});
