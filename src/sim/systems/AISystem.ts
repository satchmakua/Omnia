// The "soul" layer (M5), kept off the hot path and rare. On a per-agent schedule
// an agent reflects (memories → a belief), and at meaningful moments it also speaks,
// dreams, or resolves (M5 part 2). Every line runs on the provider's SYNCHRONOUS
// deterministic path (so it never blocks the tick and consumes no RNG — determinism
// intact) and is recorded for exact replay. These are pure flavour: nothing here
// feeds back into the simulation's mechanical trajectory (D19). Async live-model
// generation via the AIRunner stays off the hot path; the stub is the default.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_MEMORY, C_POSITION, C_RELATIONSHIPS, C_CLOCK } from '../components.ts';
import type { Agent, Memory, Position, Relationships, Utterance, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { AIProvider } from '../../ai/provider.ts';
import { hashString } from '../../ai/provider.ts';
import {
  retrieve, buildReflectionPrompt, buildDreamPrompt, buildDialoguePrompt, buildDecisionPrompt,
} from '../../ai/memory.ts';
import { recordResponse } from '../../ai/recording.ts';
import { emitEvent } from '../../history/eventlog.ts';

export function runAISystem(world: World, cfg: SimConfig, provider: AIProvider): void {
  // Only the synchronous deterministic path runs in-loop; async providers (Ollama)
  // are driven by the AIRunner off the hot path, never blocking the tick.
  if (!provider.completeSync) return;

  const clockEnts = world.query(C_CLOCK);
  const clock = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK) : undefined;
  const tick = clock?.tick ?? 0;
  const isDay = clock?.isDay ?? true;

  reflectPass(world, cfg, provider, tick);
  expressPass(world, cfg, provider, tick, isDay);
}

// Record the provider's raw output, store it on the agent, and announce it.
function commit(
  world: World, cfg: SimConfig, mem: Memory, tick: number,
  kind: Utterance['kind'], display: string, prompt: string, raw: string,
): void {
  mem.utterances.push({ tick, kind, text: display });
  if (mem.utterances.length > cfg.maxUtterances) mem.utterances.shift();
  recordResponse(world, tick, hashString(prompt), raw);
}

// ── Reflection (M5 part 1): memories distil into a durable belief. ──────────────
function reflectPass(world: World, cfg: SimConfig, provider: AIProvider, tick: number): void {
  const interval = cfg.reflectionIntervalDays * cfg.ticksPerDay;
  let budget = cfg.maxReflectionsPerTick;

  for (const e of world.query(C_AGENT, C_MEMORY)) {
    if (budget <= 0) break;
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (mem.events.length < cfg.minMemoriesToReflect) continue;
    if (tick - mem.lastReflectTick < interval) continue;

    const name = world.getComponent<Agent>(e, C_AGENT)!.name;
    const top = retrieve(mem, `${name}'s life`, provider, cfg.reflectMemories);
    const prompt = buildReflectionPrompt(name, tick, top);
    const belief = provider.completeSync!(prompt);

    mem.beliefs.push({ tick, text: belief });
    if (mem.beliefs.length > cfg.maxBeliefs) mem.beliefs.shift();
    mem.lastReflectTick = tick;

    recordResponse(world, tick, hashString(prompt), belief);
    emitEvent(world, 'reflect', `${name} now ${belief}.`);
    budget--;
  }
}

// ── Expression (M5 part 2): dreams, dialogue, and decisions. ────────────────────
// All three share one per-tick budget so the soul stays rare town-wide. Dreams run
// only at night (sleepers); during the day the budget falls to dialogue + decisions.
function expressPass(
  world: World, cfg: SimConfig, provider: AIProvider, tick: number, isDay: boolean,
): void {
  let budget = cfg.maxExpressionsPerTick;
  if (budget <= 0) return;
  const interval = cfg.expressionIntervalDays * cfg.ticksPerDay;

  if (!isDay) budget = dreamPass(world, cfg, provider, tick, interval, budget);
  budget = decisionPass(world, cfg, provider, tick, interval, budget);
  dialoguePass(world, cfg, provider, tick, interval, budget);
}

// A sleeping agent at night dreams an image drawn from its memories.
function dreamPass(
  world: World, cfg: SimConfig, provider: AIProvider, tick: number, interval: number, budget: number,
): number {
  for (const e of world.query(C_AGENT, C_MEMORY)) {
    if (budget <= 0) break;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (agent.action !== 'sleep') continue;
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (mem.events.length < cfg.minMemoriesToReflect) continue;
    if (tick - mem.lastDreamTick < interval) continue;

    const top = retrieve(mem, `${agent.name}'s dream`, provider, cfg.reflectMemories);
    const prompt = buildDreamPrompt(agent.name, tick, top);
    const line = provider.completeSync!(prompt);
    commit(world, cfg, mem, tick, 'dream', line, prompt, line);
    mem.lastDreamTick = tick;
    emitEvent(world, 'dream', `${agent.name} ${line}.`);
    budget--;
  }
  return budget;
}

// A fresh, important memory (a wedding, a birth, a bereavement) is a turning point:
// the agent voices a resolution about it. Only the newest memory, and only once.
function decisionPass(
  world: World, cfg: SimConfig, provider: AIProvider, tick: number, interval: number, budget: number,
): number {
  for (const e of world.query(C_AGENT, C_MEMORY)) {
    if (budget <= 0) break;
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (mem.events.length === 0) continue;
    const last = mem.events[mem.events.length - 1];
    if (last.importance < cfg.decisionImportance) continue; // not a turning point
    if (last.tick <= mem.lastSpokeTick) continue;           // already resolved this/an older one
    if (tick - mem.lastSpokeTick < interval) continue;      // throttle

    const name = world.getComponent<Agent>(e, C_AGENT)!.name;
    const top = retrieve(mem, last.text, provider, cfg.reflectMemories);
    const prompt = buildDecisionPrompt(name, last.text, tick, top);
    const line = provider.completeSync!(prompt);
    commit(world, cfg, mem, tick, 'decide', line, prompt, line);
    mem.lastSpokeTick = tick;
    emitEvent(world, 'decide', `${name} ${line}.`);
    budget--;
  }
  return budget;
}

// Two agents who share a tile and a bond (partner or friend) exchange a line. At
// most one conversation per tile; the speaker is chosen deterministically by id.
function dialoguePass(
  world: World, cfg: SimConfig, provider: AIProvider, tick: number, interval: number, budget: number,
): number {
  if (budget <= 0) return budget;

  const byTile = new Map<number, EntityId[]>();
  for (const e of world.query(C_AGENT, C_MEMORY, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    const key = p.y * cfg.gridWidth + p.x;
    const list = byTile.get(key);
    if (list) list.push(e); else byTile.set(key, [e]);
  }

  for (const key of [...byTile.keys()].sort((a, b) => a - b)) {
    if (budget <= 0) break;
    const group = byTile.get(key)!;
    if (group.length < 2) continue;
    group.sort((a, b) => a - b);

    for (const speaker of group) {
      const mem = world.getComponent<Memory>(speaker, C_MEMORY)!;
      if (mem.events.length < cfg.minMemoriesToReflect) continue;
      if (tick - mem.lastSpokeTick < interval) continue;
      const rel = world.getComponent<Relationships>(speaker, C_RELATIONSHIPS);
      if (!rel) continue;

      const listener = group.find(o => o !== speaker &&
        (rel.edges[o]?.type === 'partner' || rel.edges[o]?.type === 'friend'));
      if (listener === undefined) continue;

      const name = world.getComponent<Agent>(speaker, C_AGENT)!.name;
      const other = world.getComponent<Agent>(listener, C_AGENT)!.name;
      const top = retrieve(mem, `${name} and ${other}`, provider, cfg.reflectMemories);
      const prompt = buildDialoguePrompt(name, other, tick, top);
      const line = provider.completeSync!(prompt);
      commit(world, cfg, mem, tick, 'say', `“${line}” — to ${other}`, prompt, line);
      mem.lastSpokeTick = tick;
      emitEvent(world, 'dialogue', `${name} to ${other}: “${line}”`);
      budget--;
      break; // one conversation per tile
    }
  }
  return budget;
}
