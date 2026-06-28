// The Family Forest view (M35): draws the whole-town pedigree (src/history/genealogy.ts) as a
// pan/zoom SVG — founders up top, time flowing down, marriages and descent lines, families by
// colour, the living glowing among the buried. A pure read of sim state (separation holds). Click
// a soul → see them in the detail bar; the living also jump the camera/inspector (focusOn).
// Slice 2 adds filters that focus the forest without rebuilding the graph (just visibility +
// highlight over the fixed layout): a name search, "living lines only", a family picker, and a
// whole-town ⇄ this-person (bloodline) toggle.
import type { World, EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import { defaultConfig } from '../sim/config.ts';
import { buildForest, bloodline, livingLines } from '../history/genealogy.ts';
import type { Forest, ForestNode } from '../history/genealogy.ts';

const MARGIN = 28;
const COL_W = 30;     // horizontal pitch between souls in a row
const GEN_H = 66;     // vertical pitch between generations

export class FamilyForestView {
  readonly el = document.createElement('div');
  private readonly controls = document.createElement('div');
  private readonly search = document.createElement('input');
  private readonly livingChk = document.createElement('input');
  private readonly clanSel = document.createElement('select');
  private readonly focusBtn = document.createElement('button');
  private readonly resetBtn = document.createElement('button');
  private readonly info = document.createElement('div');
  private readonly scroll = document.createElement('div');
  private readonly svgHost = document.createElement('div');
  private zoom = 1;
  private natW = 0;
  private natH = 0;
  private selected: EntityId | null = null;
  private forest: Forest | null = null;
  // filter state
  private q = '';
  private livingOnly = false;
  private clan: string | null = null;
  private focusId: EntityId | null = null;

  constructor(private readonly focusOn: (e: EntityId) => void) {
    this.buildControls();
    Object.assign(this.info.style, { color: '#9ab', fontSize: '12px', lineHeight: '1.5', margin: '6px 0 8px', minHeight: '20px' } as Partial<CSSStyleDeclaration>);
    Object.assign(this.scroll.style, {
      position: 'relative', overflow: 'auto', height: '54vh', background: '#0a0a12',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', cursor: 'grab',
    } as Partial<CSSStyleDeclaration>);
    this.scroll.append(this.svgHost);
    this.el.append(this.controls, this.info, this.scroll);

    this.scroll.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.zoom;
      this.zoom = Math.max(0.3, Math.min(4, this.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      const r = before > 0 ? this.zoom / before : 1;
      const rect = this.scroll.getBoundingClientRect();
      this.applyZoom();
      this.scroll.scrollLeft = (this.scroll.scrollLeft + (e.clientX - rect.left)) * r - (e.clientX - rect.left);
      this.scroll.scrollTop = (this.scroll.scrollTop + (e.clientY - rect.top)) * r - (e.clientY - rect.top);
    }, { passive: false });

    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    this.scroll.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest('[data-id]')) return;
      dragging = true; sx = e.clientX; sy = e.clientY; sl = this.scroll.scrollLeft; st = this.scroll.scrollTop;
      this.scroll.style.cursor = 'grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.scroll.scrollLeft = sl - (e.clientX - sx);
      this.scroll.scrollTop = st - (e.clientY - sy);
    });
    window.addEventListener('mouseup', () => { dragging = false; this.scroll.style.cursor = 'grab'; });

    this.svgHost.addEventListener('click', (e) => {
      const g = (e.target as Element).closest('[data-id]');
      if (g) this.select(Number(g.getAttribute('data-id')));
    });
  }

  private buildControls(): void {
    Object.assign(this.controls.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', margin: '2px 0 2px' } as Partial<CSSStyleDeclaration>);
    Object.assign(this.search.style, {
      flex: '1 1 150px', minWidth: '120px', background: '#10101e', color: '#eee',
      border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '6px 8px', font: '12px monospace',
    } as Partial<CSSStyleDeclaration>);
    this.search.placeholder = 'search a name…';
    this.search.addEventListener('input', () => { this.q = this.search.value; this.draw(); });

    const livingLabel = document.createElement('label');
    Object.assign(livingLabel.style, { color: '#bcd', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' } as Partial<CSSStyleDeclaration>);
    this.livingChk.type = 'checkbox';
    this.livingChk.addEventListener('change', () => { this.livingOnly = this.livingChk.checked; if (this.livingOnly) { this.clan = null; this.clanSel.value = ''; this.focusId = null; } this.draw(); });
    livingLabel.append(this.livingChk, document.createTextNode('living lines'));

    Object.assign(this.clanSel.style, { background: '#10101e', color: '#eee', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '5px 6px', font: '12px monospace' } as Partial<CSSStyleDeclaration>);
    this.clanSel.addEventListener('change', () => { this.clan = this.clanSel.value || null; if (this.clan) { this.livingOnly = false; this.livingChk.checked = false; this.focusId = null; } this.draw(); });

    this.styleBtn(this.focusBtn, '🔍 focus bloodline');
    this.focusBtn.addEventListener('click', () => { if (this.selected !== null) { this.focusId = this.selected; this.clan = null; this.clanSel.value = ''; this.livingOnly = false; this.livingChk.checked = false; this.draw(); } });
    this.styleBtn(this.resetBtn, '🌍 whole town');
    this.resetBtn.addEventListener('click', () => { this.focusId = null; this.clan = null; this.clanSel.value = ''; this.livingOnly = false; this.livingChk.checked = false; this.q = ''; this.search.value = ''; this.draw(); });

    this.controls.append(this.search, livingLabel, this.clanSel, this.focusBtn, this.resetBtn);
  }
  private styleBtn(b: HTMLButtonElement, label: string): void {
    b.textContent = label;
    Object.assign(b.style, { background: '#1c2030', color: '#cfe0ff', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '6px', padding: '6px 9px', font: '12px monospace', cursor: 'pointer', whiteSpace: 'nowrap' } as Partial<CSSStyleDeclaration>);
  }

  private applyZoom(): void {
    const svg = this.svgHost.querySelector('svg');
    if (svg) { svg.setAttribute('width', String(this.natW * this.zoom)); svg.setAttribute('height', String(this.natH * this.zoom)); }
  }

  render(world: World, cfg: SimConfig = defaultConfig): void {
    this.forest = buildForest(world, cfg);
    this.natW = MARGIN * 2 + Math.max(0, this.forest.width - 1) * COL_W;
    this.natH = MARGIN * 2 + Math.max(0, this.forest.generations - 1) * GEN_H;
    // populate the family picker
    const families = [...new Set(this.forest.nodes.map(n => n.surname))].sort();
    this.clanSel.innerHTML = `<option value="">all families</option>` + families.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    this.clanSel.value = this.clan ?? '';
    this.draw();
  }

  private draw(): void {
    const f = this.forest;
    if (!f) return;
    if (f.nodes.length === 0) {
      this.svgHost.innerHTML = '';
      this.info.innerHTML = '<span style="color:#778">No souls yet — the forest grows as the town lives and dies.</span>';
      return;
    }
    const x = (n: ForestNode) => MARGIN + n.col * COL_W;
    const y = (n: ForestNode) => MARGIN + n.gen * GEN_H;

    let visible: Set<EntityId> | null = null;     // null = show everyone
    let label = '';
    if (this.focusId !== null && f.byId.has(this.focusId)) { visible = bloodline(f, this.focusId); label = `the bloodline of ${esc(f.byId.get(this.focusId)!.name)}`; }
    else if (this.clan) { visible = new Set(f.nodes.filter(n => n.surname === this.clan).map(n => n.id)); label = `the ${esc(this.clan)} family`; }
    else if (this.livingOnly) { visible = livingLines(f); label = 'living lines only'; }
    const vis = (id: EntityId) => visible === null || visible.has(id);
    const q = this.q.trim().toLowerCase();
    const match = (n: ForestNode) => q !== '' && n.name.toLowerCase().includes(q);

    let links = '';
    for (const n of f.nodes) {
      if (!vis(n.id) || n.parents.length === 0) continue;
      const ps = n.parents.map(p => f.byId.get(p)!).filter(p => vis(p.id));
      if (ps.length === 0) continue;
      const mx = ps.reduce((s, p) => s + x(p), 0) / ps.length, my = ps[0].gen * GEN_H + MARGIN;
      links += `<path d="M${x(n)} ${y(n)} L${mx} ${my + 18}" stroke="#34344a" stroke-width="1" fill="none"/>`;
    }
    for (const [a, b] of f.couples) {
      if (!vis(a) || !vis(b)) continue;
      const na = f.byId.get(a)!, nb = f.byId.get(b)!;
      links += `<line x1="${x(na)}" y1="${y(na)}" x2="${x(nb)}" y2="${y(nb)}" stroke="#6a5a70" stroke-width="1.4" stroke-linecap="round"/>`;
    }

    let nodes = '';
    const shown = visible ? visible.size : f.nodes.length;
    const showLabels = shown <= 360;
    for (const n of f.nodes) {
      if (!vis(n.id)) continue;
      const cx = x(n), cy = y(n), r = n.alive ? 6 : 5;
      const dim = q !== '' && !match(n);
      const op = ((n.alive ? 1 : 0.42) * (dim ? 0.28 : 1)).toFixed(2);
      const ring = n.alive && !dim ? `<circle cx="${cx}" cy="${cy}" r="${r + 2.2}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"/>` : '';
      const hl = match(n) ? `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none" stroke="#ffe08a" stroke-width="1.5"/>` : '';
      const sel = this.selected === n.id ? `<circle cx="${cx}" cy="${cy}" r="${r + 4.5}" fill="none" stroke="#ffd24a" stroke-width="1.6"/>` : '';
      const life = n.alive ? `b.${n.bornYear}` : `${n.bornYear}–${n.diedYear}`;
      const lbl = showLabels && !dim ? `<text x="${cx}" y="${cy + r + 8}" text-anchor="middle" font-size="7" fill="${n.alive ? '#b9b9c6' : '#70707e'}">${esc(n.name.split(/\s+/)[0])}</text>` : '';
      nodes += `<g data-id="${n.id}" style="cursor:pointer">${sel}${hl}${ring}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${n.color}" fill-opacity="${op}"><title>${esc(`${n.name} · ${n.sex === 'male' ? '♂' : '♀'} · ${life}${n.alive ? ' · living' : ''}`)}</title></circle>${lbl}</g>`;
    }

    this.svgHost.innerHTML =
      `<svg viewBox="0 0 ${this.natW} ${this.natH}" width="${this.natW * this.zoom}" height="${this.natH * this.zoom}" font-family="ui-monospace, monospace" style="display:block">` +
      `<g>${links}</g><g>${nodes}</g></svg>`;

    if (this.selected !== null && f.byId.has(this.selected)) { this.info.innerHTML = this.detail(f.byId.get(this.selected)!); return; }
    const living = f.nodes.filter(n => (visible === null || visible.has(n.id)) && n.alive).length;
    const families = new Set(f.nodes.filter(n => visible === null || visible.has(n.id)).map(n => n.surname)).size;
    this.info.innerHTML =
      (label ? `<span style="color:#ffd27a">showing ${label}</span> — ` : '') +
      `<b style="color:#cdd">${shown}</b> souls · <b style="color:#8fe88f">${living}</b> living · ${families} families. ` +
      `<span style="color:#778">scroll to zoom, drag to pan, click a soul.</span>`;
  }

  private detail(n: ForestNode): string {
    const life = n.alive ? `living · born yr ${n.bornYear}` : `yr ${n.bornYear}–${n.diedYear} (passed on)`;
    return `<span style="color:${n.color}">●</span> <b style="color:#e8e8f0">${esc(n.name)}</b> ` +
      `<span style="color:#9ab">${n.sex === 'male' ? '♂' : '♀'} · ${life}</span>` +
      (n.alive ? ` <span style="color:#8fe88f">↪ focused on the map</span>` : '') +
      ` <span style="color:#778">· “focus bloodline” to trace their line</span>`;
  }

  private select(id: EntityId): void {
    this.selected = id;
    const n = this.forest?.byId.get(id);
    if (!n) return;
    if (n.alive) this.focusOn(id);
    this.draw();   // redraw to show the selection ring + detail
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
