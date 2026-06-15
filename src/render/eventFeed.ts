// A live activity feed pinned to the screen — the town's day-to-day drama scrolls
// past as it happens (births, weddings, deaths, new jobs, spells, spent veins).
// Reads the EventLog singleton each frame.
import type { World } from '../sim/ecs.ts';
import { C_EVENTLOG } from '../sim/components.ts';
import { recentEvents } from '../history/eventlog.ts';
import type { EventLogData, EventKind } from '../history/eventlog.ts';

const KIND_COLOR: Record<EventKind, string> = {
  birth:    '#8fe88f',
  death:    '#9a9aa6',
  marriage: '#ff9ad0',
  work:     '#ffd24a',
  magic:    '#d090f0',
  illness:  '#ff9a6a',
  resource: '#c8a06a',
  reflect:  '#a0d0ff',
};
const KIND_GLYPH: Record<EventKind, string> = {
  birth: '✚', death: '†', marriage: '❤', work: '⚒', magic: '✦', illness: '☣', resource: '⛏', reflect: '☼',
};

export class EventFeed {
  private readonly panel: HTMLDivElement;
  private lastTopTick = -1;
  private lastCount = -1;

  constructor() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', left: '12px', bottom: '64px', width: '300px', maxHeight: '40vh',
      overflow: 'hidden', background: 'rgba(8,8,22,0.82)', color: '#dde',
      font: '11px/1.5 monospace', padding: '10px 12px', borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.1)', zIndex: '4', pointerEvents: 'none',
    });
    document.body.appendChild(this.panel);
  }

  render(world: World): void {
    const ents = world.query(C_EVENTLOG);
    const log = ents.length ? world.getComponent<EventLogData>(ents[0], C_EVENTLOG) : undefined;
    const events = log ? recentEvents(log, 16) : [];
    // Only rebuild the DOM when the feed actually changed.
    const top = events[0]?.tick ?? -1;
    if (top === this.lastTopTick && events.length === this.lastCount) return;
    this.lastTopTick = top; this.lastCount = events.length;

    const rows = events.map(e => {
      const col = KIND_COLOR[e.kind];
      return `<div style="margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">` +
        `<span style="color:${col}">${KIND_GLYPH[e.kind]}</span> ${e.text}</div>`;
    }).join('');
    this.panel.innerHTML =
      `<div style="color:#ffd278;font-weight:bold;margin-bottom:6px">Town Happenings</div>` +
      (rows || '<div style="color:#778">quiet for now…</div>');
  }
}
