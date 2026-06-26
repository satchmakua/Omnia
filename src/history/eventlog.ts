// A live activity feed: a bounded ring buffer of recent, day-to-day happenings —
// births, deaths, weddings, new jobs, spells, exhausted resource veins. Distinct
// from the Chronicle (which keeps only durable legends): the EventLog is the
// ticker of ordinary drama, capped so it never grows without bound.
import type { World } from '../sim/ecs.ts';
import { C_EVENTLOG, C_CLOCK } from '../sim/components.ts';
import type { Clock } from '../sim/components.ts';

export type EventKind =
  | 'birth' | 'death' | 'marriage' | 'friendship' | 'work' | 'magic' | 'illness' | 'resource'
  | 'reflect' | 'dialogue' | 'dream' | 'decide' | 'culture' | 'crime' | 'event';

export interface EventEntry {
  tick: number;
  kind: EventKind;
  text: string;
  x?: number;   // optional map location (combat events tag where they happened, for on-map FX)
  y?: number;
}

export interface EventLogData {
  entries: EventEntry[];
  cap: number;
}

export function createEventLog(cap = 300): EventLogData {
  return { entries: [], cap };
}

export function logEvent(log: EventLogData, entry: EventEntry): void {
  log.entries.push(entry);
  if (log.entries.length > log.cap) log.entries.shift();
}

// Most recent first.
export function recentEvents(log: EventLogData, n: number): EventEntry[] {
  return log.entries.slice(-n).reverse();
}

// Convenience for systems: look up the singleton log + clock and record an event.
export function emitEvent(world: World, kind: EventKind, text: string, pos?: { x: number; y: number }): void {
  const logEnts = world.query(C_EVENTLOG);
  if (logEnts.length === 0) return;
  const log = world.getComponent<EventLogData>(logEnts[0], C_EVENTLOG)!;
  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  logEvent(log, { tick, kind, text, x: pos?.x, y: pos?.y });
}
