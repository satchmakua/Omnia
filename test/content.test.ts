import { describe, it, expect } from 'vitest';
import { loadContent } from '../src/content/loader.ts';
import { loadContentFromDisk } from '../src/content/fsSource.ts';
import { Registry } from '../src/content/registry.ts';
import { SpeciesSchema } from '../src/content/schema.ts';

// A minimal valid species YAML, reused and mutated across the failure cases.
const VALID_SPECIES = `
id: "elf"
name: "Elf"
lifespanYears: { min: 300, max: 500 }
size: "medium"
color: "#88ff88"
needs: { hunger: 1.0, energy: 1.0 }
nameSounds:
  onsets: ["a", "e"]
  nuclei: ["i", "o"]
  codas: [""]
  syllables: { min: 2, max: 3 }
`;

const VALID_CAP = `
id: "kindle"
name: "Kindle"
tradition: "technology"
effects: ["restore_hunger"]
power: 0.2
`;

function files(map: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(map));
}

// ── Happy path ────────────────────────────────────────────────────────────────

describe('loadContent — valid content', () => {
  it('loads species and capabilities into registries', () => {
    const content = loadContent(files({
      'species/elf.yaml': VALID_SPECIES,
      'capabilities/kindle.yaml': VALID_CAP,
    }));
    expect(content.species.get('elf')?.name).toBe('Elf');
    expect(content.capabilities.get('kindle')?.power).toBe(0.2);
  });

  it('applies schema defaults (spawnWeight, tags, magicAptitudeChance)', () => {
    const content = loadContent(files({ 'species/elf.yaml': VALID_SPECIES }));
    const elf = content.species.require('elf');
    expect(elf.spawnWeight).toBe(1);
    expect(elf.tags).toEqual([]);
    expect(elf.magicAptitudeChance).toBe(0);
  });
});

// ── Fail loud, early, helpful (CONTENT_AND_DATA Rule 1) ───────────────────────

describe('loadContent — invalid content aborts with a clear message', () => {
  it('rejects an unknown field (typo) and names the file', () => {
    const broken = VALID_SPECIES.replace('size:', 'siez:');
    expect(() => loadContent(files({ 'species/elf.yaml': broken })))
      .toThrowError(/species\/elf\.yaml/);
  });

  it('rejects a missing required field', () => {
    const broken = VALID_SPECIES.replace(/name: "Elf"\n/, '');
    expect(() => loadContent(files({ 'species/elf.yaml': broken })))
      .toThrowError(/name/);
  });

  it('rejects a wrong-typed field', () => {
    const broken = VALID_SPECIES.replace('hunger: 1.0', 'hunger: "lots"');
    expect(() => loadContent(files({ 'species/elf.yaml': broken })))
      .toThrowError(/hunger/);
  });

  it('rejects a malformed colour', () => {
    const broken = VALID_SPECIES.replace('#88ff88', 'green');
    expect(() => loadContent(files({ 'species/elf.yaml': broken })))
      .toThrowError(/color/);
  });

  it('rejects unparseable YAML', () => {
    expect(() => loadContent(files({ 'species/elf.yaml': 'id: "x"\n  bad: : :' })))
      .toThrowError(/YAML parse error|species\/elf\.yaml/);
  });

  it('reports all problems at once', () => {
    const e = (() => {
      try {
        loadContent(files({
          'species/a.yaml': VALID_SPECIES.replace('size:', 'siez:'),
          'species/b.yaml': VALID_SPECIES.replace('id: "elf"', 'id: "b"').replace(/name: "Elf"\n/, ''),
        }));
      } catch (err) { return err as Error; }
      throw new Error('expected loadContent to throw');
    })();
    expect(e.message).toMatch(/2 problems/);
  });

  it('aborts when no species are defined', () => {
    expect(() => loadContent(files({ 'capabilities/kindle.yaml': VALID_CAP })))
      .toThrowError(/no species/);
  });

  it('rejects a YAML file in an unknown content folder', () => {
    expect(() => loadContent(files({
      'species/elf.yaml': VALID_SPECIES,
      'gadgets/widget.yaml': 'id: "w"',
    }))).toThrowError(/unknown content folder 'gadgets'/);
  });

  it('rejects duplicate ids across files', () => {
    expect(() => loadContent(files({
      'species/elf.yaml': VALID_SPECIES,
      'species/elf2.yaml': VALID_SPECIES, // same id "elf"
    }))).toThrowError(/Duplicate content id 'elf'/);
  });
});

// ── Biome spawn-table referential integrity ───────────────────────────────────

describe('biome spawn-table references', () => {
  const BIOME_WITH_FLORA = `
id: "meadow"
name: "Meadow"
climate: "temperate"
terrain: "plains"
color: "#33aa33"
flora:
  - { id: "ghost_weed", weight: 2 }
`;

  it('rejects a biome that references flora content which does not exist', () => {
    expect(() => loadContent(files({
      'species/elf.yaml': VALID_SPECIES,
      'biomes/meadow.yaml': BIOME_WITH_FLORA,   // ghost_weed is never defined
    }))).toThrowError(/unknown id 'ghost_weed'/);
  });
});

// ── Capability / effect-tag boundary ──────────────────────────────────────────

describe('effect-tag boundary', () => {
  it('rejects a capability whose effect tag has no code implementation', () => {
    const badCap = VALID_CAP.replace('restore_hunger', 'levitate_unimplemented');
    expect(() => loadContent(files({
      'species/elf.yaml': VALID_SPECIES,
      'capabilities/bad.yaml': badCap,
    }))).toThrowError(/levitate_unimplemented.*no implementation|no implementation.*levitate_unimplemented/);
  });
});

// ── Registry semantics ────────────────────────────────────────────────────────

describe('Registry', () => {
  it('require throws on a missing id', () => {
    const r = new Registry([{ id: 'a' }]);
    expect(() => r.require('zzz')).toThrowError(/not found/);
  });

  it('rejects duplicate ids', () => {
    expect(() => new Registry([{ id: 'dup' }, { id: 'dup' }])).toThrowError(/Duplicate/);
  });

  it('all() returns items sorted by id (deterministic)', () => {
    const r = new Registry([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
    expect(r.all().map(x => x.id)).toEqual(['a', 'b', 'c']);
  });
});

// ── The real authored content on disk must be valid ──────────────────────────

describe('authored /content', () => {
  it('loads without error and defines human + dwarf', () => {
    const content = loadContentFromDisk('./content');
    expect(content.species.has('human')).toBe(true);
    expect(content.species.has('dwarf')).toBe(true);
    expect(content.capabilities.has('forage')).toBe(true);
  });

  it('defines biomes including impassable water', () => {
    const content = loadContentFromDisk('./content');
    expect(content.biomes.size).toBeGreaterThanOrEqual(2);
    expect(content.biomes.has('ashen_plains')).toBe(true);
    expect(content.biomes.require('drowned_ruins').passable).toBe(false);
  });

  it('defines flora, fauna, and resources', () => {
    const content = loadContentFromDisk('./content');
    expect(content.flora.has('ash_grass')).toBe(true);
    expect(content.fauna.has('moth_grazer')).toBe(true);
    expect(content.resources.require('ore').renewable).toBe(false);
  });

  it('every biome spawn-table id resolves to real content', () => {
    const content = loadContentFromDisk('./content');
    for (const biome of content.biomes.all()) {
      for (const f of biome.flora)     expect(content.flora.has(f.id)).toBe(true);
      for (const f of biome.fauna)     expect(content.fauna.has(f.id)).toBe(true);
      for (const r of biome.resources) expect(content.resources.has(r.id)).toBe(true);
    }
  });

  it('species schema parses the on-disk human archetype', () => {
    const content = loadContentFromDisk('./content');
    const parsed = SpeciesSchema.safeParse({ ...content.species.require('human') });
    expect(parsed.success).toBe(true);
  });
});
