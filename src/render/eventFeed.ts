// A live activity feed pinned to the screen — the town's day-to-day drama scrolls
// past as it happens (births, weddings, deaths, new jobs, spells, spent veins).
// Reads the EventLog singleton each frame. Minimizable via its header caret (M6.5).
import type { World } from '../sim/ecs.ts';
import { C_EVENTLOG } from '../sim/components.ts';
import { recentEvents } from '../history/eventlog.ts';
import type { EventLogData, EventKind } from '../history/eventlog.ts';
import { makePanel } from './panelUtil.ts';

const KIND_COLOR: Record<EventKind, string> = {
  birth:    '#8fe88f',
  death:    '#9a9aa6',
  marriage: '#ff9ad0',
  work:     '#ffd24a',
  magic:    '#d090f0',
  illness:  '#ff9a6a',
  resource: '#c8a06a',
  reflect:  '#a0d0ff',
  dialogue: '#bfe3ff',
  dream:    '#c9b6ff',
  decide:   '#ffcaa0',
  culture:  '#e6b0ff',
};
const KIND_GLYPH: Record<EventKind, string> = {
  birth: '✚', death: '†', marriage: '❤', work: '⚒', magic: '✦', illness: '☣', resource: '⛏',
  reflect: '☼', dialogue: '❝', dream: '☾', decide: '➜', culture: '◈',
};

export class EventFeed {
  private readonly panel: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private visible = true;
  private lastTopTick = -1;
  private lastCount = -1;

  constructor() {
    const { panel, body } = makePanel({
      title: 'Town Happenings',
      style: {
        position: 'fixed', left: '12px', bottom: '64px', width: '300px', maxHeight: '40vh',
        overflow: 'hidden',
      },
    });
    this.panel = panel;
    this.body = body;
    document.body.appendChild(panel);
  }

  /** Hide/show the whole feed (hotkey H), like the legend (L). */
  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
  }

  render(world: World): void {
    const ents = world.query(C_EVENTLOG);
    const log = ents.length ? world.getComponent<EventLogData>(ents[0], C_EVENTLOG) : undefined;
    const events = log ? recentEvents(log, 16) : [];
    const top = events[0]?.tick ?? -1;
    if (top === this.lastTopTick && events.length === this.lastCount) return;
    this.lastTopTick = top; this.lastCount = events.length;

    const rows = events.map(e => {
      const col = KIND_COLOR[e.kind];
      return `<div style="margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">` +
        `<span style="color:${col}">${KIND_GLYPH[e.kind]}</span> ${e.text}</div>`;
    }).join('');
    this.body.innerHTML = rows || '<div style="color:#778">quiet for now…</div>';
  }
}
