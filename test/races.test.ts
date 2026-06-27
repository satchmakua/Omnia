// The six base races (M21): human · dwarf · elf · halfling · orc · goblin. Each is a
// content-defined species naming itself from a tongue that a seeded culture speaks — so the
// species → language → culture chain must resolve for every race, and the new folk must carry
// their intended flavour (elves long-lived & magical; halflings small & hardy; orcs strong &
// fierce; goblins quick & frail).
import { describe, it, expect } from 'vitest';
import { testContent } from './helpers.ts';
import { createCultureStore, cultureForLanguage } from '../src/culture/cultureStore.ts';

const content = testContent();

describe('the six base races load (M21)', () => {
  it('provides human, dwarf, elf, halfling, orc and goblin', () => {
    for (const id of ['human', 'dwarf', 'elf', 'halfling', 'orc', 'goblin']) {
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

  it('orcs are big and strong; goblins are small and quick but frail', () => {
    const orc = content.species.require('orc');
    expect(orc.size).toBe('large');
    expect((orc.abilityMods.str ?? 0)).toBeGreaterThan(0);
    expect((orc.abilityMods.con ?? 0)).toBeGreaterThan(0);
    const gob = content.species.require('goblin');
    expect(gob.size).toBe('small');
    expect((gob.abilityMods.dex ?? 0)).toBeGreaterThan(0);
    expect((gob.abilityMods.con ?? 0)).toBeLessThan(0);   // frail
    expect(gob.lifespanYears.max).toBeLessThan(content.species.require('human').lifespanYears.min);  // short-lived
  });
});

describe('every race names itself from a tongue a culture speaks (M21)', () => {
  it('species → language → culture resolves for all six races', () => {
    const store = createCultureStore(content);
    for (const sp of content.species.all()) {
      expect(content.languages.has(sp.language), `${sp.id} → ${sp.language}`).toBe(true);
      const cid = cultureForLanguage(store, sp.language);
      expect(cid !== undefined, `no culture speaks ${sp.language} (for ${sp.id})`).toBe(true);
    }
  });

  it('the new tongues map to the new courts/hearths/bands', () => {
    const store = createCultureStore(content);
    expect(cultureForLanguage(store, 'sylvaen')).toBe('sylvaen_courts');     // elves
    expect(cultureForLanguage(store, 'bergmund')).toBe('bergmund_hearths');  // halflings
    expect(cultureForLanguage(store, 'urgakh')).toBe('urgakh_warbands');     // orcs
    expect(cultureForLanguage(store, 'gnish')).toBe('gnish_warrens');        // goblins
  });
});
