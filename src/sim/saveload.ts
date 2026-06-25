// Save / load (M9 + M12). A save carries two things: the **reproducibility unit** (config
// + tick + recorded LLM responses, so a run can always be re-derived by replay — the
// correctness baseline, M9) AND, since M12, a **world snapshot** (the whole ECS world +
// RNG state) so a load is **instant** instead of replaying every tick. `loadSave` uses the
// snapshot when present, falling back to replay otherwise (and for old v1 saves).
import { World } from './ecs.ts';
import type { WorldData } from './ecs.ts';
import { createSimulation } from './world.ts';
import type { Simulation } from './world.ts';
import { runTicks } from './loop.ts';
import { createRNG } from './rng.ts';
import { C_CLOCK, C_AIRECORD, C_AIRUNNER } from './components.ts';
import type { Clock, AIRecord, AIRecordEntry } from './components.ts';
import type { SimConfig } from './config.ts';
import type { Content } from '../content/loader.ts';
import { RecordedProvider } from '../ai/recording.ts';

export const SAVE_VERSION = 2;   // v1 = replay-only; v2 adds the instant-load world snapshot

// The whole world as plain data + the RNG position, so a load can rebuild state directly.
export interface WorldSnapshot extends WorldData {
  rngState: number;
}

export interface SaveGame {
  version: number;
  savedAtTick: number;      // ticks to replay if loading via the replay fallback
  config: SimConfig;        // includes the seed — reproduces the run
  ai: AIRecordEntry[];      // recorded LLM responses (replay fallback; also in the snapshot)
  snapshot?: WorldSnapshot; // v2: the world + RNG, for an instant load
}

// Capture the current run (a pure read — does not touch the sim).
export function buildSave(sim: Simulation, cfg: SimConfig): SaveGame {
  const tick = sim.world.getComponent<Clock>(sim.clockEntity, C_CLOCK)!.tick;
  const recEnts = sim.world.query(C_AIRECORD);
  const ai = recEnts.length ? [...sim.world.getComponent<AIRecord>(recEnts[0], C_AIRECORD)!.entries] : [];
  // The AIRunner is a live-model runtime object (promises/queue) — not snapshottable; it is
  // recreated on demand after load. Everything else is plain data.
  const snapshot: WorldSnapshot = { ...sim.world.snapshot([C_AIRUNNER]), rngState: sim.rng.getState!() };
  return { version: SAVE_VERSION, savedAtTick: tick, config: cfg, ai, snapshot };
}

// Restore a saved run. With a snapshot (v2) it's instant — rebuild the world + RNG directly.
// Without one (v1, or a deliberate cross-check) it replays from the config to the saved tick.
export function loadSave(save: SaveGame, content: Content): Simulation {
  if (save.version !== 1 && save.version !== 2) {
    throw new Error(`save: unsupported version ${save.version} (expected 1 or 2)`);
  }
  if (save.snapshot) {
    const world = World.fromSnapshot(save.snapshot);
    const rng = createRNG(save.config.seed);
    rng.setState!(save.snapshot.rngState);
    const clockEntity = world.query(C_CLOCK)[0];
    return { world, rng, clockEntity, content };
  }
  // Replay fallback (the correctness baseline): recreate from config, run to the saved tick.
  const sim = createSimulation(save.config, content);
  const provider = new RecordedProvider({ entries: save.ai });
  runTicks(sim.world, sim.rng, save.config, sim.clockEntity, content, save.savedAtTick, provider);
  return sim;
}

// JSON (de)serialisation must survive the one typed array in the world — the TileMap's
// `biomeIndex` (a Uint16Array) — which JSON would otherwise mangle into {}. We tag it on
// the way out and rebuild it on the way in.
function replacer(_key: string, value: unknown): unknown {
  return value instanceof Uint16Array ? { __u16: Array.from(value) } : value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && Array.isArray((value as { __u16?: number[] }).__u16)) {
    return Uint16Array.from((value as { __u16: number[] }).__u16);
  }
  return value;
}

export function serializeSave(s: SaveGame): string {
  return JSON.stringify(s, replacer);
}

// Parse + validate a save, failing loud on a bad shape or unknown version.
export function parseSave(json: string): SaveGame {
  let raw: unknown;
  try { raw = JSON.parse(json, reviver); }
  catch (e) { throw new Error(`save: invalid JSON (${(e as Error).message})`); }
  if (!raw || typeof raw !== 'object') throw new Error('save: expected an object');
  const s = raw as Partial<SaveGame>;
  if (s.version !== 1 && s.version !== 2) throw new Error(`save: unsupported version ${s.version} (expected 1 or 2)`);
  if (typeof s.savedAtTick !== 'number' || s.savedAtTick < 0) throw new Error('save: missing/invalid "savedAtTick"');
  if (!s.config || typeof (s.config as SimConfig).seed !== 'number') throw new Error('save: missing config / seed');
  if (!Array.isArray(s.ai)) throw new Error('save: missing "ai" record');
  if (s.snapshot !== undefined) {
    const snap = s.snapshot as Partial<WorldSnapshot>;
    if (typeof snap.nextId !== 'number' || !Array.isArray(snap.alive) || !snap.components || typeof snap.rngState !== 'number') {
      throw new Error('save: malformed snapshot');
    }
  }
  return { version: s.version, savedAtTick: s.savedAtTick, config: s.config as SimConfig, ai: s.ai, snapshot: s.snapshot };
}
