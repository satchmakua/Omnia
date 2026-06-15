// The Legends view (M6 item 3), toggled with the 'C' key. Two halves, per the
// design's "fidelity ∝ importance × recency": first the **Chronicle** read as a
// story (recent legends sharp, ancient ages compressed to one-liners), then the
// **statistical strata** — the forgotten in aggregate — as small lo-fi charts.
// Read-only: it only reads sim state (sim/render separation holds).
import type { World } from '../sim/ecs.ts';
import { C_CHRONICLE, C_WORLDSTATS, C_CLOCK } from '../sim/components.ts';
import type { Clock } from '../sim/components.ts';
import { chronicleRecent } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';
import type { WorldStatsData, StatSample } from '../history/stats.ts';
import { defaultConfig, ticksPerYear } from '../sim/config.ts';

const TPY = ticksPerYear(defaultConfig);
const yearOf = (tick: number) => Math.floor(tick / TPY);

const CAUSE_COLOR: Record<string, string> = {
  'old age': '#8fe0a0', illness: '#ff9a6a', misfortune: '#c9a0ff',
};

// A tiny lo-fi sparkline over a series of numbers.
function sparkline(values: number[], color: string, w = 220, h = 34): string {
  if (values.length === 0) return '<div style="color:#667">— no data yet —</div>';
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const range = (max - min) || 1;
  const n = values.length;
  const pts = values
    .map((v, i) => `${((i / Math.max(1, n - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return `<svg width="${w}" height="${h}" style="display:block">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"
      stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function chart(label: string, latest: string, values: number[], color: string): string {
  return `<div style="margin:8px 0">
    <div style="display:flex;justify-content:space-between;color:#aab">
      <span>${label}</span><span style="color:${color}">${latest}</span></div>
    ${sparkline(values, color)}</div>`;
}

export class LegendsPanel {
  private readonly panel: HTMLDivElement;
  private visible = false;

  constructor() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      width: 'min(640px, 92vw)', maxHeight: '82vh', background: 'rgba(10,10,26,0.97)',
      color: '#e6e6f0', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.7',
      padding: '20px 24px', boxSizing: 'border-box', display: 'none', overflowY: 'auto',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)', zIndex: '10',
    });
    document.body.appendChild(this.panel);
  }

  toggle(world: World): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.render(world);
  }

  private get<T>(world: World, comp: string): T | undefined {
    const ents = world.query(comp);
    return ents.length ? world.getComponent<T>(ents[0], comp) : undefined;
  }

  render(world: World): void {
    const chronicle = this.get<ChronicleData>(world, C_CHRONICLE);
    const stats = this.get<WorldStatsData>(world, C_WORLDSTATS);
    const clock = this.get<Clock>(world, C_CLOCK);
    const year = clock ? yearOf(clock.tick) : 0;

    this.panel.innerHTML =
      `<div style="font-size:16px;font-weight:bold;color:#ffd278;margin-bottom:2px">Legends</div>
       <div style="color:#99a;margin-bottom:12px">the town's history, in year ${year}</div>
       ${this.chronicleHtml(chronicle)}
       ${this.strataHtml(stats)}
       <div style="margin-top:16px;color:#666">press C to close</div>`;
  }

  private chronicleHtml(c: ChronicleData | undefined): string {
    if (!c) return '';
    const recent = chronicleRecent(c, 40).map(e => {
      const when = e.tick === 0 ? 'long ago' : `year ${yearOf(e.tick)}`;
      return `<div style="margin:5px 0;padding-left:10px;border-left:2px solid rgba(255,210,120,0.5)">
        <span style="color:#889">${when}</span> — ${e.text}</div>`;
    }).join('');

    // Ancient eras, most-recent age first; these read as faded one-line legends.
    const eras = [...c.eras].reverse().map(era => {
      const span = `years ${yearOf(era.fromTick)}–${yearOf(era.toTick)}`;
      return `<div style="margin:5px 0;padding-left:10px;border-left:2px solid rgba(150,150,200,0.35);color:#aab">
        <span style="color:#778">${span}</span> — ${era.text}</div>`;
    }).join('');

    const erasBlock = eras
      ? `<div style="color:#9a9ac0;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:14px 0 4px">Ages past</div>${eras}`
      : '';

    return `<div style="color:#ffd278;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin-bottom:4px">The Chronicle</div>
      ${recent || '<div style="color:#778">No legends recorded yet.</div>'}
      ${erasBlock}`;
  }

  private strataHtml(s: WorldStatsData | undefined): string {
    if (!s || s.samples.length === 0) {
      return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
        <div style="color:#778">No town records yet — they accrue over the years.</div>`;
    }
    const v = (pick: (x: StatSample) => number) => s.samples.map(pick);
    const last = s.samples[s.samples.length - 1];

    const causeTotal = Object.values(s.causeOfDeath).reduce((a, b) => a + b, 0);
    const causeRows = Object.entries(s.causeOfDeath)
      .sort((a, b) => b[1] - a[1])
      .map(([cause, n]) => {
        const pct = causeTotal ? Math.round((n / causeTotal) * 100) : 0;
        const col = CAUSE_COLOR[cause] ?? '#99a';
        return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
          <span style="width:90px;color:#aab">${cause}</span>
          <span style="flex:1;background:rgba(255,255,255,0.06);border-radius:3px">
            <span style="display:block;width:${pct}%;height:10px;background:${col};border-radius:3px"></span></span>
          <span style="width:54px;text-align:right;color:#889">${n} · ${pct}%</span></div>`;
      }).join('');

    return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
      <div style="color:#ffd278;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin-bottom:4px">The town in numbers</div>
      ${chart('Population', String(last.population), v(x => x.population), '#8fe88f')}
      ${chart('Median wealth', `${Math.round(last.medianWealth)}g`, v(x => x.medianWealth), '#ffd24a')}
      ${chart('Inequality (Gini)', last.gini.toFixed(2), v(x => x.gini), '#ff9ad0')}
      ${chart('Born / died (total)', `${last.births} / ${last.deaths}`, v(x => x.births), '#8fe0a0')}
      <div style="color:#aab;margin:10px 0 2px">Causes of death</div>
      ${causeRows || '<div style="color:#778">none yet</div>'}`;
  }
}
