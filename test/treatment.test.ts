// Treatment & recovery (M30 slice 2): herbal remedies are content; the infirmary tends the afflicted;
// a chronic illness is cured over time when the remedy's herb grows; permanent disabilities are
// carried for life. These tests pin the content boundary, the affliction model, and the system.
import { describe, it, expect } from 'vitest';
import { loadContent } from '../src/content/loader.ts';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_POSITION, C_AFFLICTIONS, C_CIVIC, C_CLOCK, C_FLORA, C_ORGSTORE, C_JOB, C_BUSINESS,
} from '../src/sim/components.ts';
import type { Agent, Position, Afflictions, Civic, Clock, Flora, AfflictionKind, Job, Business } from '../src/sim/components.ts';
import type { OrgStoreData } from '../src/org/orgStore.ts';
import {
  isPermanent, isTreatableKind, isAfflictionKind, cureAffliction, recoversUnderCare, addAffliction,
} from '../src/sim/afflictions.ts';
import { runTreatmentSystem } from '../src/sim/systems/TreatmentSystem.ts';
import { createSimulation } from '../src/sim/world.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const tpd = cfg.ticksPerDay;
const content = testContent();

// Minimal content fixtures for the loader-boundary cases (a remedy needs a real herb + species).
const SPECIES = `id: "elf"\nname: "Elf"\nlifespanYears: { min: 300, max: 500 }\nsize: "medium"\ncolor: "#88ff88"\nneeds: { hunger: 1.0, energy: 1.0 }\nlanguage: "old_vant"`;
const HERB = `id: "bruisewort"\nname: "Bruisewort"\ncolor: "#9a6fd0"\ngrowthPerDay: 0.7\nedibleAt: 0.55\nfoodYield: 0.55\nspreadChancePerDay: 0.1`;
const remedyYaml = (treats: string, herb = 'bruisewort') =>
  `id: "tonic"\nname: "Tonic"\nherb: "${herb}"\ntreats: "${treats}"\npotency: 0.2`;
const filesOf = (m: Record<string, string>) => new Map(Object.entries(m));

describe('herbal remedies are content (M30 s2)', () => {
  it('the real content loads the remedies, brewed from real herbs for treatable ills', () => {
    const all = content.remedies.all();
    expect(all.length).toBeGreaterThanOrEqual(1);
    for (const r of all) {
      expect(content.flora.has(r.herb)).toBe(true);            // brewed from a real herb
      expect(isTreatableKind(r.treats as AfflictionKind)).toBe(true);   // and it treats something curable
    }
    const poultice = content.remedies.get('bruisewort_poultice');
    expect(poultice?.herb).toBe('bruisewort');
    expect(poultice?.treats).toBe('chronic_illness');
  });

  it('the loader rejects a remedy for a permanent disability', () => {
    expect(() => loadContent(filesOf({ 'species/elf.yaml': SPECIES, 'flora/bruisewort.yaml': HERB, 'remedies/tonic.yaml': remedyYaml('maimed_leg') })))
      .toThrowError(/permanent disability/);
  });

  it('the loader rejects a remedy for an unknown affliction, or an unknown herb', () => {
    expect(() => loadContent(filesOf({ 'species/elf.yaml': SPECIES, 'flora/bruisewort.yaml': HERB, 'remedies/tonic.yaml': remedyYaml('hiccups') })))
      .toThrowError(/unknown affliction/);
    expect(() => loadContent(filesOf({ 'species/elf.yaml': SPECIES, 'flora/bruisewort.yaml': HERB, 'remedies/tonic.yaml': remedyYaml('chronic_illness', 'moonpetal') })))
      .toThrowError(/unknown herb/);
  });
});

describe('permanence & cure helpers (M30 s2)', () => {
  it('disabilities are permanent; a chronic illness is treatable', () => {
    expect(isPermanent('maimed_leg')).toBe(true);
    expect(isPermanent('lost_eye')).toBe(true);
    expect(isPermanent('infirmity')).toBe(true);
    expect(isTreatableKind('chronic_illness')).toBe(true);
    expect(isAfflictionKind('chronic_illness')).toBe(true);
    expect(isAfflictionKind('hiccups')).toBe(false);
  });

  it('cureAffliction removes the ailment and sheds the empty component', () => {
    const w = new World(); const e = w.createEntity();
    addAffliction(w, e, 'chronic_illness', 0);
    expect(cureAffliction(w, e, 'maimed_leg')).toBe(false);   // not carried
    expect(cureAffliction(w, e, 'chronic_illness')).toBe(true);
    expect(w.getComponent(e, C_AFFLICTIONS)).toBeUndefined(); // empty list → component shed
  });

  it('recovery is a deterministic per-day roll bounded by the chance', () => {
    expect(recoversUnderCare(7, 'chronic_illness', 3, 1)).toBe(true);    // certain
    expect(recoversUnderCare(7, 'chronic_illness', 3, 0)).toBe(false);   // never
    expect(recoversUnderCare(7, 'chronic_illness', 3, 0.2)).toBe(recoversUnderCare(7, 'chronic_illness', 3, 0.2)); // stable
    let cured = 0; for (let d = 0; d < 1000; d++) if (recoversUnderCare(7, 'chronic_illness', d, 0.2)) cured++;
    expect(cured).toBeGreaterThan(120); expect(cured).toBeLessThan(280);  // ~0.2 of days
  });
});

describe('the infirmary tends the afflicted (M30 s2)', () => {
  function world(opts: { herb?: boolean; near?: boolean } = {}): { w: World; sick: EntityId } {
    const { herb = true, near = true } = opts;
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
    // an infirmary at (10,10)
    const inf = w.createEntity();
    w.addComponent<Position>(inf, C_POSITION, { x: 10, y: 10 });
    w.addComponent<Civic>(inf, C_CIVIC, { kind: 'infirmary', name: 'Infirmary', effect: 'heal', radius: 5 });
    if (herb) {   // bruisewort growing somewhere → the poultice is available
      const f = w.createEntity();
      w.addComponent<Position>(f, C_POSITION, { x: 30, y: 30 });
      w.addComponent<Flora>(f, C_FLORA, { speciesId: 'bruisewort', name: 'Bruisewort', color: '#9a6fd0', maturity: 1, growthPerTick: 0, edibleAt: 0.55, foodYield: 0.55, spreadChancePerTick: 0 });
    }
    const sick = w.createEntity();
    w.addComponent<Position>(sick, C_POSITION, near ? { x: 11, y: 11 } : { x: 40, y: 40 });
    w.addComponent<Agent>(sick, C_AGENT, { name: 'Sick', action: 'wander', ticksAlive: 5000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    return { w, sick };
  }
  // Run `days` daily ticks; return the day the sick one was cured (or -1 if never).
  function daysToCure(w: World, sick: EntityId, days = 300): number {
    const clk = w.query(C_CLOCK)[0];
    for (let d = 1; d <= days; d++) {
      w.getComponent<Clock>(clk, C_CLOCK)!.tick = d * tpd;
      runTreatmentSystem(w, cfg, content);
      if (!w.getComponent<Afflictions>(sick, C_AFFLICTIONS)) return d;
    }
    return -1;
  }

  it('cures a chronic illness over time when tended and the herb grows', () => {
    const { w, sick } = world();
    addAffliction(w, sick, 'chronic_illness', 0);
    expect(daysToCure(w, sick)).toBeGreaterThan(0);   // healed within the window
  });

  it('never cures a permanent disability, however long they are tended', () => {
    const { w, sick } = world();
    addAffliction(w, sick, 'maimed_leg', 0);
    expect(daysToCure(w, sick)).toBe(-1);
    expect(w.getComponent<Afflictions>(sick, C_AFFLICTIONS)!.list[0].kind).toBe('maimed_leg');
  });

  it('cannot cure when no remedy herb grows in the world', () => {
    const { w, sick } = world({ herb: false });
    addAffliction(w, sick, 'chronic_illness', 0);
    expect(daysToCure(w, sick)).toBe(-1);
  });

  it('cannot cure one who never comes to the infirmary', () => {
    const { w, sick } = world({ near: false });
    addAffliction(w, sick, 'chronic_illness', 0);
    expect(daysToCure(w, sick)).toBe(-1);
  });

  it('is deterministic — the same world heals on the same day', () => {
    const a = world(); addAffliction(a.w, a.sick, 'chronic_illness', 0);
    const b = world(); addAffliction(b.w, b.sick, 'chronic_illness', 0);
    expect(daysToCure(a.w, a.sick)).toBe(daysToCure(b.w, b.sick));
  });
});

describe('a tribe that studies medicine heals surer (M30 s3 — the healer gains teeth)', () => {
  // A town of 40 chronically-ill folk tended at one infirmary; count how many are cured within `days`.
  function townCuredBy(medicine: number, days: number): number {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
    const inf = w.createEntity();
    w.addComponent<Position>(inf, C_POSITION, { x: 10, y: 10 });
    w.addComponent<Civic>(inf, C_CIVIC, { kind: 'infirmary', name: 'Infirmary', effect: 'heal', radius: 5 });
    const herb = w.createEntity();
    w.addComponent<Position>(herb, C_POSITION, { x: 30, y: 30 });
    w.addComponent<Flora>(herb, C_FLORA, { speciesId: 'bruisewort', name: 'Bruisewort', color: '#9a6fd0', maturity: 1, growthPerTick: 0, edibleAt: 0.55, foodYield: 0.55, spreadChancePerTick: 0 });
    if (medicine > 0) {
      w.addComponent<OrgStoreData>(w.createEntity(), C_ORGSTORE,
        { byId: { t1: { effects: { medicine } } }, created: 0, lastEvolveTick: 0, wars: [], warLog: [], everKnown: [], lost: [] } as unknown as OrgStoreData);
    }
    const sick: EntityId[] = [];
    for (let i = 0; i < 40; i++) {
      const e = w.createEntity();
      w.addComponent<Position>(e, C_POSITION, { x: 11, y: 11 });
      w.addComponent<Agent>(e, C_AGENT, { name: `S${e}`, action: 'wander', ticksAlive: 5000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9, orgId: 't1' });
      addAffliction(w, e, 'chronic_illness', 0);
      sick.push(e);
    }
    const clk = w.query(C_CLOCK)[0];
    for (let d = 1; d <= days; d++) { w.getComponent<Clock>(clk, C_CLOCK)!.tick = d * tpd; runTreatmentSystem(w, cfg, content); }
    return sick.filter(e => !w.getComponent(e, C_AFFLICTIONS)).length;
  }

  it('cures more of its sick within the same span than a town with no medicine', () => {
    expect(townCuredBy(8, 4)).toBeGreaterThan(townCuredBy(0, 4));
  });
});

describe('the healer profession heals the town surer (M30 backlog — working healers)', () => {
  // A town of 40 chronically-ill folk tended at one infirmary, staffed by `healers` working healers
  // (employed at a healer's house). Count how many are cured within `days`.
  function townCuredByHealers(healers: number, days: number): number {
    const w = new World();
    w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick: 0, day: 0, hour: 0, isDay: true });
    const inf = w.createEntity();
    w.addComponent<Position>(inf, C_POSITION, { x: 10, y: 10 });
    w.addComponent<Civic>(inf, C_CIVIC, { kind: 'infirmary', name: 'Infirmary', effect: 'heal', radius: 5 });
    const herb = w.createEntity();
    w.addComponent<Position>(herb, C_POSITION, { x: 30, y: 30 });
    w.addComponent<Flora>(herb, C_FLORA, { speciesId: 'bruisewort', name: 'Bruisewort', color: '#9a6fd0', maturity: 1, growthPerTick: 0, edibleAt: 0.55, foodYield: 0.55, spreadChancePerTick: 0 });
    if (healers > 0) {
      const house = w.createEntity();
      w.addComponent<Position>(house, C_POSITION, { x: 12, y: 12 });
      w.addComponent<Business>(house, C_BUSINESS, {
        professionId: 'healer', professionName: 'Healer', color: '#6fc6a8', balance: 1000,
        maxEmployees: 99, wagePerTick: 0.05, revenuePerWorkerPerTick: 0.06, requiresAptitude: false, gathers: null, tends: true,
      });
      for (let i = 0; i < healers; i++) {
        const h = w.createEntity();
        w.addComponent<Position>(h, C_POSITION, { x: 12, y: 12 });
        w.addComponent<Agent>(h, C_AGENT, { name: `H${h}`, action: 'work', ticksAlive: 9000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
        w.addComponent<Job>(h, C_JOB, { professionId: 'healer', professionName: 'Healer', employer: house, wagePerTick: 0.05, gathers: null });
      }
    }
    const sick: EntityId[] = [];
    for (let i = 0; i < 40; i++) {
      const e = w.createEntity();
      w.addComponent<Position>(e, C_POSITION, { x: 11, y: 11 });
      w.addComponent<Agent>(e, C_AGENT, { name: `S${e}`, action: 'wander', ticksAlive: 5000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
      addAffliction(w, e, 'chronic_illness', 0);
      sick.push(e);
    }
    const clk = w.query(C_CLOCK)[0];
    for (let d = 1; d <= days; d++) { w.getComponent<Clock>(clk, C_CLOCK)!.tick = d * tpd; runTreatmentSystem(w, cfg, content); }
    return sick.filter(e => !w.getComponent(e, C_AFFLICTIONS)).length;
  }

  it('a town staffed with working healers cures more of its sick than one with none', () => {
    expect(townCuredByHealers(5, 4)).toBeGreaterThan(townCuredByHealers(0, 4));
  });

  it('ships a Healer (tends) profession and seeds the town with at least one healer’s house', () => {
    const healer = content.professions.all().find(p => p.id === 'healer');
    expect(healer?.tends).toBe(true);
    const { world } = createSimulation({ ...cfg, seed: 3 }, content);
    const houses = world.query(C_BUSINESS).filter(e => world.getComponent<Business>(e, C_BUSINESS)!.tends).length;
    expect(houses).toBeGreaterThan(0);   // care is a livelihood — a healer's house stands
  });
});
