// Legendary artifacts (M20 s2): the store helpers + the ArtifactSystem naming a master's
// crafted masterwork and losing it as a relic when the bearer dies.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_CLOCK, C_ARTIFACTS, C_CRAFTING, C_EQUIPMENT, C_COMBAT, C_ENCHANTMENT, C_CHRONICLE, C_LINEAGE } from '../src/sim/components.ts';
import type { Agent, Clock, Crafting, Equipment, Combat, ArtifactsData, Artifact, Enchantment, Lineage } from '../src/sim/components.ts';
import { createArtifacts, bearerArtifact, pruneArtifacts, enshrineArtifact } from '../src/history/artifacts.ts';
import { createChronicle, chronicleAdd } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { runArtifactSystem } from '../src/sim/systems/ArtifactSystem.ts';
import { MASTERWORK } from '../src/sim/quality.ts';

const cfg = defaultConfig;

describe('artifacts store (M20 s2)', () => {
  const mk = (id: string, bearer: number | null, lost = false, lostTick = 0): Artifact =>
    ({ id, name: id, kind: 'weapon', power: 3, bearer, forgedBy: 'x', forgedTick: 0, deeds: 'y', lost, lostTick });

  it('bearerArtifact finds an agent\'s un-lost work', () => {
    const d = createArtifacts();
    enshrineArtifact(d, mk('a', 7));
    enshrineArtifact(d, mk('b', 8, true));
    expect(bearerArtifact(d, 7)?.id).toBe('a');
    expect(bearerArtifact(d, 8)).toBeUndefined();   // lost ones don't count as borne
  });

  it('pruneArtifacts drops the oldest LOST relics, keeps the borne', () => {
    const d = createArtifacts();
    enshrineArtifact(d, mk('borne', 1));
    for (let i = 0; i < 5; i++) enshrineArtifact(d, mk(`lost${i}`, null, true, i));
    pruneArtifacts(d, 3);
    expect(d.artifacts.length).toBe(3);
    expect(d.artifacts.some(a => a.id === 'borne')).toBe(true);   // borne kept
    expect(d.artifacts.some(a => a.id === 'lost0')).toBe(false);  // oldest lost dropped
  });
});

// ── ArtifactSystem ──────────────────────────────────────────────────────────────
function artWorld(): { w: World; data: ArtifactsData } {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: cfg.ticksPerDay, day: 1, hour: 0, isDay: true });
  const data = createArtifacts();
  w.addComponent<ArtifactsData>(w.createEntity(), C_ARTIFACTS, data);
  return { w, data };
}
function smith(w: World, skill: number, weapon = 3, kills = 0): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: `Smith${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Crafting>(e, C_CRAFTING, { skill });
  w.addComponent<Equipment>(e, C_EQUIPMENT, { weapon, armour: 0 });
  if (kills > 0) w.addComponent<Combat>(e, C_COMBAT, { scars: 0, kills });
  return e;
}

describe('ArtifactSystem (M20 s2)', () => {
  it('a master crafter\'s borne masterwork becomes a named artifact (once)', () => {
    const { w, data } = artWorld();
    const e = smith(w, 3, 3, 9);
    runArtifactSystem(w, cfg);
    expect(data.artifacts.length).toBe(1);
    expect(data.artifacts[0].bearer).toBe(e);
    expect(data.artifacts[0].kind).toBe('weapon');
    expect(data.artifacts[0].deeds).toMatch(/9 foes slain/);

    runArtifactSystem(w, cfg);                 // a second day doesn't re-forge it
    expect(data.artifacts.length).toBe(1);
  });

  it('an apprentice (skill < 3) or an unarmed crafter forges no legend', () => {
    const { w, data } = artWorld();
    smith(w, 2, 3);                            // skilled enough? no — skill 2
    runArtifactSystem(w, cfg);
    expect(data.artifacts.length).toBe(0);
  });

  it('a relic is lost to history when its bearer dies', () => {
    const { w, data } = artWorld();
    const e = smith(w, 4, 3);
    runArtifactSystem(w, cfg);
    expect(data.artifacts[0].lost).toBeFalsy();
    w.removeComponent(e, C_AGENT);             // the smith dies
    runArtifactSystem(w, cfg);
    expect(data.artifacts[0].lost).toBe(true);
  });

  it("an artificer's enchanted gear becomes a named magic artifact, even on a non-smith (M26 s3)", () => {
    const { w, data } = artWorld();
    const e = w.createEntity();                // a plain warrior, NOT a master crafter
    w.addComponent<Agent>(e, C_AGENT, { name: 'Wieldor', action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Equipment>(e, C_EQUIPMENT, { weapon: 2, armour: 0 });
    w.addComponent<Enchantment>(e, C_ENCHANTMENT, { kind: 'weapon', bonus: 5, school: 'Artifice', by: 'Mage' });
    runArtifactSystem(w, cfg);
    expect(data.artifacts.length).toBe(1);
    expect(data.artifacts[0].enchanted).toBe('Mage');
    expect(data.artifacts[0].deeds).toMatch(/enchanted by Mage/);
    expect(data.artifacts[0].power).toBe(2 + 5);   // base weapon + enchantment bonus
  });
});

describe('heirlooms pass down a lineage (M33 s3)', () => {
  const person = (w: World): EntityId => {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: `P${e}`, action: 'wander', ticksAlive: 50000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    return e;
  };
  const lineage = (w: World, e: EntityId, children: EntityId[]): void =>
    w.addComponent<Lineage>(e, C_LINEAGE, { partner: null, parents: [], children, reproCooldownTicks: 0 });

  it('a borne relic passes to a living heir when its bearer dies — and is not lost', () => {
    const { w, data } = artWorld();
    const a = smith(w, 4, 3);
    runArtifactSystem(w, cfg);                  // forged & enshrined
    const b = person(w);
    lineage(w, a, [b]);
    runArtifactSystem(w, cfg);                  // a living bearer names their heir
    expect(data.artifacts[0].heir).toBe(b);
    w.removeComponent(a, C_AGENT);              // the bearer dies
    runArtifactSystem(w, cfg);
    expect(data.artifacts[0].bearer).toBe(b);
    expect(data.artifacts[0].generations).toBe(1);
    expect(data.artifacts[0].lost).toBeFalsy();
    expect(data.artifacts[0].deeds).toMatch(/^an heirloom/);
  });

  it('with no living heir, the relic is lost when its line ends', () => {
    const { w, data } = artWorld();
    const a = smith(w, 4, 3);
    runArtifactSystem(w, cfg);
    w.removeComponent(a, C_AGENT);              // dies childless
    runArtifactSystem(w, cfg);
    expect(data.artifacts[0].lost).toBe(true);
    expect(data.artifacts[0].generations ?? 0).toBe(0);
  });

  it('accrues a generation each time it passes down (A → B → C)', () => {
    const { w, data } = artWorld();
    const a = smith(w, 4, 3);
    runArtifactSystem(w, cfg);
    const b = person(w), c = person(w);
    lineage(w, a, [b]);
    runArtifactSystem(w, cfg);                  // heir = B
    w.removeComponent(a, C_AGENT); runArtifactSystem(w, cfg);   // → B (gen 1)
    lineage(w, b, [c]);
    runArtifactSystem(w, cfg);                  // heir = C
    w.removeComponent(b, C_AGENT); runArtifactSystem(w, cfg);   // → C (gen 2)
    expect(data.artifacts[0].bearer).toBe(c);
    expect(data.artifacts[0].generations).toBe(2);
  });
});

describe('masterwork engravings depict real history (M33 s2)', () => {
  const SCENE = 'The Korvu clan broke the Drass clan in war.';
  function chronWorld(): { w: World; data: ArtifactsData } {
    const { w, data } = artWorld();
    const ch: ChronicleData = createChronicle();
    chronicleAdd(ch, { tick: 0, importance: 0.85, kind: 'war', text: SCENE });
    chronicleAdd(ch, { tick: 0, importance: 0.5, kind: 'birth', text: 'A child was born.' });   // below the scene threshold — ignored
    w.addComponent<ChronicleData>(w.createEntity(), C_CHRONICLE, ch);
    return { w, data };
  }

  it("a smith who ripens to a masterwork has their work graven with a real Chronicle scene", () => {
    const { w, data } = chronWorld();
    const e = smith(w, 3, 3, 0);                 // skill 3 → enshrined (not yet a masterwork)
    runArtifactSystem(w, cfg);
    expect(data.artifacts.length).toBe(1);
    expect(data.artifacts[0].depicts).toBeUndefined();
    w.getComponent<Equipment>(e, C_EQUIPMENT)!.weaponQuality = MASTERWORK;   // the craft ripens
    runArtifactSystem(w, cfg);
    expect(data.artifacts[0].depicts).toBe('The Korvu clan broke the Drass clan in war');   // the scene, trailing '.' trimmed
    expect(data.artifacts[0].deeds).toMatch(/masterwork/);
  });

  it('a fine (non-masterwork) work is never engraved', () => {
    const { w, data } = chronWorld();
    const e = smith(w, 4, 3, 0);
    w.getComponent<Equipment>(e, C_EQUIPMENT)!.weaponQuality = 3;   // fine, not masterwork
    runArtifactSystem(w, cfg);
    runArtifactSystem(w, cfg);
    expect(data.artifacts[0].depicts).toBeUndefined();
  });

  it('the engraving is deterministic — the same world graves the same scene', () => {
    const build = (): string | undefined => {
      const { w, data } = chronWorld();
      const e = smith(w, 3, 3, 0);
      runArtifactSystem(w, cfg);
      w.getComponent<Equipment>(e, C_EQUIPMENT)!.weaponQuality = MASTERWORK;
      runArtifactSystem(w, cfg);
      return data.artifacts[0].depicts;
    };
    expect(build()).toBe(build());
    expect(build()).toBeDefined();
  });
});
