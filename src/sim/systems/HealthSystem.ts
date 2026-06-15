// Health, illness, ageing and death. Each tick an agent may fall ill (and slowly
// recover); its chance of dying rises steeply as age nears its rolled lifespan,
// with extra risk while in poor health. The dead become tombstones; notable
// deaths are written to the Chronicle.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_HEALTH, C_LINEAGE, C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Agent, Health, Lineage, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import type { RNG } from '../rng.ts';
import { killAgent } from '../death.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { emitEvent } from '../../history/eventlog.ts';

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

    // Illness strikes occasionally; otherwise health recovers.
    if (!health.ill && rng() < illnessChance) {
      health.value = Math.max(0, health.value - cfg.illnessHealthLoss);
      health.ill = true;
      if (health.value < 0.4) emitEvent(world, 'illness', `${agent.name} fell gravely ill.`);
    } else {
      health.value = Math.min(1, health.value + recovery);
      if (health.value >= 0.5) health.ill = false;
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
    const tomb = killAgent(world, e, tick, cause, tpy);
    emitEvent(world, 'death', `${tomb.name} died of ${cause} at ${ageYears}.`);
    // Record notable deaths as small legends.
    if (chronicle && notable) {
      chronicleAdd(chronicle, {
        tick,
        importance: cause === 'old age' ? 0.75 : 0.7,
        text: `${tomb.name} died of ${cause} at ${ageYears}.`,
      });
    }
  }
}
