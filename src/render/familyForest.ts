// The Family Forest view (M35): draws the whole-town pedigree (src/history/genealogy.ts) as a
// pan/zoom SVG — founders up top, time flowing down, marriages and descent lines, families by
// colour, the living glowing among the buried. A pure read of sim state (separation holds). Click
// a soul → see them in the detail bar; the living also jump the camera/inspector (focusOn). The
// SVG is sized in pixels and lives in a scroll box; the wheel zooms, drag pans.
import type { World, EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import { defaultConfig } from '../sim/config.ts';
import { buildForest } from '../history/genealogy.ts';
import type { Forest, ForestNode } from '../history/genealogy.ts';

const MARGIN = 28;
const COL_W = 30;     // horizontal pitch between souls in a row
const GEN_H = 66;     // vertical pitch between generations

export class FamilyForestView {
  readonly el = document.createElement('div');
  private readonly info = document.createElement('div');
  private readonly scroll = document.createElement('div');
  private readonly svgHost = document.createElement('div');
  private zoom = 1;
  private natW = 0;
  private natH = 0;
  private selected: EntityId | null = null;
  private forest: Forest | null = null;

  constructor(private readonly focusOn: (e: EntityId) => void) {
    Object.assign(this.info.style, { color: '#9ab', fontSize: '12px', lineHeight: '1.5', margin: '2px 0 8px', minHeight: '34px' } as Partial<CSSStyleDeclaration>);
    Object.assign(this.scroll.style, {
      position: 'relative', overflow: 'auto', height: '58vh', background: '#0a0a12',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', cursor: 'grab',
    } as Partial<CSSStyleDeclaration>);
    this.scroll.append(this.svgHost);
    this.el.append(this.info, this.scroll);

    // Wheel-zoom (keeps the cursor roughly anchored), drag-pan.
    this.scroll.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.zoom;
      this.zoom = Math.max(0.3, Math.min(4, this.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
      const r = before > 0 ? this.zoom / before : 1;
      // anchor zoom on the cursor
      const rect = this.scroll.getBoundingClientRect();
      const cx = this.scroll.scrollLeft + (e.clientX - rect.left);
      const cy = this.scroll.scrollTop + (e.clientY - rect.top);
      this.applyZoom();
      this.scroll.scrollLeft = cx * r - (e.clientX - rect.left);
      this.scroll.scrollTop = cy * r - (e.clientY - rect.top);
    }, { passive: false });

    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    this.scroll.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest('[data-id]')) return;   // let node clicks through
      dragging = true; sx = e.clientX; sy = e.clientY; sl = this.scroll.scrollLeft; st = this.scroll.scrollTop;
      this.scroll.style.cursor = 'grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.scroll.scrollLeft = sl - (e.clientX - sx);
      this.scroll.scrollTop = st - (e.clientY - sy);
    });
    window.addEventListener('mouseup', () => { dragging = false; this.scroll.style.cursor = 'grab'; });

    // Node clicks (delegated).
    this.svgHost.addEventListener('click', (e) => {
      const g = (e.target as Element).closest('[data-id]');
      if (!g) return;
      const id = Number(g.getAttribute('data-id'));
      this.select(id);
    });
  }

  private applyZoom(): void {
    const svg = this.svgHost.querySelector('svg');
    if (svg) { svg.setAttribute('width', String(this.natW * this.zoom)); svg.setAttribute('height', String(this.natH * this.zoom)); }
  }

  render(world: World, cfg: SimConfig = defaultConfig): void {
    this.forest = buildForest(world, cfg);
    const f = this.forest;
    const x = (n: ForestNode) => MARGIN + n.col * COL_W;
    const y = (n: ForestNode) => MARGIN + n.gen * GEN_H;
    this.natW = MARGIN * 2 + Math.max(0, f.width - 1) * COL_W;
    this.natH = MARGIN * 2 + Math.max(0, f.generations - 1) * GEN_H;

    if (f.nodes.length === 0) {
      this.svgHost.innerHTML = '';
      this.info.innerHTML = '<span style="color:#778">No souls yet — the forest grows as the town lives and dies.</span>';
      return;
    }

    // ── descent + marriage links (under the nodes) ──
    let links = '';
    for (const n of f.nodes) {
      if (n.parents.length === 0) continue;
      const ps = n.parents.map(p => f.byId.get(p)!);
      const mx = ps.reduce((s, p) => s + x(p), 0) / ps.length;
      const my = ps[0].gen * GEN_H + MARGIN;
      links += `<path d="M${x(n)} ${y(n)} L${mx} ${my + 18}" stroke="#34344a" stroke-width="1" fill="none"/>`;
    }
    for (const [a, b] of f.couples) {
      const na = f.byId.get(a)!, nb = f.byId.get(b)!;
      links += `<line x1="${x(na)}" y1="${y(na)}" x2="${x(nb)}" y2="${y(nb)}" stroke="#6a5a70" stroke-width="1.4" stroke-linecap="round"/>`;
    }

    // ── nodes (dots; given-name label; native hover title) ──
    let nodes = '';
    const showLabels = f.nodes.length <= 360;   // avoid a label storm on very deep-time runs
    for (const n of f.nodes) {
      const cx = x(n), cy = y(n);
      const r = n.alive ? 6 : 5;
      const fill = n.alive ? n.color : `${n.color}`;
      const op = n.alive ? '1' : '0.42';
      const ring = n.alive ? `<circle cx="${cx}" cy="${cy}" r="${r + 2.2}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"/>` : '';
      const sel = this.selected === n.id ? `<circle cx="${cx}" cy="${cy}" r="${r + 4.5}" fill="none" stroke="#ffe08a" stroke-width="1.6"/>` : '';
      const life = n.alive ? `b.${n.bornYear}` : `${n.bornYear}–${n.diedYear}`;
      const title = `${n.name} · ${n.sex === 'male' ? '♂' : '♀'} · ${life}${n.alive ? ' · living' : ''}`;
      const label = showLabels ? `<text x="${cx}" y="${cy + r + 8}" text-anchor="middle" font-size="7" fill="${n.alive ? '#b9b9c6' : '#70707e'}">${esc(n.name.split(/\s+/)[0])}</text>` : '';
      nodes += `<g data-id="${n.id}" style="cursor:pointer">${sel}${ring}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" fill-opacity="${op}"><title>${esc(title)}</title></circle>${label}</g>`;
    }

    this.svgHost.innerHTML =
      `<svg viewBox="0 0 ${this.natW} ${this.natH}" width="${this.natW * this.zoom}" height="${this.natH * this.zoom}" font-family="ui-monospace, monospace" style="display:block">` +
      `<g>${links}</g><g>${nodes}</g></svg>`;

    const living = f.nodes.filter(n => n.alive).length;
    const families = new Set(f.nodes.map(n => n.surname)).size;
    this.info.innerHTML = this.selected !== null && f.byId.has(this.selected)
      ? this.detail(f.byId.get(this.selected)!)
      : `<b style="color:#cdd">${f.nodes.length}</b> souls · <b style="color:#8fe88f">${living}</b> living · ${f.generations} generations · ${families} families. ` +
        `<span style="color:#778">Scroll to zoom, drag to pan, click a soul.</span>`;
  }

  private detail(n: ForestNode): string {
    const life = n.alive ? `living · born yr ${n.bornYear}` : `yr ${n.bornYear}–${n.diedYear} (passed on)`;
    return `<span style="color:${n.color}">●</span> <b style="color:#e8e8f0">${esc(n.name)}</b> ` +
      `<span style="color:#9ab">${n.sex === 'male' ? '♂' : '♀'} · ${life}</span>` +
      (n.alive ? ` <span style="color:#8fe88f">↪ focused on the map</span>` : '');
  }

  private select(id: EntityId): void {
    this.selected = id;
    const n = this.forest?.byId.get(id);
    if (!n) return;
    this.info.innerHTML = this.detail(n);
    if (n.alive) this.focusOn(id);
    // re-draw selection ring (re-render is cheap for normal sizes)
    if (this.forest) this.refreshSelection();
  }

  // Lightweight: toggle the selection ring without rebuilding the graph.
  private refreshSelection(): void {
    const svg = this.svgHost.querySelector('svg');
    if (!svg || !this.forest) return;
    svg.querySelectorAll('.sel-ring').forEach(el => el.remove());
    const n = this.forest.byId.get(this.selected!);
    if (!n) return;
    const cx = MARGIN + n.col * COL_W, cy = MARGIN + n.gen * GEN_H, r = n.alive ? 6 : 5;
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('class', 'sel-ring');
    ring.setAttribute('cx', String(cx)); ring.setAttribute('cy', String(cy)); ring.setAttribute('r', String(r + 4.5));
    ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#ffe08a'); ring.setAttribute('stroke-width', '1.6');
    svg.appendChild(ring);
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
