// Emergent civic construction (M21): the town raises its functional buildings as it grows,
// rather than having them all at founding. Once a day, if the population has grown past a
// building's `minPopulation` and the town doesn't have one yet, it raises ONE (the most-needed
// first, by content order) — so a young hamlet earns its market, then an infirmary, a workshop,
// and finally a watch-house as it becomes a real town. Population-gated & deterministic (no RNG);
// placement is shared with world-gen (civicBuild.raiseCivic).
import type { World } from '../ecs.ts';
import { C_CIVIC, C_AGENT, C_POSITION, C_TILEMAP, C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Civic, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import type { TileMapData } from '../../world/tilemap.ts';
import { raiseCivic } from '../civicBuild.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

export function runCivicBuildSystem(world: World, cfg: SimConfig, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once a day

  const mapEnts = world.query(C_TILEMAP);
  if (!mapEnts.length) return;
  const map = world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP)!;

  const pop = world.query(C_AGENT).length;

  // What the town already has (by building kind).
  const have = new Set<string>();
  for (const e of world.query(C_CIVIC)) have.add(world.getComponent<Civic>(e, C_CIVIC)!.kind);

  // Raise the first building the town now warrants but lacks (one a day keeps it gradual).
  for (const b of content.buildings.all()) {
    if (b.minPopulation === 0 || b.minPopulation > pop || have.has(b.kind)) continue;
    if (raiseCivic(world, cfg, map, b) === null) continue;   // no room — try again another day
    emitEvent(world, 'work', `The town raised ${article(b.name)}.`);
    const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0] ?? -1, C_CHRONICLE);
    if (ch) chronicleAdd(ch, {
      tick: clock.tick, importance: 0.6, kind: 'founding', text: `The town raised ${article(b.name)}.`,
    }, cfg.chronicleImportanceThreshold);
    return;   // one a day
  }
}

// "an Infirmary" / "the Tavern" — leave a name that already has an article alone.
function article(name: string): string {
  if (/^(the|a|an)\s/i.test(name)) return name;
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}
