// The world-event pipeline (M19 slice 1, D9). Once a day it rolls each authored
// event (content/events/*.yaml): if its trigger guards pass (a population floor,
// optionally a season) it fires with probability `chancePerDay`. Firing applies a
// code-side effect (src/event/effects.ts — definitions are data, effects are code),
// writes a line to the live feed, and, if notable enough, records a Chronicle legend.
//
// Deterministic: one RNG draw per event per day; effects draw no RNG of their own,
// so a given seed replays identically. This is the spine seasons, disasters, and the
// paranormal (later M19 slices) all hang off — they're just more event content.
import type { World } from '../ecs.ts';
import { C_CLOCK, C_AGENT, C_CHRONICLE } from '../components.ts';
import type { Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { calendarOf } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { EVENT_EFFECTS } from '../../event/effects.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

export function runEventSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // once per day

  const events = content.events.all();   // deterministic (sorted by id)
  if (events.length === 0) return;

  const population = world.query(C_AGENT).length;
  const season = calendarOf(clock.tick, cfg).season;

  const chronicleEnts = world.query(C_CHRONICLE);
  const chronicle = chronicleEnts.length
    ? world.getComponent<ChronicleData>(chronicleEnts[0], C_CHRONICLE)
    : undefined;

  for (const ev of events) {
    // Trigger guards (the "triggered" half of scheduled+triggered): a population floor,
    // and an optional season restriction. Roll AFTER the guards so a gated-out event
    // consumes no RNG — keeps the trajectory clean when guards exclude it.
    if (population < ev.minPopulation) continue;
    if (ev.season && ev.season !== season) continue;
    if (rng() >= ev.chancePerDay) continue;

    const effect = EVENT_EFFECTS[ev.effect];
    if (effect) effect({ world, cfg });

    emitEvent(world, 'event', ev.message);
    if (chronicle) {
      chronicleAdd(chronicle, { tick: clock.tick, importance: ev.importance, text: ev.message, kind: 'event' },
        cfg.chronicleImportanceThreshold);
    }
  }
}
