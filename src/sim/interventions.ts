// God mode — the player's hand on the world (M27 slice 1). A divine act is **just a recorded event
// in the deterministic log** (D30/D54): the player enqueues an `Intervention`, the InterventionSystem
// applies it on a tick boundary, and the log replays exactly — so determinism + green-main hold and
// observe-only stays the default (god mode is an opt-in toggle). This module is the powers themselves;
// adding one is a new `kind` here (M27 s2 will content-ify the roster). No RNG → replay-safe.
import type { World, EntityId } from './ecs.ts';
import {
  C_INTERVENTIONS, C_CLOCK, C_AGENT, C_NEEDS, C_HEALTH, C_WALLET, C_POSITION, C_CHRONICLE,
} from './components.ts';
import type { InterventionsData, Intervention, Clock, Agent, Needs, Health, Wallet, Position } from './components.ts';
import type { SimConfig } from './config.ts';
import { ticksPerYear } from './config.ts';
import { killAgent } from './death.ts';
import { emitEvent } from '../history/eventlog.ts';
import { chronicleAdd } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';

export function createInterventions(): InterventionsData {
  return { log: [] };
}

function tickOf(world: World): number {
  const ce = world.query(C_CLOCK);
  return ce.length ? world.getComponent<Clock>(ce[0], C_CLOCK)!.tick : 0;
}

/**
 * Enqueue a god-act to apply on the NEXT tick. Recorded into the durable log, so a saved/replayed
 * run reproduces it exactly. Returns the queued intervention (or null if there's no log singleton).
 * Gating on "is god mode on?" is the caller's job (the UI) — the sim just applies what's logged.
 */
export function enqueueIntervention(
  world: World, kind: string, target: EntityId | null, amount?: number,
): Intervention | null {
  const ents = world.query(C_INTERVENTIONS);
  if (!ents.length) return null;
  const data = world.getComponent<InterventionsData>(ents[0], C_INTERVENTIONS)!;
  const iv: Intervention = { tick: tickOf(world) + 1, kind, target, amount, applied: false };
  data.log.push(iv);
  return iv;
}

/** Apply one intervention's effect. Deterministic, no RNG → replay-safe. */
export function applyIntervention(world: World, cfg: SimConfig, iv: Intervention): void {
  const tick = tickOf(world);
  const e = iv.target;
  const chEnts = world.query(C_CHRONICLE);
  const ch = chEnts.length ? world.getComponent<ChronicleData>(chEnts[0], C_CHRONICLE) : undefined;
  const named = (id: EntityId | null) => (id !== null ? world.getComponent<Agent>(id, C_AGENT)?.name : undefined) ?? 'a soul';
  const posOf = (id: EntityId | null) => (id !== null ? world.getComponent<Position>(id, C_POSITION) ?? undefined : undefined);
  const livingTarget = e !== null && world.hasComponent(e, C_AGENT);

  switch (iv.kind) {
    case 'smite': {                 // a bolt from on high — strike a soul down
      if (!livingTarget) break;
      const pos = posOf(e);
      const tomb = killAgent(world, e!, tick, 'struck down by the gods', ticksPerYear(cfg));
      emitEvent(world, 'paranormal', `${tomb.name} was struck down by a bolt from on high.`, pos);
      if (ch) chronicleAdd(ch, { tick, importance: 0.82, kind: 'paranormal', text: `${tomb.name} was struck down by the gods.` }, cfg.chronicleImportanceThreshold);
      break;
    }
    case 'bless': {                 // divine favour — restore body & spirit
      if (!livingTarget) break;
      const needs = world.getComponent<Needs>(e!, C_NEEDS); if (needs) { needs.hunger = 1; needs.energy = 1; needs.social = 1; }
      const h = world.getComponent<Health>(e!, C_HEALTH); if (h) { h.value = 1; h.ill = false; }
      const a = world.getComponent<Agent>(e!, C_AGENT); if (a && a.mood !== undefined) a.mood = Math.min(1, a.mood + 0.4);
      emitEvent(world, 'paranormal', `${named(e)} was touched by divine favour — restored in body and spirit.`, posOf(e));
      break;
    }
    case 'curse': {                 // divine wrath, short of death — sap the body & mood
      if (!livingTarget) break;
      const h = world.getComponent<Health>(e!, C_HEALTH); if (h) h.value = Math.max(0.1, h.value - 0.5);
      const a = world.getComponent<Agent>(e!, C_AGENT); if (a && a.mood !== undefined) a.mood = Math.max(0, a.mood - 0.4);
      emitEvent(world, 'paranormal', `${named(e)} was cursed by the gods — laid low in body and spirit.`, posOf(e));
      break;
    }
    case 'bestow': {                // a gift of gold from the heavens
      if (!livingTarget) break;
      const w = world.getComponent<Wallet>(e!, C_WALLET); const gold = iv.amount ?? 50;
      if (w) w.gold += gold;
      emitEvent(world, 'paranormal', `the gods bestowed ${gold}g upon ${named(e)}.`, posOf(e));
      break;
    }
    // Unknown kinds are ignored (forward-compatible with the M27 s2 content roster).
  }
}
