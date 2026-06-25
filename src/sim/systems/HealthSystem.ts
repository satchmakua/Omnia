// Health, illness, ageing and death. Each tick an agent may fall ill (and slowly
// recover); its chance of dying rises steeply as age nears its rolled lifespan,
// with extra risk while in poor health. The dead become tombstones; notable
// deaths are written to the Chronicle.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_HEALTH, C_LINEAGE, C_CLOCK, C_CHRONICLE, C_WALLET } from '../components.ts';
import type { Agent, Health, Lineage, Clock, Wallet } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import { killAgent } from '../death.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { remember } from '../../ai/memory.ts';

export function runHealthSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const tpy = ticksPerYear(cfg);
  const illnessChance = cfg.illnessChancePerDay / cfg.ticksPerDay;
  const recovery = cfg.healthRecoveryPerDay / cfg.ticksPerDay;
  const baseMort = cfg.baseMortalityPerDay / cfg.ticksPerDay;
  const sickMort = cfg.sickMortalityPerDay / cfg.ticksPerDay;

  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  const chronEnts = world.query(C_CHRONICLE);
  const chronicle = chronEnts.length ? world.getComponent<ChronicleData>(chronEnts[0], C_CHRONICLE) : undefined;

  const deaths: { e: EntityId; cause: string }[] = [];

  for (const e of world.query(C_AGENT, C_HEALTH)) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const health = world.getComponent<Health>(e, C_HEALTH)!;

    // Illness strikes occasionally; otherwise health recovers. Pulling through a *grave*
    // illness is itself a remembered turning point (M10 slice 3) — a brush with mortality
    // that `distill` reads as resilience.
    if (!health.ill && rng() < illnessChance) {
      health.value = Math.max(0, health.value - cfg.illnessHealthLoss);
      health.ill = true;
      if (health.value < 0.4) {
        health.grave = true;
        emitEvent(world, 'illness', `${agent.name} fell gravely ill.`);
        remember(world, e, tick, 'fell gravely ill', 0.5);
      }
    } else {
      // The indebted recover more slowly — poverty means worse food and no care, so debt
      // finally has a cost (Economy Rebalance). A pure read of the wallet; no RNG.
      const wallet = world.getComponent<Wallet>(e, C_WALLET);
      const recover = wallet && wallet.debt > 0 ? recovery * (1 - cfg.debtRecoveryPenalty) : recovery;
      health.value = Math.min(1, health.value + recover);
      if (health.ill && health.value >= 0.5) {
        health.ill = false;
        if (health.grave) {
          health.grave = false;
          emitEvent(world, 'illness', `${agent.name} pulled through a grave illness.`);
          remember(world, e, tick, 'survived a grave illness', 0.45);
        }
      }
    }

    // Mortality: flat base + steep age ramp + poor-health penalty.
    const ageRatio = agent.lifespanTicks > 0 ? agent.ticksAlive / agent.lifespanTicks : 0;
    const ageMort = Math.pow(ageRatio, 10) * (cfg.ageMortalityScale / cfg.ticksPerDay);
    const pTick = baseMort + ageMort + (health.value < 0.3 ? sickMort : 0);

    if (rng() < pTick) {
      const cause = ageRatio >= 0.9 ? 'old age' : (health.value < 0.3 ? 'illness' : 'misfortune');
      deaths.push({ e, cause });
    }
  }

  for (const { e, cause } of deaths) {
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    const ageYears = Math.floor(agent.ticksAlive / tpy);
    const notable = !!(lin && (lin.partner != null || lin.children.length > 0)) || cause === 'old age';
    // Bereavement: the deceased's kin remember the loss (no-ops for the dead). Outliving
    // your own child is the heaviest grief of all (M10 slice 3).
    if (lin) {
      if (lin.partner != null) remember(world, lin.partner, tick, `lost their spouse ${agent.name}`, 0.9);
      for (const child of lin.children) remember(world, child, tick, `lost their parent ${agent.name}`, 0.9);
      for (const parent of lin.parents) remember(world, parent, tick, `lost their child ${agent.name}`, 0.95);
    }
    const tomb = killAgent(world, e, tick, cause, tpy);
    emitEvent(world, 'death', `${tomb.name} died of ${cause} at ${ageYears}.`);
    // Record notable deaths as small legends.
    if (chronicle && notable) {
      chronicleAdd(chronicle, {
        tick,
        importance: cause === 'old age' ? 0.75 : 0.7,
        kind: 'death',
        text: `${tomb.name} died of ${cause} at ${ageYears}.`,
      }, cfg.chronicleImportanceThreshold);
    }
  }
}
