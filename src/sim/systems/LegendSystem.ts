// Historical figures (M20): once a day, enshrine any living soul who has crossed into legend —
// a great slayer, a tyrant, an archmage, a venerable elder, a prolific progenitor, a renowned
// notable. Enshrined once and kept after death, so the world remembers its people for
// generations (browsable in the Legends view). A pure read of durable state — no RNG — so it
// never perturbs the trajectory. Mirrors the AchievementSystem's once-fire pattern, per-agent.
import type { World, EntityId } from '../ecs.ts';
import {
  C_FIGURES, C_AGENT, C_COMBAT, C_CRIME, C_MAGIC, C_LINEAGE, C_CLOCK, C_CHRONICLE, C_ORGSTORE,
} from '../components.ts';
import type { FiguresData, Agent, Combat, Crime, Magic, Lineage, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears, ticksPerYear } from '../config.ts';
import { getOrgStore } from '../../org/orgStore.ts';
import { schoolOf } from '../../magic/schools.ts';
import { epithetFor, isEnshrined, enshrine, pruneFigures } from '../../history/figures.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const MAX_FIGURES = 80;

export function runLegendSystem(world: World, cfg: SimConfig): void {
  const figEnts = world.query(C_FIGURES);
  if (!figEnts.length) return;
  const data = world.getComponent<FiguresData>(figEnts[0], C_FIGURES)!;
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // daily
  const tick = clock.tick;
  const tpy = ticksPerYear(cfg);

  const orgStore = getOrgStore(world);
  const leaderOf = new Map<EntityId, string>();   // leader entity → tribe name
  if (orgStore) for (const o of Object.values(orgStore.byId)) {
    if (o.leader != null && !o.extinct) leaderOf.set(o.leader, o.name);
  }
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);

  for (const e of world.query(C_AGENT)) {
    if (isEnshrined(data, e)) continue;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const combat = world.getComponent<Combat>(e, C_COMBAT);
    const crime = world.getComponent<Crime>(e, C_CRIME);
    const magic = world.getComponent<Magic>(e, C_MAGIC);
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    const earned = epithetFor({
      murders: crime?.murders ?? 0,
      kills: combat?.kills ?? 0,
      mastery: magic?.mastery ?? 0,
      school: magic ? schoolOf(magic.school)?.name : undefined,
      isLeader: leaderOf.has(e),
      tribeName: leaderOf.get(e),
      ageYears: ageInYears(agent.ticksAlive, cfg),
      lifespanYears: agent.lifespanTicks / tpy,
      children: lin?.children.length ?? 0,
      standing: agent.standing ?? 0.5,
    });
    if (!earned) continue;
    enshrine(data, { id: e, name: agent.name, epithet: earned.epithet, basis: earned.basis, bornTick: tick - agent.ticksAlive, enshrinedTick: tick });
    emitEvent(world, 'culture', `${agent.name} became known as ${earned.epithet} — ${earned.basis}.`);
    if (ch) chronicleAdd(ch, { tick, importance: 0.8, kind: 'figure', text: `${agent.name} ${earned.epithet} — ${earned.basis}.` }, cfg.chronicleImportanceThreshold);
  }

  pruneFigures(data, MAX_FIGURES, (id) => !world.hasComponent(id, C_AGENT));
}
