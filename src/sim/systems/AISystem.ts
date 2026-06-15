// The "soul" layer (M5), kept off the hot path and rare. On a per-agent schedule,
// an agent with enough memories reflects: it retrieves its most salient memories,
// asks the AIProvider for a belief, and stores it. With the default deterministic
// provider this is synchronous and reproducible; the response is recorded so a
// replay reproduces it exactly. (Async live-model reflection via the AIRunner, and
// dialogue/dreams/decisions, are M5 part 2.)
import type { World } from '../ecs.ts';
import { C_AGENT, C_MEMORY, C_CLOCK } from '../components.ts';
import type { Agent, Memory, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { AIProvider } from '../../ai/provider.ts';
import { hashString } from '../../ai/provider.ts';
import { retrieve, buildReflectionPrompt } from '../../ai/memory.ts';
import { recordResponse } from '../../ai/recording.ts';
import { emitEvent } from '../../history/eventlog.ts';

export function runAISystem(world: World, cfg: SimConfig, provider: AIProvider): void {
  // Only the synchronous deterministic path runs in-loop; async providers (Ollama)
  // are driven by the AIRunner off the hot path (part 2), never blocking the tick.
  if (!provider.completeSync) return;

  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
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
    const belief = provider.completeSync(prompt);

    mem.beliefs.push({ tick, text: belief });
    if (mem.beliefs.length > cfg.maxBeliefs) mem.beliefs.shift();
    mem.lastReflectTick = tick;

    recordResponse(world, tick, hashString(prompt), belief);
    emitEvent(world, 'reflect', `${name} now ${belief}.`);
    budget--;
  }
}
