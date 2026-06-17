import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { createRNG } from '../src/sim/rng.ts';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT, C_CHRONICLE, C_EVENTLOG } from '../src/sim/components.ts';
import type { Agent } from '../src/sim/components.ts';
import { createLanguageStore, forkLanguage } from '../src/lang/languageStore.ts';
import { createCultureStore, forkCulture } from '../src/culture/cultureStore.ts';
import { compressLineages } from '../src/culture/lineage.ts';
import { createChronicle } from '../src/history/chronicle.ts';
import type { ChronicleData } from '../src/history/chronicle.ts';
import { createEventLog } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';
import { testContent } from './helpers.ts';

const content = testContent();

function worldWithCulture(cultureId: string, members: number): World {
  const w = new World();
  w.addComponent<EventLogData>(w.createEntity(), C_EVENTLOG, createEventLog());
  for (let i = 0; i < members; i++) {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, {
      name: 'A', action: 'wander', ticksAlive: 1, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9, cultureId,
    });
  }
  return w;
}

describe('compressLineages — the dead become descent records', () => {
  it('marks a daughter culture/tongue with no members extinct, and records it', () => {
    const cstore = createCultureStore(content);
    const lstore = createLanguageStore(content);
    // Fork a daughter that has no members in the world.
    const langId = forkLanguage(lstore, 'old_vant', 5000, createRNG(1));
    const cid = forkCulture(cstore, 'vant_kin', langId, lstore.byId[langId].name, 5000, 0.2, createRNG(1));

    // A world where vant_kin still lives but the daughter has nobody.
    const w = worldWithCulture('vant_kin', 5);
    const chron = createChronicle();
    compressLineages(w, cstore, lstore, defaultConfig, 9000, chron);

    expect(cstore.byId[cid].extinct).toBe(true);
    expect(cstore.byId[cid].diedTick).toBe(9000);
    expect(lstore.byId[langId].extinct).toBe(true);
    expect(cstore.byId.vant_kin.extinct).toBeFalsy();          // the living parent is untouched
    expect(chron.entries.some(e => /faded|lost/.test(e.text))).toBe(true);
  });

  it('keeps living lineages and prunes the oldest dead branches past the cap', () => {
    const cstore = createCultureStore(content);
    const lstore = createLanguageStore(content);
    // Spin up many dead daughter cultures/tongues (no members anywhere).
    for (let i = 0; i < 40; i++) {
      const lid = forkLanguage(lstore, 'old_vant', i, createRNG(i + 1));
      forkCulture(cstore, 'vant_kin', lid, lstore.byId[lid].name, i, 0.2, createRNG(i + 1));
    }
    const w = worldWithCulture('vant_kin', 5);   // only vant_kin is alive
    const cfg = { ...defaultConfig, maxLineages: 10 };
    compressLineages(w, cstore, lstore, cfg, 100000, undefined);

    expect(Object.keys(cstore.byId).length).toBeLessThanOrEqual(cfg.maxLineages);
    expect(Object.keys(lstore.byId).length).toBeLessThanOrEqual(cfg.maxLineages);
    expect(cstore.byId.vant_kin).toBeDefined();   // the living lineage survives the prune
    expect(lstore.byId.old_vant).toBeDefined();   // ...and its tongue (an ancestor)
  });
});
