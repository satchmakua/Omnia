// The evolution engine (M7 slice 3): on a generational schedule, languages drift by
// probabilistic **sound change** and cultures drift on their **value axes** (damped by
// cohesion). Procedural and deterministic (seeded RNG), off the hot path — exactly
// the tenability strategy in CULTURE_AND_LANGUAGE.md. Sound changes are recorded as
// legends so the player can *see* the tongues evolving (D27).
import type { World } from '../ecs.ts';
import { C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import { getCultureStore, driftValues } from '../../culture/cultureStore.ts';
import { getLanguageStore, applySoundChange } from '../../lang/languageStore.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

export function runEvolutionSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const cstore = getCultureStore(world);
  const lstore = getLanguageStore(world);
  if (!cstore || !lstore) return;

  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  if (tick - cstore.lastEvolveTick < cfg.evolutionIntervalDays * cfg.ticksPerDay) return;
  cstore.lastEvolveTick = tick;

  const chronEnts = world.query(C_CHRONICLE);
  const chronicle = chronEnts.length ? world.getComponent<ChronicleData>(chronEnts[0], C_CHRONICLE) : undefined;

  // Languages: a probabilistic sound change per tongue, recorded as a legend.
  for (const lang of Object.values(lstore.byId)) {
    if (rng() < lang.soundChangeRate) {
      const change = applySoundChange(lang, rng);
      if (change) {
        lstore.soundChanges += 1;
        emitEvent(world, 'culture', `The ${lang.name} tongue shifted: “${change.from}” → “${change.to}”.`);
        if (chronicle) {
          chronicleAdd(chronicle, {
            tick, importance: 0.7, kind: 'language',
            text: `The ${lang.name} tongue shifted: “${change.from}” became “${change.to}”.`,
          }, cfg.chronicleImportanceThreshold);
        }
      }
    }
  }

  // Cultures: a small random-walk drift per culture, damped by cohesion.
  for (const c of Object.values(cstore.byId)) {
    driftValues(c, cfg.valueDriftPerEra, rng);
  }
}
