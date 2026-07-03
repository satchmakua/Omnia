// TEMP (delete after): do M18 s3 avatars actually manifest in a real run, and stay bounded (≤1)?
import { readFileSync } from 'node:fs';
import { createSimulation } from '../sim/world.ts';
import { tick } from '../sim/loop.ts';
import { loadSimConfig } from '../sim/configLoader.ts';
import { loadContentFromDisk } from '../content/fsSource.ts';
import { C_AGENT, C_SPECIAL } from '../sim/components.ts';
import type { Special, SimConfig } from '../sim/components.ts';
import { getReligionStore } from '../religion/religionStore.ts';

const base = loadSimConfig(readFileSync('config/simulation.yaml', 'utf8'));
const content = loadContentFromDisk('./content');
const SEEDS = [8, 3, 5, 11];
const TICKS = 40_000;

for (const seed of SEEDS) {
  const cfg = { ...base, seed } as SimConfig;
  const { world, rng, clockEntity } = createSimulation(cfg, content);
  const spawnTicks = new Set<number>();
  let maxAvatars = 0, maxFavor = 0;
  for (let t = 0; t < TICKS; t++) {
    tick(world, rng, cfg, clockEntity, content);
    const avs = world.query(C_SPECIAL).filter(e => world.getComponent<Special>(e, C_SPECIAL)!.behavior === 'avatar');
    maxAvatars = Math.max(maxAvatars, avs.length);
    for (const e of avs) spawnTicks.add(world.getComponent<Special>(e, C_SPECIAL)!.spawnTick);
    if ((t + 1) % 2000 === 0) {
      const store = getReligionStore(world);
      if (store) for (const r of Object.values(store.byId)) if (!r.extinct) maxFavor = Math.max(maxFavor, r.favor ?? 0);
    }
  }
  console.log(`seed ${seed}: avatarManifestations=${spawnTicks.size} maxConcurrent=${maxAvatars} maxFavor=${maxFavor.toFixed(2)} pop=${world.query(C_AGENT).length}`);
}
