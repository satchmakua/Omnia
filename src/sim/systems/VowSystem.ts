// Vow riders — the sworn oath ACTS (M13 s2, D26). A grown vow is sworn under the soul's
// nine-cell alignment (AISystem records `Memory.vowAlign`), and each pole carries a rider:
// the GOOD-sworn give ALMS (this system — real gold, from surplus to the needy nearby); the
// EVIL-sworn feed malice (CrimeSystem multiplies their offend chance); the LAWFUL-sworn are
// steadfast (MentalStateSystem — breaks come harder); the CHAOTIC-sworn are free spirits
// (ActionSystem — they stop toiling sooner). This system handles the one rider that needs
// its own pass: charity. Daily, phased per giver (entity-id offset — no thundering herd),
// ZERO RNG — a pure read of wallets, positions, and the sworn vow. Alms are bounded (a few
// coins, weekly, from the comfortable only) and CONSERVATIVE (a transfer, never minted), so
// the wealth ledger stays honest and gini can only soften, never spike.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_MEMORY, C_WALLET, C_POSITION, C_CLOCK } from '../components.ts';
import type { Agent, Memory, Wallet, Position, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import { goodPole } from '../heredity.ts';
import type { AlignKey } from '../heredity.ts';
import { earn } from '../economy.ts';
import { emitEvent } from '../../history/eventlog.ts';

export function runVowSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const tick = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick;
  if (tick === 0 || tick % cfg.ticksPerDay !== 0) return;   // daily
  const day = Math.floor(tick / cfg.ticksPerDay);
  const interval = Math.max(1, Math.round(cfg.almsIntervalDays));

  // The needy: threadbare or indebted souls with a place in the world. Built once per day.
  const needy: { e: EntityId; x: number; y: number }[] = [];
  for (const e of world.query(C_AGENT, C_WALLET, C_POSITION)) {
    const w = world.getComponent<Wallet>(e, C_WALLET)!;
    if (w.debt > 0 || w.gold < cfg.almsPoorGold) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      needy.push({ e, x: p.x, y: p.y });
    }
  }
  if (!needy.length) return;

  for (const e of world.query(C_AGENT, C_MEMORY, C_WALLET, C_POSITION)) {
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (!mem.vowAlign || goodPole(mem.vowAlign as AlignKey) !== 'G') continue;   // only the good-sworn
    if ((day + e) % interval !== 0) continue;                                    // phased, ~weekly per giver
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;
    const purse = world.getComponent<Wallet>(e, C_WALLET)!;
    if (purse.gold < cfg.almsMinGold) continue;                                  // charity from surplus, not ruin
    const p = world.getComponent<Position>(e, C_POSITION)!;

    // The nearest needy neighbour within reach (ties: lowest id) — a neighbourly act.
    let best: EntityId | null = null, bestD = Infinity;
    for (const n of needy) {
      if (n.e === e) continue;
      const d = Math.max(Math.abs(n.x - p.x), Math.abs(n.y - p.y));
      if (d > cfg.almsRadius) continue;
      if (d < bestD || (d === bestD && (best === null || n.e < best))) { best = n.e; bestD = d; }
    }
    if (best === null) continue;

    const give = Math.min(cfg.almsAmount, purse.gold);
    purse.gold -= give;
    earn(world.getComponent<Wallet>(best, C_WALLET)!, give);   // pays their debt first, like any income
    const bName = world.getComponent<Agent>(best, C_AGENT)!.name;
    emitEvent(world, 'culture', `${agent.name}, true to their vow, gave alms to ${bName}.`);
  }
}
