// The economy: agents are hired by businesses, earn wages while working at their
// employer's tile, and pay a daily cost of living (going into debt when broke).
// Businesses earn revenue from each working employee, so they stay solvent.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_WALLET, C_JOB, C_BUSINESS, C_CLOCK,
} from '../components.ts';
import type { Agent, Wallet, Job, Business, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { earn, spend } from '../economy.ts';

export function runEconomySystem(world: World, cfg: SimConfig): void {
  const businesses = world.query(C_BUSINESS);

  // ── Hiring ──────────────────────────────────────────────────────────────────
  // Drop jobs whose employer no longer exists, then count current staff.
  const employees = new Map<EntityId, number>();
  for (const b of businesses) employees.set(b, 0);
  for (const e of world.query(C_JOB)) {
    const job = world.getComponent<Job>(e, C_JOB)!;
    if (!world.isAlive(job.employer)) { world.removeComponent(e, C_JOB); continue; }
    employees.set(job.employer, (employees.get(job.employer) ?? 0) + 1);
  }

  // Place each unemployed agent into the first business with an opening.
  for (const e of world.query(C_AGENT, C_WALLET)) {
    if (world.hasComponent(e, C_JOB)) continue;
    for (const b of businesses) {
      const biz = world.getComponent<Business>(b, C_BUSINESS)!;
      if ((employees.get(b) ?? 0) >= biz.maxEmployees) continue;
      world.addComponent<Job>(e, C_JOB, {
        professionId: biz.professionId,
        professionName: biz.professionName,
        employer: b,
        wagePerTick: biz.wagePerTick,
      });
      employees.set(b, (employees.get(b) ?? 0) + 1);
      break;
    }
  }

  // ── Wages ───────────────────────────────────────────────────────────────────
  // An employee who chooses to work earns its wage; the business books that
  // worker's revenue (so its balance trends up). Pay is not gated on standing
  // exactly on the employer tile — the commute (MovementSystem) is visual flavor;
  // gating pay on arrival let greedy pathfinding strand workers in permanent debt.
  for (const e of world.query(C_AGENT, C_WALLET, C_JOB)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (agent.action !== 'work') continue;
    const job = world.getComponent<Job>(e, C_JOB)!;
    const biz = world.getComponent<Business>(job.employer, C_BUSINESS);
    if (!biz) continue;

    if (biz.balance >= job.wagePerTick) {
      biz.balance -= job.wagePerTick;
      earn(world.getComponent<Wallet>(e, C_WALLET)!, job.wagePerTick);
    }
    biz.balance += biz.revenuePerWorkerPerTick;
  }

  // ── Cost of living (once per day) ─────────────────────────────────────────────
  const clockEnts = world.query(C_CLOCK);
  if (clockEnts.length) {
    const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
    if (clock.tick > 0 && clock.tick % cfg.ticksPerDay === 0) {
      for (const e of world.query(C_AGENT, C_WALLET)) {
        spend(world.getComponent<Wallet>(e, C_WALLET)!, cfg.dailyUpkeep);
      }
    }
  }
}
