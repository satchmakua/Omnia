// Cultural schism (M7 slice 4): once per era, a large, loosely-cohesive culture may
// fracture — a faction breaks away into a daughter culture that takes a diverging
// dialect with it (culture and language co-evolve, CULTURE_AND_LANGUAGE.md). Repeated
// over deep time this grows the culture/language **family trees**. Deterministic.
import { C_AGENT } from '../sim/components.ts';
import type { World, EntityId } from '../sim/ecs.ts';
import type { Agent } from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';
import type { RNG } from '../sim/rng.ts';
import { forkCulture } from './cultureStore.ts';
import type { CultureStoreData } from './cultureStore.ts';
import { forkLanguage } from '../lang/languageStore.ts';
import type { LanguageStoreData } from '../lang/languageStore.ts';

export interface SchismResult {
  parentCulture: string;
  daughterCulture: string;
  daughterLanguage: string;
  moved: number;
}

// At most one schism per call (keeps the event rare and legible). Returns the schism,
// or null if none fired.
export function maybeSchism(
  world: World, cstore: CultureStoreData, lstore: LanguageStoreData,
  cfg: SimConfig, rng: RNG, tick: number,
): SchismResult | null {
  // Living members per culture.
  const members = new Map<string, EntityId[]>();
  for (const e of world.query(C_AGENT)) {
    const a = world.getComponent<Agent>(e, C_AGENT)!;
    if (!a.cultureId) continue;
    const list = members.get(a.cultureId);
    if (list) list.push(e); else members.set(a.cultureId, [e]);
  }

  // Deterministic order: by culture id.
  for (const cid of Object.keys(cstore.byId).sort()) {
    const c = cstore.byId[cid];
    const list = members.get(cid);
    if (!list || list.length < cfg.minSchismMembers) continue;
    if (rng() >= cfg.schismChancePerEra * (1 - c.cohesion)) continue;

    const langId = forkLanguage(lstore, c.language, tick, rng);
    const langName = lstore.byId[langId].name;
    const daughterCid = forkCulture(cstore, cid, langId, langName, tick, cfg.schismValueNudge, rng);

    // The breakaway faction: the upper half by id (an arbitrary but deterministic split).
    const sorted = list.slice().sort((a, b) => a - b);
    let moved = 0;
    for (let i = Math.ceil(sorted.length / 2); i < sorted.length; i++) {
      world.getComponent<Agent>(sorted[i], C_AGENT)!.cultureId = daughterCid;
      moved++;
    }
    return { parentCulture: cid, daughterCulture: daughterCid, daughterLanguage: langId, moved };
  }
  return null;
}
