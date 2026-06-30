// The Events lens (M19, hotkey M): a timeline of things that have *befallen* the town —
// the content-driven world events (bountiful harvests, festivals, great discoveries),
// disasters (famine, plague, earthquake), and the paranormal (abductions, hauntings, wild
// magic). A pure read of the EventLog ring buffer, filtered to the world-event kinds and
// shown newest-first with the year — the dedicated legibility view for the event pipeline.
import type { World } from '../sim/ecs.ts';
import { C_EVENTLOG } from '../sim/components.ts';
import { recentEvents } from '../history/eventlog.ts';
import type { EventLogData, EventEntry, EventKind } from '../history/eventlog.ts';
import { ticksPerYear, defaultConfig } from '../sim/config.ts';
import { getStoryteller } from '../event/director.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

const TEMPER_LABEL: Record<string, string> = { measured: 'Measured', calm: 'Calm Chronicler', harsh: 'Hard Times', capricious: 'Capricious' };

const TPY = ticksPerYear(defaultConfig);
const STYLE: Record<string, { glyph: string; color: string; label: string }> = {
  event:      { glyph: '✷', color: '#ffe08a', label: 'fortune' },
  disaster:   { glyph: '⚠', color: '#ff5a3c', label: 'disaster' },
  paranormal: { glyph: '✺', color: '#c77dff', label: 'the uncanny' },
};
const KINDS = Object.keys(STYLE) as EventKind[];

export class EventsDashboard extends ModalPanel {
  constructor() { super('Events', '600px'); }

  update(world: World): void {
    const ents = world.query(C_EVENTLOG);
    const log = ents.length ? world.getComponent<EventLogData>(ents[0], C_EVENTLOG) : undefined;
    const all: EventEntry[] = log ? recentEvents(log, log.cap) : [];   // newest first
    const events = all.filter(e => KINDS.includes(e.kind));

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        Things that have befallen the town — newest first. Fortune (harvests, festivals,
        discoveries), disaster (famine, plague, quake), and the uncanny (abductions, hauntings,
        wild magic). Notable ones also enter the Chronicle (see Legends).</div>`;

    // A tally by category among the recent stream.
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    const tally = KINDS.filter(k => counts[k]).map(k =>
      `<span style="color:${STYLE[k].color}">${STYLE[k].glyph} ${counts[k]} ${STYLE[k].label}</span>`).join(' &nbsp; ');

    const rows = events.slice(0, 80).map(e => {
      const s = STYLE[e.kind];
      return `<div style="display:flex;gap:8px;margin:3px 0;align-items:baseline">
        <span style="color:#677;font-size:11px;width:46px;flex:0 0 auto">yr ${Math.floor(e.tick / TPY)}</span>
        <span style="color:${s.color};flex:1">${s.glyph} ${e.text}</span></div>`;
    }).join('');

    this.body.innerHTML =
      this.storytellerHtml(world) +
      `<div style="${SECTION}">Events <span style="color:#789">(${events.length} recent)</span></div>${intro}` +
      (tally ? `<div style="margin-bottom:8px">${tally}</div>` : '') +
      (rows || '<div style="color:#778">Nothing has happened yet — the world is quiet. Harvests, disasters, and stranger things come in time.</div>');
  }

  // The Storyteller (M32): the adaptive director that paces drama to the world's health. Shown so the
  // player can read the world's current temper — a placid town earns calamity, a reeling one respite.
  private storytellerHtml(world: World): string {
    const st = getStoryteller(world);
    if (!st) return '';
    const calm = st.calm;
    const m = calm >= 0.7 ? { t: 'at peace', c: '#7fd6b0', n: 'calamity is more likely to come' }
      : calm >= 0.45 ? { t: 'settled', c: '#9ec6e0', n: 'the world bides its time' }
      : calm >= 0.3 ? { t: 'uneasy', c: '#e6b15a', n: 'fortune is on the wind' }
      : { t: 'reeling', c: '#ff7a6a', n: 'the world owes it a respite' };
    const temper = TEMPER_LABEL[st.temperament] ?? st.temperament;
    const pct = Math.round(Math.max(0, Math.min(1, calm)) * 100);
    const bar = `<div style="height:7px;border-radius:4px;background:rgba(255,255,255,0.08);overflow:hidden;margin:5px 0 2px">
        <div style="height:100%;width:${pct}%;background:${m.c};border-radius:4px"></div></div>`;
    return `<div style="${SECTION}">The Storyteller</div>
      <div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:4px">
        An unseen hand paces the drama — <b style="color:#cfc">${temper}</b>. A placid, thriving town earns
        calamity; a battered one earns fortune and a respite.</div>
      <div style="font-size:11px;color:#9ab">The town is <b style="color:${m.c}">${m.t}</b> — ${m.n}.</div>${bar}
      <hr style="border-color:rgba(255,255,255,0.08);margin:10px 0">`;
  }
}
