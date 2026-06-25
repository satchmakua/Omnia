// The Conversation lens (M10 slice 4.5, hotkey V): the town already talks — agents
// speak to adjacent friends/partners, dream, and resolve at turning points (AISystem) —
// but that talk only scrolled past in the Town Happenings ticker, mixed with births and
// deaths. This tab gathers just the *voices*: what folk said aloud, and the inner life
// (dreams, resolutions, settled beliefs). A pure read of the EventLog ring buffer.
import type { World } from '../sim/ecs.ts';
import { C_EVENTLOG } from '../sim/components.ts';
import { recentEvents } from '../history/eventlog.ts';
import type { EventLogData, EventEntry } from '../history/eventlog.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

// The conversational event kinds, with a glyph + colour (matching the inspector's Mind).
const SPOKEN = 'dialogue';
const INNER: Record<string, { glyph: string; color: string }> = {
  decide:  { glyph: '➜', color: '#ffd27a' },
  dream:   { glyph: '☾', color: '#a99fd0' },
  reflect: { glyph: '✦', color: '#9fd0c0' },
};

export class ConversationDashboard extends ModalPanel {
  constructor() { super('Conversation', '620px'); }

  update(world: World): void {
    const ents = world.query(C_EVENTLOG);
    const log = ents.length ? world.getComponent<EventLogData>(ents[0], C_EVENTLOG) : undefined;
    const all: EventEntry[] = log ? recentEvents(log, log.cap) : [];   // newest first
    const spoken = all.filter(e => e.kind === SPOKEN);
    const inner = all.filter(e => !!INNER[e.kind]);

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        What the town is saying — newest first. Folk speak aloud to friends and partners
        they stand beside; alone they dream, resolve, and settle on beliefs. (Whether a line
        warms a friendship depends on a shared tongue — see the Language tab.)</div>`;

    this.body.innerHTML = intro + this.spokenHtml(spoken) + this.innerHtml(inner);
  }

  private spokenHtml(rows: EventEntry[]): string {
    const body = rows.length
      ? rows.slice(0, 40).map(e =>
          `<div style="color:#b9c6e6;margin:3px 0">❝ ${e.text}</div>`).join('')
      : `<div style="color:#778">No one has spoken aloud yet — folk talk when they stand beside a friend or partner.</div>`;
    return `<div style="${SECTION}">Said aloud${rows.length ? ` <span style="color:#789">(${rows.length})</span>` : ''}</div>${body}`;
  }

  private innerHtml(rows: EventEntry[]): string {
    if (rows.length === 0) return '';
    const body = rows.slice(0, 30).map(e => {
      const m = INNER[e.kind];
      return `<div style="color:${m.color};margin:3px 0">${m.glyph} ${e.text}</div>`;
    }).join('');
    return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
      <div style="${SECTION}">Dreams, resolutions & beliefs</div>${body}`;
  }
}
