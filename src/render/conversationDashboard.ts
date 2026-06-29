// The Conversation lens (hotkey V): the town's voices. Folk who stand together now hold a real
// **exchange** — an opener and a reply (sometimes a rejoinder), coloured by their moods and how they
// regard each other (warm friends & partners, weary souls, or rivals trading cold words). This tab
// scrolls through those conversations as threaded dialogues, then the quieter inner life (dreams,
// resolutions, settled beliefs). A pure read of the ConversationLog + the EventLog ring buffers.
import type { World } from '../sim/ecs.ts';
import { C_EVENTLOG, C_CONVOLOG } from '../sim/components.ts';
import { recentEvents } from '../history/eventlog.ts';
import type { EventLogData, EventEntry } from '../history/eventlog.ts';
import { recentConversations } from '../history/conversation.ts';
import type { ConversationLogData, ConversationRecord } from '../history/conversation.ts';
import { defaultConfig, ticksPerYear } from '../sim/config.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

const TPY = ticksPerYear(defaultConfig);
const yr = (tick: number) => Math.floor(tick / TPY);

// Sentiment → the colour a line is spoken in.
const SENT: Record<string, string> = { warm: '#9ad6a8', neutral: '#b9c6e6', low: '#9fb0d0', cold: '#e09090' };
const REL_LABEL: Record<string, string> = { partner: '❤ partners', friend: '◦ friends', rival: '⚔ rivals' };
const REL_COLOR: Record<string, string> = { partner: '#e7a0c0', friend: '#9ab', rival: '#e08a8a' };

const INNER: Record<string, { glyph: string; color: string }> = {
  decide:  { glyph: '➜', color: '#ffd27a' },
  dream:   { glyph: '☾', color: '#a99fd0' },
  reflect: { glyph: '✦', color: '#9fd0c0' },
};

export class ConversationDashboard extends ModalPanel {
  constructor() { super('Conversation', '640px'); }

  update(world: World): void {
    const cEnts = world.query(C_CONVOLOG);
    const clog = cEnts.length ? world.getComponent<ConversationLogData>(cEnts[0], C_CONVOLOG) : undefined;
    const convos = clog ? recentConversations(clog, clog.cap) : [];

    const eEnts = world.query(C_EVENTLOG);
    const elog = eEnts.length ? world.getComponent<EventLogData>(eEnts[0], C_EVENTLOG) : undefined;
    const inner = (elog ? recentEvents(elog, elog.cap) : []).filter(e => !!INNER[e.kind]);

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        The town's voices. Folk speak when they stand beside someone they know — and now they answer
        back. Warmth, weariness, idle news, or the frost between rivals: the tone follows their moods
        and how they regard each other. Below, the quieter inner life — dreams, resolutions, beliefs.</div>`;

    this.body.innerHTML = intro + this.convoHtml(convos) + this.innerHtml(inner);
  }

  private convoHtml(rows: ConversationRecord[]): string {
    if (rows.length === 0) {
      return `<div style="${SECTION}">Conversations</div>
        <div style="color:#778">No one has spoken yet — folk talk when they stand beside someone they know.</div>`;
    }
    const blocks = rows.slice(0, 30).map(c => {
      const head = `<div style="display:flex;justify-content:space-between;margin-bottom:2px">
        <span style="color:#cdd;font-weight:bold">${c.participants[0]} &amp; ${c.participants[1]}</span>
        <span style="font-size:10.5px"><span style="color:${REL_COLOR[c.rel] ?? '#9ab'}">${REL_LABEL[c.rel] ?? c.rel}</span>
          <span style="color:#667"> · yr ${yr(c.tick)}</span></span></div>`;
      const lines = c.lines.map(l =>
        `<div style="margin:1px 0 1px 6px"><span style="color:#8a93a8">${l.speaker}:</span>
          <span style="color:${SENT[l.sentiment] ?? '#b9c6e6'}">“${l.text}”</span></div>`).join('');
      return `<div style="margin:0 0 9px;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:6px;
        border-left:2px solid ${REL_COLOR[c.rel] ?? '#445'}">${head}${lines}</div>`;
    }).join('');
    return `<div style="${SECTION}">Conversations <span style="color:#789">(${rows.length})</span></div>${blocks}`;
  }

  private innerHtml(rows: EventEntry[]): string {
    if (rows.length === 0) return '';
    const body = rows.slice(0, 24).map(e => {
      const m = INNER[e.kind];
      return `<div style="color:${m.color};margin:3px 0">${m.glyph} ${e.text}</div>`;
    }).join('');
    return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
      <div style="${SECTION}">Dreams, resolutions &amp; beliefs</div>${body}`;
  }
}
