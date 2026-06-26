// Procedural quests (M20 s3): folk take up goals that their own lives fulfil. Once a day this
// system (1) **resolves** active quests against durable outcomes — a hunter/avenger whose kill
// count has risen, an explorer whose target ruin has been uncovered — recording fulfilment as a
// remembered turning point + a legend; (2) **abandons** quests gone stale; and (3) **assigns** a
// new quest (at most one a day, up to a cap) to an apt, questless adult — the brave hunt & avenge,
// the curious explore. A pure read of state (deterministic selection, no RNG) → the sim trajectory
// is unperturbed; quests are a narrative layer over the combat/archaeology already happening.
import type { World, EntityId } from '../ecs.ts';
import {
  C_QUEST, C_AGENT, C_COMBAT, C_PERSONALITY, C_RELATIONSHIPS, C_POSITION, C_RUIN, C_FAUNA, C_CLOCK, C_CHRONICLE,
} from '../components.ts';
import type {
  Quest, Agent, Combat, Personality, Relationships, Position, Ruin, Fauna, Clock,
} from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears, ticksPerYear } from '../config.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { remember } from '../../ai/memory.ts';

const MAX_QUESTS = 8;
const BOLD = new Set(['brave', 'hot-headed', 'ambitious']);

function killsOf(world: World, e: EntityId): number {
  return world.getComponent<Combat>(e, C_COMBAT)?.kills ?? 0;
}

// The quest an agent is apt to take up right now, or null. Curious souls explore; the bold hunt
// and avenge. (Deterministic — a pure read of the agent's character & circumstances.)
function eligibleQuest(
  world: World, e: EntityId, tick: number, ruin: { x: number; y: number } | undefined, predators: boolean,
): Quest | null {
  const trait = world.getComponent<Personality>(e, C_PERSONALITY)?.trait;
  if (trait === 'curious' && ruin) return { kind: 'explore', text: 'seek out the old ruins', sinceTick: tick, tx: ruin.x, ty: ruin.y };
  if (trait && BOLD.has(trait)) {
    const rel = world.getComponent<Relationships>(e, C_RELATIONSHIPS);
    const hasRival = rel ? Object.values(rel.edges).some(ed => ed.type === 'rival') : false;
    if (hasRival) return { kind: 'avenge', text: 'avenge a wrong done to them', sinceTick: tick, baseKills: killsOf(world, e) };
    if (predators) return { kind: 'hunt', text: 'hunt the great beasts that stalk the wilds', sinceTick: tick, baseKills: killsOf(world, e) };
  }
  return null;
}

export function runQuestSystem(world: World, cfg: SimConfig): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // daily
  const tick = clock.tick;
  const tpy = ticksPerYear(cfg);
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
  const duration = 10 * tpy;   // a quest abandoned after ~10 years unfulfilled

  // Discovered-ruin lookup for resolving 'explore' quests.
  const ruinAt = new Map<number, boolean>();   // tile key → discovered?
  let undiscovered: { x: number; y: number } | undefined;
  for (const e of world.query(C_RUIN, C_POSITION)) {
    const r = world.getComponent<Ruin>(e, C_RUIN)!;
    const p = world.getComponent<Position>(e, C_POSITION)!;
    ruinAt.set(p.y * cfg.gridWidth + p.x, r.discovered);
    if (!r.discovered && !undiscovered) undiscovered = { x: p.x, y: p.y };
  }
  const predators = world.query(C_FAUNA).some(e => world.getComponent<Fauna>(e, C_FAUNA)!.diet === 'predator');

  // ── Resolve / abandon active quests ──
  let active = 0;
  for (const e of world.query(C_AGENT, C_QUEST)) {
    const q = world.getComponent<Quest>(e, C_QUEST)!;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    let done = false, fulfilled = false;
    if (q.kind === 'explore') {
      fulfilled = done = q.tx !== undefined && ruinAt.get(q.ty! * cfg.gridWidth + q.tx) === true;
    } else {
      fulfilled = done = killsOf(world, e) > (q.baseKills ?? 0);
    }
    if (done && fulfilled) {
      const line = q.kind === 'hunt' ? `${agent.name} fulfilled their vow, slaying a beast of the wilds.`
        : q.kind === 'avenge' ? `${agent.name} had their vengeance at last.`
        : `${agent.name} sought out and uncovered the old ruins.`;
      emitEvent(world, 'culture', line);
      remember(world, e, tick, `fulfilled a vow — to ${q.text}`, 0.7);
      if (ch) chronicleAdd(ch, { tick, importance: 0.75, kind: 'quest', text: line }, cfg.chronicleImportanceThreshold);
      world.removeComponent(e, C_QUEST);
    } else if (tick - q.sinceTick > duration) {
      world.removeComponent(e, C_QUEST);   // given up, quietly
    } else {
      active++;
    }
  }

  // ── Assign one new quest a day to an apt, questless adult ──
  if (active >= MAX_QUESTS) return;
  for (const e of world.query(C_AGENT)) {
    if (world.hasComponent(e, C_QUEST)) continue;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears) continue;
    const q = eligibleQuest(world, e, tick, undiscovered, predators);
    if (!q) continue;
    world.addComponent<Quest>(e, C_QUEST, q);
    emitEvent(world, 'culture', `${agent.name} set out to ${q.text}.`);
    remember(world, e, tick, `vowed to ${q.text}`, 0.55);
    return;   // one a day keeps quests a rare, meaningful undertaking
  }
}
