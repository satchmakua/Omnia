// TEMP diagnostic — does summon/ward/curse fire in the FULL tick loop? (deleted after)
import { readFileSync } from 'node:fs';
import { createSimulation } from './src/sim/world.ts';
import { tick } from './src/sim/loop.ts';
import { loadSimConfig } from './src/sim/configLoader.ts';
import { loadContentFromDisk } from './src/content/fsSource.ts';
import {
  C_AGENT, C_POSITION, C_MAGIC, C_HEALTH, C_FAUNA, C_WARD, C_CURSE, C_SPECIAL, C_TILEMAP,
} from './src/sim/components.ts';
import type { Magic, Position, Special, Fauna } from './src/sim/components.ts';

const content = loadContentFromDisk('./content');
const cfg = { ...loadSimConfig(readFileSync('./config/simulation.yaml', 'utf8')), seed: 8 };

// ── A: 5 forced summoners in a real town, full loop 3000 ticks ──
{
  const { world, rng, clockEntity } = createSimulation(cfg, content);
  const agents = world.query(C_AGENT).slice(0, 5);
  for (const e of agents) world.addComponent<Magic>(e, C_MAGIC, { mana: 100, maxMana: 100, manaRegenPerTick: 0.05, school: 'summoning', mastery: 5 });
  let maxGuard = 0, everGuard = false;
  for (let t = 0; t < 3000; t++) {
    tick(world, rng, cfg, clockEntity, content);
    let g = 0;
    for (const e of world.query(C_SPECIAL)) if (world.getComponent<Special>(e, C_SPECIAL)!.behavior === 'guardian') g++;
    maxGuard = Math.max(maxGuard, g); everGuard ||= g > 0;
  }
  const livingSummoners = world.query(C_AGENT, C_MAGIC).filter(e => world.getComponent<Magic>(e, C_MAGIC)!.school === 'summoning').length;
  console.log(`A) 5 forced summoners → maxGuardians=${maxGuard}, everSummoned=${everGuard}, livingSummoners@end=${livingSummoners}  ${everGuard ? 'OK summon fires in full loop' : 'BUG: summon never fired'}`);
}

// ── B: an abjurer beside a wounded folk, one MagicSystem tick via the full loop ──
{
  const { world, rng, clockEntity } = createSimulation(cfg, content);
  // find an abjurer candidate: take an agent, make it an abjurer; wound its nearest neighbour
  const all = world.query(C_AGENT, C_POSITION);
  const mage = all[0];
  world.addComponent<Magic>(world.query(C_AGENT)[0], C_MAGIC, { mana: 100, maxMana: 100, manaRegenPerTick: 0.05, school: 'abjuration', mastery: 5 });
  const mp = world.getComponent<Position>(mage, C_POSITION)!;
  // wound any folk within 1 tile of the mage
  let woundedNeighbour = false;
  for (const e of all) {
    if (e === mage) continue;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    if (Math.abs(p.x - mp.x) <= 1 && Math.abs(p.y - mp.y) <= 1) {
      const h = world.getComponent<{ value: number; ill: boolean }>(e, C_HEALTH);
      if (h) { h.value = 0.3; woundedNeighbour = true; }
    }
  }
  let everWard = false;
  for (let t = 0; t < 50; t++) { tick(world, rng, cfg, clockEntity, content); if (world.query(C_WARD).length > 0) { everWard = true; break; } }
  console.log(`B) abjurer + wounded neighbour(${woundedNeighbour}) → everWarded=${everWard}  ${everWard ? 'OK ward fires' : '(no ward — neighbour may have moved/healed)'}`);
}

// ── C: a maleficent mage beside a predator ──
{
  const { world, rng, clockEntity } = createSimulation(cfg, content);
  const mage = world.query(C_AGENT, C_POSITION)[0];
  world.addComponent<Magic>(mage, C_MAGIC, { mana: 100, maxMana: 100, manaRegenPerTick: 0.05, school: 'maleficence', mastery: 5 });
  const mp = world.getComponent<Position>(mage, C_POSITION)!;
  // teleport a predator adjacent to the mage
  const pred = world.query(C_FAUNA, C_POSITION).find(e => world.getComponent<Fauna>(e, C_FAUNA)!.diet === 'predator');
  let placed = false;
  if (pred) { const pp = world.getComponent<Position>(pred, C_POSITION)!; pp.x = Math.min(cfg.gridWidth - 1, mp.x + 1); pp.y = mp.y; placed = true; }
  let everCurse = false;
  for (let t = 0; t < 10; t++) { tick(world, rng, cfg, clockEntity, content); if (world.query(C_CURSE).length > 0) { everCurse = true; break; } }
  console.log(`C) maleficent + adjacent predator(${placed}) → everCursed=${everCurse}  ${everCurse ? 'OK curse fires' : '(no curse — predator may have moved first)'}`);
}
