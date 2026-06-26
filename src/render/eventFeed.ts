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
  friendship: '#7fd0c0',
  work:     '#ffd24a',
  magic:    '#d090f0',
  illness:  '#ff9a6a',
  resource: '#c8a06a',
  reflect:  '#a0d0ff',
  dialogue: '#bfe3ff',
  dream:    '#c9b6ff',
  decide:   '#ffcaa0',
  culture:  '#e6b0ff',
  crime:    '#ff6a6a',
  event:    '#ffe08a',
  disaster: '#ff5a3c',
};
const KIND_GLYPH: Record<EventKind, string> = {
  birth: '✚', death: '†', marriage: '❤', friendship: '⊕', work: '⚒', magic: '✦', illness: '☣', resource: '⛏',
  reflect: '☼', dialogue: '❝', dream: '☾', decide: '➜', culture: '◈', crime: '⚖', event: '✷', disaster: '⚠',
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
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      },
    });
    // The header stays put while the list scrolls inside the remaining height — without
    // this the lower lines were clipped by the panel's max-height. `minHeight:0` lets the
    // flex child actually shrink so it scrolls instead of overflowing the window.
    Object.assign(body.style, {
      flex: '1 1 auto', minHeight: '0', overflowY: 'auto', overflowX: 'hidden',
    } as Partial<CSSStyleDeclaration>);
    this.panel = panel;
    this.body = body;
    document.body.appendChild(panel);
  }

  /** Hide/show the whole feed (hotkey H), like the legend (L). */
  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'flex' : 'none';
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
      return `<div style="margin:2px 0;overflow-wrap:anywhere">` +
        `<span style="color:${col}">${KIND_GLYPH[e.kind]}</span> ${e.text}</div>`;
    }).join('');
    this.body.innerHTML = rows || '<div style="color:#778">quiet for now…</div>';
  }
}
