import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import { C_EVENTLOG, C_CLOCK } from '../src/sim/components.ts';
import { createEventLog, logEvent, recentEvents, emitEvent } from '../src/history/eventlog.ts';
import type { EventLogData } from '../src/history/eventlog.ts';

describe('EventLog', () => {
  it('keeps only the most recent `cap` events (ring buffer)', () => {
    const log = createEventLog(3);
    for (let i = 0; i < 5; i++) logEvent(log, { tick: i, kind: 'work', text: `e${i}` });
    expect(log.entries.length).toBe(3);
    expect(log.entries.map(e => e.text)).toEqual(['e2', 'e3', 'e4']);
  });

  it('recentEvents returns newest-first, limited to n', () => {
    const log = createEventLog();
    for (let i = 0; i < 5; i++) logEvent(log, { tick: i, kind: 'birth', text: `e${i}` });
    expect(recentEvents(log, 2).map(e => e.text)).toEqual(['e4', 'e3']);
  });

  it('emitEvent records to the singleton with the current clock tick', () => {
    const w = new World();
    const le = w.createEntity();
    w.addComponent<EventLogData>(le, C_EVENTLOG, createEventLog());
    const ce = w.createEntity();
    w.addComponent(ce, C_CLOCK, { tick: 123, day: 0, hour: 0, isDay: true });

    emitEvent(w, 'marriage', 'X and Y were wed.');
    const log = w.getComponent<EventLogData>(le, C_EVENTLOG)!;
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ tick: 123, kind: 'marriage', text: 'X and Y were wed.' });
  });

  it('emitEvent is a no-op when no log singleton exists', () => {
    const w = new World();
    expect(() => emitEvent(w, 'death', 'nobody')).not.toThrow();
  });
});
