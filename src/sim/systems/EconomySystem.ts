// The economy: agents are hired by businesses, earn wages while working at their
// employer's tile, and pay a daily cost of living (going into debt when broke).
// Businesses earn revenue from each working employee, so they stay solvent.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_WALLET, C_JOB, C_BUSINESS, C_MAGIC, C_CLOCK,
} from '../components.ts';
import type { Agent, Wallet, Job, Business, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import { earn, spend } from '../economy.ts';
import { getMarket } from '../market.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { remember } from '../../ai/memory.ts';

export function runEconomySystem(world: World, cfg: SimConfig): void {
  const businesses = world.query(C_BUSINESS);
  const clockEntsTop = world.query(C_CLOCK);
  const now = clockEntsTop.length ? world.getComponent<Clock>(clockEntsTop[0], C_CLOCK)!.tick : 0;

  // ── Hiring ──────────────────────────────────────────────────────────────────
  // Drop jobs whose employer no longer exists, then count current staff.
  const employees = new Map<EntityId, number>();
  for (const b of businesses) employees.set(b, 0);
  for (const e of world.query(C_JOB)) {
    const job = world.getComponent<Job>(e, C_JOB)!;
    if (!world.isAlive(job.employer)) { world.removeComponent(e, C_JOB); continue; }
    employees.set(job.employer, (employees.get(job.employer) ?? 0) + 1);
  }

  // Place each unemployed agent into a business with an opening. Magical
  // employers hire only the aptitude-gifted; gifted agents prefer magical work
  // (so the rare mage tends to become the town's hedge-witch).
  const hireInto = (e: EntityId, b: EntityId, biz: Business) => {
    world.addComponent<Job>(e, C_JOB, {
      professionId: biz.professionId,
      professionName: biz.professionName,
      employer: b,
      wagePerTick: biz.wagePerTick,
      gathers: biz.gathers,
    });
    employees.set(b, (employees.get(b) ?? 0) + 1);
    emitEvent(world, 'work', `${world.getComponent<Agent>(e, C_AGENT)!.name} took work as a ${biz.professionName}.`);
    remember(world, e, now, `took work as a ${biz.professionName}`, 0.3);
  };
  const hasOpening = (b: EntityId, biz: Business) => (employees.get(b) ?? 0) < biz.maxEmployees;

  for (const e of world.query(C_AGENT, C_WALLET)) {
    if (world.hasComponent(e, C_JOB)) continue;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue; // children don't work
    const apt = world.hasComponent(e, C_MAGIC);

    let chosen: EntityId | null = null;
    // Gifted agents try magical employers first.
    if (apt) {
      for (const b of businesses) {
        const biz = world.getComponent<Business>(b, C_BUSINESS)!;
        if (biz.requiresAptitude && hasOpening(b, biz)) { chosen = b; break; }
      }
    }
    // Otherwise the first compatible opening (non-apt skip magical employers).
    if (chosen === null) {
      for (const b of businesses) {
        const biz = world.getComponent<Business>(b, C_BUSINESS)!;
        if (biz.requiresAptitude && !apt) continue;
        if (hasOpening(b, biz)) { chosen = b; break; }
      }
    }
    if (chosen !== null) hireInto(e, chosen, world.getComponent<Business>(chosen, C_BUSINESS)!);
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
      // The cost of living is a day's provisions at the current market price — dear in a
      // lean year of farming, cheap in a glut (M15). Falls back to the flat upkeep if no
      // market exists (older saves / minimal test worlds).
      const market = getMarket(world);
      const upkeep = market ? market.price : cfg.dailyUpkeep;
      for (const e of world.query(C_AGENT, C_WALLET)) {
        // Children are dependents (the Kids Pass): they neither work nor pay a cost of
        // living, so they no longer march into debt from birth — and adults enter
        // adulthood solvent instead of saddled with years of childhood upkeep.
        const agent = world.getComponent<Agent>(e, C_AGENT)!;
        if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;
        const wallet = world.getComponent<Wallet>(e, C_WALLET)!;
        // A jobless adult scrapes by on foraging / odd jobs — a survival floor (just under
        // the cost of living) so unemployment is *poverty*, not a bottomless debt spiral
        // (Economy Rebalance). The employed live off their wage/savings, so no handout.
        if (!world.hasComponent(e, C_JOB)) earn(wallet, cfg.subsistencePerDay);
        spend(wallet, upkeep);
        if (wallet.debt > cfg.maxDebt) wallet.debt = cfg.maxDebt;   // debt is bounded — poverty, not a hole
      }
    }
  }
}
