// TEMP stress-test harness (NOT committed — deleted after the run). Exercises the sim hard across
// seeds, deep time, and a magic-saturated world, checking the soak invariants PLUS new M26
// magic-component bounds, determinism, and performance. Run: npx tsx _stress.tmp.ts
import { readFileSync } from 'node:fs';
import { createSimulation } from './src/sim/world.ts';
import { tick } from './src/sim/loop.ts';
import { loadSimConfig } from './src/sim/configLoader.ts';
import { loadContentFromDisk } from './src/content/fsSource.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_WALLET, C_MAGIC, C_HEALTH, C_FAUNA, C_TOMBSTONE, C_MEMORY,
  C_TILEMAP, C_CHRONICLE, C_WORLDSTATS, C_ARTIFACTS, C_HOME, C_RESOURCE,
  C_WARD, C_CURSE, C_ENCHANTMENT, C_SPECIAL, C_EQUIPMENT, C_BUSINESS,
} from './src/sim/components.ts';
import type { Needs, Position, Wallet, Magic, Health, Agent, Ward, Curse, Special } from './src/sim/components.ts';
import type { SimConfig } from './src/sim/config.ts';
import { isPassable, isWater } from './src/world/tilemap.ts';
import type { TileMapData } from './src/world/tilemap.ts';
import { getOrgStore } from './src/org/orgStore.ts';
import { schoolIds } from './src/magic/schools.ts';
import { createRNG } from './src/sim/rng.ts';

const content = loadContentFromDisk('./content');
const baseCfg = loadSimConfig(readFileSync('./config/simulation.yaml', 'utf8'));

type W = ReturnType<typeof createSimulation>['world'];

function check(world: W, cfg: SimConfig, tileMap: TileMapData, tickNow: number): { inv: number; notes: string[] } {
  let inv = 0; const notes: string[] = [];
  const orgStore = getOrgStore(world);
  for (const e of world.query(C_AGENT, C_NEEDS, C_POSITION)) {
    const n = world.getComponent<Needs>(e, C_NEEDS)!;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    const w = world.getComponent<Wallet>(e, C_WALLET);
    const h = world.getComponent<Health>(e, C_HEALTH);
    if (n.hunger < 0 || n.hunger > 1 || n.energy < 0 || n.energy > 1 || n.social < 0 || n.social > 1) { inv++; notes.push('need oob'); }
    if (p.x < 0 || p.x >= cfg.gridWidth || p.y < 0 || p.y >= cfg.gridHeight) { inv++; notes.push('pos oob'); }
    const orgId = world.getComponent<Agent>(e, C_AGENT)?.orgId;
    const seafarer = !!(orgId && orgStore && (orgStore.byId[orgId]?.effects?.seafaring ?? 0) > 0);
    if (!isPassable(tileMap, p.x, p.y) && !(seafarer && isWater(tileMap, p.x, p.y))) { inv++; notes.push('on impassable'); }
    if (w && (w.gold < 0 || w.debt < 0)) { inv++; notes.push('neg money'); }
    if (h && (h.value < 0 || h.value > 1)) { inv++; notes.push('health oob'); }
  }
  for (const e of world.query(C_FAUNA, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    if (!isPassable(tileMap, p.x, p.y)) { inv++; notes.push('fauna impassable'); }
  }
  for (const e of world.query(C_MAGIC)) {
    const m = world.getComponent<Magic>(e, C_MAGIC)!;
    if (m.mana < 0 || m.mana > m.maxMana) { inv++; notes.push('mana oob'); }
  }
  const occ = new Set<number>();
  for (const e of [...world.query(C_AGENT, C_POSITION), ...world.query(C_FAUNA, C_POSITION)]) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    const k = p.y * cfg.gridWidth + p.x;
    if (occ.has(k)) { inv++; notes.push('collision'); } else occ.add(k);
  }
  const pop = world.query(C_AGENT).length;
  if (world.query(C_WARD).length > pop) { inv++; notes.push('ward>pop'); }
  if (world.query(C_ENCHANTMENT).length > pop) { inv++; notes.push('ench>pop'); }
  for (const e of world.query(C_WARD)) if (world.getComponent<Ward>(e, C_WARD)!.expiresTick <= tickNow) { inv++; notes.push('ward leak'); }
  for (const e of world.query(C_CURSE)) if (world.getComponent<Curse>(e, C_CURSE)!.expiresTick <= tickNow) { inv++; notes.push('curse leak'); }
  return { inv, notes: [...new Set(notes)] };
}

function magicStats(world: W) {
  let guardians = 0;
  for (const e of world.query(C_SPECIAL)) if (world.getComponent<Special>(e, C_SPECIAL)!.behavior === 'guardian') guardians++;
  return {
    mages: world.query(C_AGENT, C_MAGIC).length,
    wards: world.query(C_WARD).length, curses: world.query(C_CURSE).length,
    enchs: world.query(C_ENCHANTMENT).length, guardians, specials: world.query(C_SPECIAL).length,
    artifacts: (world.getComponent(world.query(C_ARTIFACTS)[0], C_ARTIFACTS) as { artifacts: { enchanted?: string }[] } | undefined)?.artifacts ?? [],
  };
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}
function fingerprint(world: W): string {
  let s = '';
  for (const e of world.query(C_AGENT)) {
    const p = world.getComponent<Position>(e, C_POSITION);
    const n = world.getComponent<Needs>(e, C_NEEDS);
    const w = world.getComponent<Wallet>(e, C_WALLET);
    const a = world.getComponent<Agent>(e, C_AGENT);
    const h = world.getComponent<Health>(e, C_HEALTH);
    s += `${e}:${p?.x},${p?.y};${n?.hunger.toFixed(4)};${n?.energy.toFixed(4)};${w?.gold.toFixed(2)};${a?.ticksAlive};${h?.value.toFixed(4)}|`;
  }
  s += `F${world.query(C_FAUNA).length}G${world.query(C_TOMBSTONE).length}S${world.query(C_SPECIAL).length}H${world.query(C_HOME).length}`;
  return fnv(s);
}
function run(cfg: SimConfig) {
  const sim = createSimulation(cfg, content);
  const tileMap = sim.world.getComponent<TileMapData>(sim.world.query(C_TILEMAP)[0], C_TILEMAP)!;
  return { ...sim, tileMap };
}
const L = (s: string) => console.log(s);
const yr = (t: number, cfg: SimConfig) => (t / (cfg.ticksPerDay * cfg.daysPerYear)).toFixed(0);

L('\n######## TEST 1 — MULTI-SEED STABILITY (6 seeds × 24k ticks) ########');
{
  const TICKS = 24_000; let totalInv = 0;
  for (const seed of [1, 3, 7, 8, 42, 99]) {
    const cfg = { ...baseCfg, seed };
    const { world, rng, clockEntity, tileMap } = run(cfg);
    let inv = 0; const notes = new Set<string>();
    let maxGuard = 0, maxWard = 0, maxCurse = 0, maxEnch = 0, minPop = 1e9, maxPop = 0;
    for (let t = 0; t < TICKS; t++) {
      tick(world, rng, cfg, clockEntity, content);
      if ((t + 1) % 2000 === 0) {
        const r = check(world, cfg, tileMap, t + 1); inv += r.inv; r.notes.forEach(n => notes.add(n));
        const ms = magicStats(world); maxGuard = Math.max(maxGuard, ms.guardians); maxWard = Math.max(maxWard, ms.wards);
        maxCurse = Math.max(maxCurse, ms.curses); maxEnch = Math.max(maxEnch, ms.enchs);
        const pop = world.query(C_AGENT).length; minPop = Math.min(minPop, pop); maxPop = Math.max(maxPop, pop);
      }
    }
    totalInv += inv;
    const ms = magicStats(world);
    L(`  seed ${String(seed).padStart(2)}: pop ${world.query(C_AGENT).length} (range ${minPop}-${maxPop}) graves ${world.query(C_TOMBSTONE).length} mages ${ms.mages} | peak ward ${maxWard} curse ${maxCurse} ench ${maxEnch} guardian ${maxGuard} | artifacts ${ms.artifacts.length}(magic ${ms.artifacts.filter(a => a.enchanted).length}) | inv=${inv}${inv ? ' [' + [...notes].join(',') + ']' : ''}`);
  }
  L(`  => ${totalInv === 0 ? 'PASS' : 'FAIL'}: ${totalInv} invariant violations across 6 seeds`);
}

L('\n######## TEST 2 — DETERMINISM (seed 8, two runs, full-state fingerprint) ########');
{
  const TICKS = 20_000; const fps: string[][] = [];
  for (let pass = 0; pass < 2; pass++) {
    const cfg = { ...baseCfg, seed: 8 };
    const { world, rng, clockEntity } = run(cfg);
    const cps: string[] = [];
    for (let t = 0; t < TICKS; t++) { tick(world, rng, cfg, clockEntity, content); if ((t + 1) % 5000 === 0) cps.push(fingerprint(world)); }
    fps.push(cps);
  }
  const same = JSON.stringify(fps[0]) === JSON.stringify(fps[1]);
  L(`  run A: ${fps[0].join(' ')}`); L(`  run B: ${fps[1].join(' ')}`);
  L(`  => ${same ? 'PASS' : 'FAIL'}: two runs of seed 8 are ${same ? 'byte-identical' : 'DIVERGENT'}`);
}

L('\n######## TEST 3 — DEEP-TIME BOUNDING (seed 8, 120k ticks ≈ 125 sim-years) ########');
{
  const TICKS = 120_000; const cfg = { ...baseCfg, seed: 8 };
  const { world, rng, clockEntity, tileMap } = run(cfg); let inv = 0;
  L('    yr   pop graves artifacts eras samples maxUtt mages inv');
  for (let t = 0; t < TICKS; t++) {
    tick(world, rng, cfg, clockEntity, content);
    if ((t + 1) % 20_000 === 0) {
      const r = check(world, cfg, tileMap, t + 1); inv += r.inv;
      const arts = (world.getComponent(world.query(C_ARTIFACTS)[0], C_ARTIFACTS) as { artifacts: unknown[] }).artifacts.length;
      const ch = world.getComponent(world.query(C_CHRONICLE)[0], C_CHRONICLE) as { eras: unknown[] };
      const ws = world.getComponent(world.query(C_WORLDSTATS)[0], C_WORLDSTATS) as { samples: unknown[] };
      let maxUtt = 0; for (const e of world.query(C_AGENT, C_MEMORY)) maxUtt = Math.max(maxUtt, (world.getComponent(e, C_MEMORY) as { utterances: unknown[] }).utterances.length);
      L(`  ${yr(t + 1, cfg).padStart(4)} ${String(world.query(C_AGENT).length).padStart(4)} ${String(world.query(C_TOMBSTONE).length).padStart(6)} ${String(arts).padStart(9)} ${String(ch.eras.length).padStart(4)} ${String(ws.samples.length).padStart(7)} ${String(maxUtt).padStart(6)} ${String(world.query(C_MAGIC).length).padStart(5)} ${String(r.inv).padStart(3)}${r.inv ? ' ' + r.notes.join(',') : ''}`);
    }
  }
  L(`  => ${inv === 0 ? 'PASS' : 'FAIL'}: ${inv} violations; eras/samples/utters must stay capped (graves are O(deaths) by design)`);
}

L('\n######## TEST 4 — MAGIC-SATURATED STRESS (inject ~50% mages, all 9 schools, +gear) ########');
{
  const TICKS = 30_000; const cfg = { ...baseCfg, seed: 8, initialPopulation: 80 };
  const { world, rng, clockEntity, tileMap } = run(cfg);
  const ids = schoolIds(); const irng = createRNG(12345); let made = 0, equipped = 0;
  for (const e of world.query(C_AGENT)) {
    if (irng() < 0.5) { world.addComponent<Magic>(e, C_MAGIC, { mana: 100, maxMana: 100, manaRegenPerTick: cfg.manaRegenPerDay / cfg.ticksPerDay, school: ids[Math.floor(irng() * ids.length)], mastery: 4 }); made++; }
    if (irng() < 0.4) { world.addComponent(e, C_EQUIPMENT, { weapon: 3, armour: 2 }); equipped++; }
  }
  L(`  injected ${made} mages (of ${world.query(C_AGENT).length}) across ${ids.length} schools, ${equipped} with gear`);
  let inv = 0, maxGuard = 0, maxWard = 0, maxCurse = 0, maxEnch = 0; let everW = false, everC = false, everE = false, everG = false;
  for (let t = 0; t < TICKS; t++) {
    tick(world, rng, cfg, clockEntity, content);
    if ((t + 1) % 3000 === 0) {
      const r = check(world, cfg, tileMap, t + 1); inv += r.inv; const ms = magicStats(world);
      maxGuard = Math.max(maxGuard, ms.guardians); maxWard = Math.max(maxWard, ms.wards); maxCurse = Math.max(maxCurse, ms.curses); maxEnch = Math.max(maxEnch, ms.enchs);
      everW ||= ms.wards > 0; everC ||= ms.curses > 0; everE ||= ms.enchs > 0; everG ||= ms.guardians > 0;
      L(`    yr ${yr(t + 1, cfg).padStart(3)}: pop ${String(world.query(C_AGENT).length).padStart(3)} mages ${String(ms.mages).padStart(3)} | live ward ${ms.wards} curse ${ms.curses} ench ${ms.enchs} guardian ${ms.guardians} specials ${ms.specials} | artifacts ${ms.artifacts.length}(magic ${ms.artifacts.filter(a => a.enchanted).length}) inv ${r.inv}${r.inv ? ' ' + r.notes.join(',') : ''}`);
    }
  }
  L(`  fired: ward=${everW} curse=${everC} enchant=${everE} summon=${everG} | peaks: ward ${maxWard} curse ${maxCurse} ench ${maxEnch} guardian ${maxGuard}`);
  L(`  => ${inv === 0 && everW && everC && everE && everG ? 'PASS' : (inv ? 'FAIL(inv)' : 'WARN(an effect never fired)')}: ${inv} violations under heavy magic load`);
}

L('\n######## TEST 5 — PERFORMANCE (ms/tick) ########');
{
  for (const [label, over] of [['64x64 pop20', {}], ['128x128 pop60', { gridWidth: 128, gridHeight: 128, initialPopulation: 60 }], ['200x200 pop100', { gridWidth: 200, gridHeight: 200, initialPopulation: 100 }]] as const) {
    const cfg = { ...baseCfg, seed: 8, ...over };
    const { world, rng, clockEntity } = run(cfg);
    for (let t = 0; t < 1000; t++) tick(world, rng, cfg, clockEntity, content);
    const t0 = Date.now(); const MEAS = 3000;
    for (let t = 0; t < MEAS; t++) tick(world, rng, cfg, clockEntity, content);
    const ms = (Date.now() - t0) / MEAS;
    const ents = world.query(C_AGENT).length + world.query(C_FAUNA).length + world.query(C_RESOURCE).length + world.query(C_BUSINESS).length;
    L(`  ${label.padEnd(16)}: ${ms.toFixed(3)} ms/tick (${(1000 / ms).toFixed(0)} ticks/s, ~${ents} entities)`);
  }
}

L('\n######## STRESS CAMPAIGN COMPLETE ########\n');
