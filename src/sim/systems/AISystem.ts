// The "soul" layer (M5), kept off the hot path and rare. On a per-agent schedule an
// agent reflects (memories → a belief), and at meaningful moments it also speaks,
// dreams, or resolves. Two code paths share the SAME eligibility + prompts:
//   • a deterministic provider (the stub) exposes `completeSync`, so the line is
//     produced inline, recorded, and the run replays exactly (M5 / D19).
//   • an async live model (Ollama) has no `completeSync`, so the prompt is submitted
//     to the AIRunner off the hot path (M7.5) and the result is applied + recorded on
//     a later tick — never blocking the tick, falling back to the stub on timeout.
// Either way the output is pure flavour: nothing here feeds the mechanical trajectory.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_MEMORY, C_POSITION, C_RELATIONSHIPS, C_CLOCK, C_AIRUNNER } from '../components.ts';
import type { Agent, Memory, Position, Relationships, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { AIProvider } from '../../ai/provider.ts';
import { hashString } from '../../ai/provider.ts';
import { stubProvider } from '../../ai/stubProvider.ts';
import { AIRunner } from '../../ai/aiRunner.ts';
import {
  retrieve, buildReflectionPrompt, buildDreamPrompt, buildDialoguePrompt, buildDecisionPrompt,
} from '../../ai/memory.ts';
import { recordResponse } from '../../ai/recording.ts';
import { emitEvent } from '../../history/eventlog.ts';

// Persists across ticks for the async (live-model) path: the queue and the pending
// jobs whose results we still need to apply.
interface AIRunnerState {
  runner: AIRunner;
  pending: Map<string, (text: string, tick: number) => void>;
}

interface Env {
  world: World;
  cfg: SimConfig;
  tick: number;
  provider: AIProvider;
  sync: boolean;
  state?: AIRunnerState;   // async only
}

export function runAISystem(world: World, cfg: SimConfig, provider: AIProvider): void {
  const clockEnts = world.query(C_CLOCK);
  const clock = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK) : undefined;
  const tick = clock?.tick ?? 0;
  const isDay = clock?.isDay ?? true;

  const sync = !!provider.completeSync;
  let state: AIRunnerState | undefined;
  if (!sync) {
    state = runnerState(world, provider, cfg);
    for (const r of state.runner.drain()) {            // apply finished model calls
      const apply = state.pending.get(r.id);
      if (apply) { state.pending.delete(r.id); apply(r.text, tick); }
    }
  }

  const env: Env = { world, cfg, tick, provider, sync, state };
  reflectPass(env);
  expressPass(env, isDay);
}

function runnerState(world: World, provider: AIProvider, cfg: SimConfig): AIRunnerState {
  const ents = world.query(C_AIRUNNER);
  if (ents.length) return world.getComponent<AIRunnerState>(ents[0], C_AIRUNNER)!;
  const state: AIRunnerState = { runner: new AIRunner(provider, cfg.aiConcurrency, cfg.aiTimeoutMs), pending: new Map() };
  world.addComponent<AIRunnerState>(world.createEntity(), C_AIRUNNER, state);
  return state;
}

// Produce the line for `prompt` and run `apply` on it. Sync: immediately. Async:
// submit it (with a deterministic stub fallback) and apply when it returns; a prompt
// already in flight is ignored. The agent's throttle is set by the caller *before*
// dispatch, so a slow async call never re-submits.
function dispatch(env: Env, agent: EntityId, prompt: string, apply: (text: string, tick: number) => void): void {
  if (env.sync) { apply(env.provider.completeSync!(prompt), env.tick); return; }
  const st = env.state!;
  const id = `${agent}:${hashString(prompt)}`;
  if (st.pending.has(id)) return;
  st.pending.set(id, apply);
  st.runner.submit(id, prompt, stubProvider.completeSync(prompt));
}

function pushUtterance(mem: Memory, cfg: SimConfig, tick: number, kind: 'say' | 'dream' | 'decide', display: string): void {
  mem.utterances.push({ tick, kind, text: display });
  if (mem.utterances.length > cfg.maxUtterances) mem.utterances.shift();
}

// ── Reflection: memories distil into a durable belief. ──────────────────────────
function reflectPass(env: Env): void {
  const { world, cfg, tick } = env;
  const interval = cfg.reflectionIntervalDays * cfg.ticksPerDay;
  let budget = cfg.maxReflectionsPerTick;

  for (const e of world.query(C_AGENT, C_MEMORY)) {
    if (budget <= 0) break;
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (mem.events.length < cfg.minMemoriesToReflect) continue;
    if (tick - mem.lastReflectTick < interval) continue;

    const name = world.getComponent<Agent>(e, C_AGENT)!.name;
    const top = retrieve(mem, `${name}'s life`, env.provider, cfg.reflectMemories);
    const prompt = buildReflectionPrompt(name, tick, top);
    mem.lastReflectTick = tick;

    dispatch(env, e, prompt, (text, at) => {
      const m = world.getComponent<Memory>(e, C_MEMORY);
      if (!m) return;
      m.beliefs.push({ tick: at, text });
      if (m.beliefs.length > cfg.maxBeliefs) m.beliefs.shift();
      recordResponse(world, at, hashString(prompt), text);
      emitEvent(world, 'reflect', `${name} now ${text}.`);
    });
    budget--;
  }
}

// ── Expression: dreams, dialogue, and decisions (one shared per-tick budget). ────
function expressPass(env: Env, isDay: boolean): void {
  let budget = env.cfg.maxExpressionsPerTick;
  if (budget <= 0) return;
  const interval = env.cfg.expressionIntervalDays * env.cfg.ticksPerDay;

  if (!isDay) budget = dreamPass(env, interval, budget);
  budget = decisionPass(env, interval, budget);
  dialoguePass(env, interval, budget);
}

function dreamPass(env: Env, interval: number, budget: number): number {
  const { world, cfg, tick } = env;
  for (const e of world.query(C_AGENT, C_MEMORY)) {
    if (budget <= 0) break;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (agent.action !== 'sleep') continue;
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (mem.events.length < cfg.minMemoriesToReflect) continue;
    if (tick - mem.lastDreamTick < interval) continue;

    const top = retrieve(mem, `${agent.name}'s dream`, env.provider, cfg.reflectMemories);
    const prompt = buildDreamPrompt(agent.name, tick, top);
    mem.lastDreamTick = tick;

    dispatch(env, e, prompt, (text, at) => {
      const m = world.getComponent<Memory>(e, C_MEMORY);
      if (!m) return;
      pushUtterance(m, cfg, at, 'dream', text);
      recordResponse(world, at, hashString(prompt), text);
      emitEvent(world, 'dream', `${agent.name} ${text}.`);
    });
    budget--;
  }
  return budget;
}

function decisionPass(env: Env, interval: number, budget: number): number {
  const { world, cfg, tick } = env;
  for (const e of world.query(C_AGENT, C_MEMORY)) {
    if (budget <= 0) break;
    const mem = world.getComponent<Memory>(e, C_MEMORY)!;
    if (mem.events.length === 0) continue;
    const last = mem.events[mem.events.length - 1];
    if (last.importance < cfg.decisionImportance) continue;
    if (last.tick <= mem.lastSpokeTick) continue;
    if (tick - mem.lastSpokeTick < interval) continue;

    const name = world.getComponent<Agent>(e, C_AGENT)!.name;
    const top = retrieve(mem, last.text, env.provider, cfg.reflectMemories);
    const prompt = buildDecisionPrompt(name, last.text, tick, top);
    mem.lastSpokeTick = tick;

    dispatch(env, e, prompt, (text, at) => {
      const m = world.getComponent<Memory>(e, C_MEMORY);
      if (!m) return;
      pushUtterance(m, cfg, at, 'decide', text);
      recordResponse(world, at, hashString(prompt), text);
      emitEvent(world, 'decide', `${name} ${text}.`);
    });
    budget--;
  }
  return budget;
}

// The 8-neighbourhood + own tile — "standing together" now means adjacent, since
// collision (M6.5) keeps two folk off the same tile.
const NEIGH: readonly [number, number][] = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

function dialoguePass(env: Env, interval: number, budget: number): number {
  const { world, cfg, tick } = env;
  if (budget <= 0) return budget;

  const ents = world.query(C_AGENT, C_MEMORY, C_POSITION);
  const byTile = new Map<number, EntityId[]>();
  for (const e of ents) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    const list = byTile.get(p.y * cfg.gridWidth + p.x);
    if (list) list.push(e); else byTile.set(p.y * cfg.gridWidth + p.x, [e]);
  }

  const spoken = new Set<EntityId>();
  for (const speaker of [...ents].sort((a, b) => a - b)) {
    if (budget <= 0) break;
    if (spoken.has(speaker)) continue;
    const mem = world.getComponent<Memory>(speaker, C_MEMORY)!;
    if (mem.events.length < cfg.minMemoriesToReflect) continue;
    if (tick - mem.lastSpokeTick < interval) continue;
    const rel = world.getComponent<Relationships>(speaker, C_RELATIONSHIPS);
    if (!rel) continue;
    const p = world.getComponent<Position>(speaker, C_POSITION)!;

    let listener: EntityId | undefined;
    for (const [dx, dy] of NEIGH) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || nx >= cfg.gridWidth || ny < 0 || ny >= cfg.gridHeight) continue;
      const here = byTile.get(ny * cfg.gridWidth + nx);
      if (!here) continue;
      listener = here.find(o => o !== speaker && !spoken.has(o) &&
        (rel.edges[o]?.type === 'partner' || rel.edges[o]?.type === 'friend'));
      if (listener !== undefined) break;
    }
    if (listener === undefined) continue;

    const name = world.getComponent<Agent>(speaker, C_AGENT)!.name;
    const other = world.getComponent<Agent>(listener, C_AGENT)!.name;
    const top = retrieve(mem, `${name} and ${other}`, env.provider, cfg.reflectMemories);
    const prompt = buildDialoguePrompt(name, other, tick, top);
    mem.lastSpokeTick = tick;
    spoken.add(speaker); spoken.add(listener);

    dispatch(env, speaker, prompt, (text, at) => {
      const m = world.getComponent<Memory>(speaker, C_MEMORY);
      if (!m) return;
      pushUtterance(m, cfg, at, 'say', `“${text}” — to ${other}`);
      recordResponse(world, at, hashString(prompt), text);
      emitEvent(world, 'dialogue', `${name} to ${other}: “${text}”`);
    });
    budget--;
  }
  return budget;
}
