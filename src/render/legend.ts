// The on-screen legend key (M6.5): a small minimizable panel that names every map
// symbol, so the category-first icons are self-explanatory. Built once from the
// shared icons module; minimized via its header caret, or hidden with the 'L' key.
import { CATEGORY_COLOR, LEGEND_ENTRIES } from './icons.ts';
import { glyphHtml } from './skin.ts';
import { makePanel } from './panelUtil.ts';

// A legend swatch — the active skin's glyph for `key` (lo-fi icon or emoji); `scale` < 1 shrinks it.
function swatch(key: string, color: string, scale = 1): string {
  return `<span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:#12131c;
    align-items:center;justify-content:center;flex:0 0 auto">${glyphHtml(key, color, 22, scale)}</span>`;
}

// A glyph badge in a swatch-sized box (so badges line up with the icon rows).
function glyphCell(glyph: string, color: string): string {
  return `<span style="display:inline-flex;width:24px;height:24px;border-radius:5px;background:#12131c;
    align-items:center;justify-content:center;flex:0 0 auto;color:${color};font:13px monospace">${glyph}</span>`;
}

// One legend row: a cell (swatch or glyph) + a name and a "what it represents" line.
function entryRow(cell: string, name: string, desc: string): string {
  return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">${cell}
    <span style="line-height:1.25"><b style="color:#dde">${name}</b>` +
    `<br><span style="color:#889;font-size:10px">${desc}</span></span></div>`;
}

function sectionLabel(text: string): string {
  return `<div style="margin:9px 0 3px;color:#9ab;text-transform:uppercase;font-size:10px;letter-spacing:1px;
    border-top:1px solid rgba(255,255,255,0.08);padding-top:7px">${text}</div>`;
}

export class Legend {
  private readonly panel: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private visible = true;

  constructor() {
    const { panel, body } = makePanel({
      title: 'Legend',
      style: { position: 'fixed', left: '12px', top: '40px', width: '186px' },
    });
    this.panel = panel;
    this.body = body;
    // Scrollable, so the list can grow as more icons/badges are added.
    Object.assign(body.style, { maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px' } as Partial<CSSStyleDeclaration>);
    this.build();
    document.body.appendChild(this.panel);
  }

  // Rebuild the key in the active skin — called once at startup and whenever the skin changes (M34).
  refresh(): void { this.build(); }

  private build(): void {
    const folk = CATEGORY_COLOR.folk;
    const mapRows = LEGEND_ENTRIES.map(({ key, label, desc }) =>
      entryRow(swatch(key, CATEGORY_COLOR[key as keyof typeof CATEGORY_COLOR]), label, desc)).join('');

    // Folk badges + the day/night phase. These small state overlays frame the folk in *both* skins
    // (the emoji map draws them around the glyph, M34 parity), so the list applies regardless.
    const badgeRows =
      entryRow(swatch('folk', folk, 0.6), 'Child', 'too young to work, court, or bear children') +
      entryRow(glyphCell('✦', '#c79bf0'), 'Magic spark', 'born with a rare magic aptitude') +
      entryRow(glyphCell('✚', '#e06666'), 'Ill', 'sick — at higher risk of death') +
      entryRow(glyphCell('|||', '#ffd24a'), 'Seeking food', 'hungry — off to forage or hunt') +
      entryRow(glyphCell('⊥', '#ffd24a'), 'Working', 'at a job, earning gold') +
      entryRow(glyphCell('☾', '#9fb6d9'), 'Sleeping', 'resting to recover energy') +
      entryRow(glyphCell('··', '#9ab'), 'Chatting', 'socialising with a neighbour') +
      entryRow(glyphCell('‿', '#7fd6b0'), 'At leisure', 'relaxing — playing, drinking, unwinding') +
      entryRow(glyphCell('▲', '#e0a0a0'), 'Mental break', 'mood at an extreme — ▼ despair · ▲ rage · ★ joy') +
      entryRow(glyphCell('⚑', '#ffd278'), 'On a quest', 'pursuing a goal — to hunt, avenge, or explore') +
      entryRow(glyphCell('⚔', '#d6dae4'), 'Veteran', 'has fought — scars or kills to their name') +
      entryRow(glyphCell('⚖', '#ff7a7a'), 'Outlaw', 'a known criminal — theft, assault, or worse') +
      entryRow(glyphCell('☀', '#ffe08a'), 'Day / night', '☀ daytime · ☾ night');

    this.body.innerHTML =
      mapRows +
      (badgeRows ? sectionLabel('Folk badges') + badgeRows : '') +
      `<div style="margin-top:9px;color:#667;font-size:10px">L hide · H happenings · Esc menu</div>`;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
  }
}
