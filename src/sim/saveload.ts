// Save / load (M9). The sim is perfectly deterministic, so a save needs only the
// reproducibility unit — the run's **config (incl. seed)** + **tick count** + the
// **recorded LLM responses** — and a load REPLAYS from there: recreate the world from
// the config and run it forward `savedAtTick` ticks with a `RecordedProvider`, which
// reproduces the exact state, soul and all. Replay is the correctness baseline (this
// file); a state snapshot for faster loads is a future optimization, not needed for
// correctness.
import { createSimulation } from './world.ts';
import type { Simulation } from './world.ts';
import { runTicks } from './loop.ts';
import { C_CLOCK, C_AIRECORD } from './components.ts';
import type { Clock, AIRecord, AIRecordEntry } from './components.ts';
import type { SimConfig } from './config.ts';
import type { Content } from '../content/loader.ts';
import { RecordedProvider } from '../ai/recording.ts';

export const SAVE_VERSION = 1;

export interface SaveGame {
  version: number;
  savedAtTick: number;      // how many ticks to replay to reach the saved state
  config: SimConfig;        // includes the seed — reproduces the run
  ai: AIRecordEntry[];      // recorded LLM responses, so the soul replays exactly too
}

// Capture the current run as a SaveGame (a pure read — does not touch the sim).
export function buildSave(sim: Simulation, cfg: SimConfig): SaveGame {
  const tick = sim.world.getComponent<Clock>(sim.clockEntity, C_CLOCK)!.tick;
  const recEnts = sim.world.query(C_AIRECORD);
  const ai = recEnts.length ? [...sim.world.getComponent<AIRecord>(recEnts[0], C_AIRECORD)!.entries] : [];
  return { version: SAVE_VERSION, savedAtTick: tick, config: cfg, ai };
}

// Reproduce a saved run: recreate from its config and replay to the saved tick. The
// returned simulation is byte-identical to the one that was saved — and continuable
// (its RNG is positioned exactly where it was), because replay re-derives everything.
export function loadSave(save: SaveGame, content: Content): Simulation {
  if (save.version !== SAVE_VERSION) {
    throw new Error(`save: unsupported version ${save.version} (expected ${SAVE_VERSION})`);
  }
  const sim = createSimulation(save.config, content);
  const provider = new RecordedProvider({ entries: save.ai });
  runTicks(sim.world, sim.rng, save.config, sim.clockEntity, content, save.savedAtTick, provider);
  return sim;
}

export function serializeSave(s: SaveGame): string {
  return JSON.stringify(s);
}

// Parse + validate a save, failing loud on a bad shape or unknown version.
export function parseSave(json: string): SaveGame {
  let raw: unknown;
  try { raw = JSON.parse(json); }
  catch (e) { throw new Error(`save: invalid JSON (${(e as Error).message})`); }
  if (!raw || typeof raw !== 'object') throw new Error('save: expected an object');
  const s = raw as Partial<SaveGame>;
  if (s.version !== SAVE_VERSION) throw new Error(`save: unsupported version ${s.version} (expected ${SAVE_VERSION})`);
  if (typeof s.savedAtTick !== 'number' || s.savedAtTick < 0) throw new Error('save: missing/invalid "savedAtTick"');
  if (!s.config || typeof (s.config as SimConfig).seed !== 'number') throw new Error('save: missing config / seed');
  if (!Array.isArray(s.ai)) throw new Error('save: missing "ai" record');
  return { version: s.version, savedAtTick: s.savedAtTick, config: s.config as SimConfig, ai: s.ai };
}
