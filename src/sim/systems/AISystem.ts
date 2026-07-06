// The "soul" layer (M5), kept off the hot path and rare. On a per-agent schedule an
// agent reflects (memories → a belief), and at meaningful moments it also speaks,
// dreams, or resolves. Two code paths share the SAME eligibility + prompts:
//   • a deterministic provider (the stub) exposes `completeSync`, so the line is
//     produced inline, recorded, and the run replays exactly (M5 / D19).
//   • an async live model (Ollama) has no `completeSync`, so the prompt is submitted
//     to the AIRunner off the hot path (M7.5) and the result is applied + recorded on
//     a later tick — never blocking the tick, falling back to the stub on timeout.
// The generated TEXT stays flavour — but the inner life it narrates now ACTS (M13 s2,
// D26): a dream tilts the waking mood and consolidates the soul's poles; a vow is sworn
// under an alignment whose riders bias behaviour (alms / malice / steadfast / free
// spirit, read by VowSystem / CrimeSystem / MentalStateSystem / ActionSystem); and a
// conversation touches the pair — gladdening friends, stinging rivals, cooling or
// inflaming feuds by the speaker's law pole. Every effect derives from durable STATE
// (never from the generated words), so a live model and the stub steer identically.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_MEMORY, C_POSITION, C_RELATIONSHIPS, C_CLOCK, C_AIRUNNER, C_ALIGNMENT, C_PERSONALITY } from '../components.ts';
import type { Agent, Memory, Position, Relationships, Clock, Alignment, Personality } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import type { AIProvider } from '../../ai/provider.ts';
import { hashString } from '../../ai/provider.ts';
import { stubProvider } from '../../ai/stubProvider.ts';
import { AIRunner } from '../../ai/aiRunner.ts';
import {
  retrieve, distill, remember, CHILD_VOW_SET, soulCue,
  buildReflectionPrompt, buildDreamPrompt, buildDecisionPrompt,
} from '../../ai/memory.ts';
import { recordResponse } from '../../ai/recording.ts';
import { generateConversation } from '../../ai/dialogue.ts';
import type { Relationship } from '../../ai/dialogue.ts';
import { alignKey, alignmentName, goodPole, lawPole } from '../heredity.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { logConversation } from '../../history/conversation.ts';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const clampPN = (x: number): number => Math.max(-1, Math.min(1, x));

// Where sleep's consolidation pulls a held pole (M13 s2): a stable ARCHETYPE at ±0.6, not the
// rim. Hardcoded like the MoodSystem circumstance weights — the dreamAlignDrift rate in config
// scales how fast souls settle onto it.
const POLE_ANCHOR = 0.6;

// The soul cue for a prompt, from the agent's alignment (absent → no cue, theme voice only).
function soulOf(world: World, e: EntityId): { cue: string; key?: ReturnType<typeof alignKey> } {
  const al = world.getComponent<Alignment>(e, C_ALIGNMENT);
  if (!al) return { cue: '' };
  return { cue: soulCue(alignmentName(al).toLowerCase()), key: alignKey(al) };
}

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

    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    const name = agent.name;

    // CAUSAL distillate (D26), deterministic: a drive + vow that steers behaviour
    // (ActionSystem reads `purpose`). Children distil an age-appropriate vow (the Kids
    // Pass); a changed vow is a turning point worth a feed line — and a child vow giving
    // way to an adult one is a coming-of-age, a remembered milestone of growing up.
    // A grown vow is sworn in the soul's own register (M13 s2): the nine-cell alignment
    // picks the wording, and the key is RECORDED (`vowAlign`) — its poles drive the vow
    // riders (alms / malice / steadfast / free spirit) until the next reflection.
    const isChild = ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears;
    const prevVow = mem.vow;
    const soul = soulOf(world, e);
    const d = distill(mem.events, isChild, soul.key ?? 'TN');
    mem.purpose = d.purpose;
    mem.vow = d.vow;
    mem.vowAlign = isChild ? undefined : soul.key;   // a child's vow carries no rider — the soul is still forming
    // Alignment drifts with the life lived (M13): bonds & resilience (purpose > 0) lean toward
    // good; loss & withdrawal (purpose < 0) harden toward self-interest. Small + deterministic.
    // DAMPED toward the rim (M13 s2): × (1 − |good|), so a warm life mellows a soul but no
    // longer saturates the whole town into Neutral Good over a lifetime of reflections — a
    // born villain in a kind town softens toward neutral, it doesn't flip to sainthood.
    const align = world.getComponent<Alignment>(e, C_ALIGNMENT);
    if (align && d.purpose !== 0) align.good = Math.max(-1, Math.min(1, align.good + Math.sign(d.purpose) * 0.04 * (1 - Math.abs(align.good))));
    // Mid-life trauma reshapes personality (M13): a life sunk in loss hardens the soul.
    const pers = world.getComponent<Personality>(e, C_PERSONALITY);
    if (pers && d.purpose < -0.2 && pers.trait !== 'hardened') {
      pers.trait = 'hardened';
      emitEvent(world, 'decide', `${name} grew hardened by loss.`);
    }
    if (mem.vow !== prevVow) {
      if (!isChild && prevVow != null && CHILD_VOW_SET.has(prevVow)) {
        emitEvent(world, 'decide', `${name} comes of age, resolving ${d.vow}.`);
        remember(world, e, tick, 'came of age', 0.6);
      } else {
        emitEvent(world, 'decide', `${name} resolves ${d.vow}.`);
      }
    }

    const top = retrieve(mem, `${name}'s life`, env.provider, cfg.reflectMemories);
    const prompt = buildReflectionPrompt(name, tick, top, soul.cue);
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
    const soul = soulOf(world, e);
    const prompt = buildDreamPrompt(agent.name, tick, top, soul.cue);
    mem.lastDreamTick = tick;

    // Dreams ACT (M13 s2, D26) — applied SYNCHRONOUSLY at the prompt tick, like reflectPass's
    // causal parts, because they derive from durable state and never from the generated words.
    // (Inside the dispatch callback they'd land at the async live-model's drain tick — a wall-
    // clock-dependent moment — and live runs would stop replaying exactly. Only the TEXT, which
    // is recorded, belongs in the callback.)
    // (1) The night's rest tilts the waking mood: a grief-laden life (purpose < 0) dreams
    // troubled and wakes lower — unless the soul is EVIL, which relishes the dark and wakes
    // whetted. (2) Sleep consolidates who you are: a pole the soul holds (|axis| > 0.33) is
    // drawn toward the POLE ANCHOR (±0.6) — an archetype, not the rim. The pull is two-sided
    // (a soul at −1 eases back toward −0.6), so no alignment state is ever absorbing, and near
    // the ±0.33 fence it stays weaker than the reflection drift — a warm life can still pull
    // a villain back across (redemption remains winnable).
    const al = world.getComponent<Alignment>(e, C_ALIGNMENT);
    if (agent.mood !== undefined) {
      const troubled = (mem.purpose ?? 0) < -0.05 && (al?.good ?? 0) >= -0.33;
      agent.mood = clamp01(agent.mood + (troubled ? -cfg.dreamMoodNudge : cfg.dreamMoodNudge));
    }
    if (al) {
      if (Math.abs(al.good) > 0.33) al.good = clampPN(al.good + cfg.dreamAlignDrift * (POLE_ANCHOR * Math.sign(al.good) - al.good));
      if (Math.abs(al.law) > 0.33) al.law = clampPN(al.law + cfg.dreamAlignDrift * (POLE_ANCHOR * Math.sign(al.law) - al.law));
    }

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
    const prompt = buildDecisionPrompt(name, last.text, tick, top, soulOf(world, e).cue);
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

// Folk who stand together hold a real **conversation** — an opener and a reply (sometimes a
// rejoinder), coloured by both moods and their relationship: warm friends & partners, weary souls
// leaning on each other, or rivals trading cold words (the M29 grudges finally find a voice). The
// exchange is generated deterministically (no sim RNG, replay-safe), logged whole for the
// Conversation tab, and announced by its opening line in the feed.
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

  const TALK_TYPES = new Set(['partner', 'friend', 'rival']);
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
    let kind: Relationship | undefined;
    for (const [dx, dy] of NEIGH) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || nx >= cfg.gridWidth || ny < 0 || ny >= cfg.gridHeight) continue;
      const here = byTile.get(ny * cfg.gridWidth + nx);
      if (!here) continue;
      listener = here.find(o => o !== speaker && !spoken.has(o) && TALK_TYPES.has(rel.edges[o]?.type ?? ''));
      if (listener !== undefined) { kind = rel.edges[listener]!.type as Relationship; break; }
    }
    if (listener === undefined || kind === undefined) continue;

    const a = world.getComponent<Agent>(speaker, C_AGENT)!;
    const b = world.getComponent<Agent>(listener, C_AGENT)!;
    const soulA = soulOf(world, speaker), soulB = soulOf(world, listener);
    const convo = generateConversation(
      `${speaker}.${listener}.${tick}`,
      { name: a.name, mood: a.mood ?? 0.6, align: soulA.key }, { name: b.name, mood: b.mood ?? 0.6, align: soulB.key }, kind,
    );

    mem.lastSpokeTick = tick;
    const lmem = world.getComponent<Memory>(listener, C_MEMORY);
    if (lmem) lmem.lastSpokeTick = tick;   // a reply counts as their turn too
    spoken.add(speaker); spoken.add(listener);

    logConversation(world, { tick, participants: [a.name, b.name], rel: kind, lines: convo });
    // The whole exchange lives in the Conversation tab; the feed shows just its opening line.
    emitEvent(world, 'dialogue', `${convo[0].speaker} to ${b.name === convo[0].speaker ? a.name : b.name}: “${convo[0].text}”`);
    pushUtterance(mem, cfg, tick, 'say', `“${convo[0].text}” — to ${b.name}`);
    if (lmem && convo[1]) pushUtterance(lmem, cfg, tick, 'say', `“${convo[1].text}” — to ${a.name}`);

    // Talk TOUCHES the pair (M13 s2, D26) — bounded, deterministic, state-derived. A friendly
    // exchange gladdens both (and a GOOD-pole speaker's word to a low listener lands harder —
    // the kind console); a rival exchange stings both, and the speaker's LAW pole moves the
    // feud itself: lawful restraint cools the grudge a notch, chaotic heat deepens it. Edges
    // are only ever adjusted where a rivalry already stands — words never invent a feud.
    if (kind === 'rival') {
      if (a.mood !== undefined) a.mood = clamp01(a.mood - cfg.talkRivalSting);
      if (b.mood !== undefined) b.mood = clamp01(b.mood - cfg.talkRivalSting);
      const pole = soulA.key ? lawPole(soulA.key) : 'N';
      const delta = pole === 'L' ? cfg.talkFeudDelta : pole === 'C' ? -cfg.talkFeudDelta : 0;
      if (delta !== 0) {
        for (const [va, vb] of [[speaker, listener], [listener, speaker]] as const) {
          const edge = world.getComponent<Relationships>(va, C_RELATIONSHIPS)?.edges[vb];
          if (edge && edge.type === 'rival') edge.sentiment = Math.max(-1, Math.min(1, edge.sentiment + delta));
        }
      }
    } else {
      if (a.mood !== undefined) a.mood = clamp01(a.mood + cfg.talkMoodLift);
      if (b.mood !== undefined) {
        const comfort = soulA.key && goodPole(soulA.key) === 'G' && b.mood < 0.5 ? cfg.talkComfort : 0;
        b.mood = clamp01(b.mood + cfg.talkMoodLift + comfort);
      }
    }
    budget--;
  }
  return budget;
}
