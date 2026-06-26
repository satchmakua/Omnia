// The Heritage / Peoples lens (hotkey K): everything about where a person comes from, in one
// place (M20) — the **clans** (kin-lines that are also factions), the great clans by bloodline
// (living + the dead), the **cultures & tongues** family trees, and what each **language**
// actually sounds like. Folds the old Clans (K) + Lineages (G) + Language (N) tabs together,
// since they were all facets of the same thing. Composes the existing dashboards (it reparents
// their content), so there's one render path per facet.
import type { World } from '../sim/ecs.ts';
import { C_AGENT, C_TOMBSTONE, C_FIGURES } from '../sim/components.ts';
import type { Agent, Tombstone, FiguresData } from '../sim/components.ts';
import { OrgDashboard } from './orgDashboard.ts';
import { LineagesDashboard } from './lineagesDashboard.ts';
import { LanguageDashboard } from './languageDashboard.ts';

const SECTION = 'color:#bcd4ff;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:14px 0 4px';
const RULE = 'border-color:rgba(255,255,255,0.1);margin:14px 0';

export class HeritageDashboard {
  private readonly el = document.createElement('div');
  private readonly dynEl = document.createElement('div');
  private readonly clans = new OrgDashboard();
  private readonly lineages = new LineagesDashboard();
  private readonly language = new LanguageDashboard();

  constructor() {
    const rule = () => { const h = document.createElement('hr'); h.style.cssText = RULE; return h; };
    // The clans (living detail) → the great clans by bloodline → culture/tongue trees → language sound.
    this.el.append(this.clans.content, rule(), this.dynEl, rule(), this.lineages.content, rule(), this.language.content);
  }

  get content(): HTMLElement { return this.el; }

  update(world: World): void {
    this.clans.update(world);
    this.dynEl.innerHTML = this.dynastiesHtml(world);
    this.lineages.update(world);
    this.language.update(world);
  }

  // The great clans by bloodline (living + buried), tagged with the legends they've bred — the
  // historical depth behind the living clan list above. (A clan's word is its surname, M20.)
  private dynastiesHtml(world: World): string {
    const surnameOf = (name: string): string => name.trim().split(/\s+/).slice(-1)[0] ?? '';
    const living = new Map<string, number>();
    const total = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      const s = a.surname ?? surnameOf(a.name);
      if (!s) continue;
      living.set(s, (living.get(s) ?? 0) + 1);
      total.set(s, (total.get(s) ?? 0) + 1);
    }
    for (const e of world.query(C_TOMBSTONE)) {
      const s = surnameOf(world.getComponent<Tombstone>(e, C_TOMBSTONE)!.name);
      if (s) total.set(s, (total.get(s) ?? 0) + 1);
    }
    const figEnts = world.query(C_FIGURES);
    const figs = figEnts.length ? world.getComponent<FiguresData>(figEnts[0], C_FIGURES) : undefined;
    const figBySurname = new Map<string, number>();
    if (figs) for (const f of figs.figures) { const s = surnameOf(f.name); if (s) figBySurname.set(s, (figBySurname.get(s) ?? 0) + 1); }

    const houses = [...total.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (houses.length === 0) return '';
    const rows = houses.map(([s, n]) => {
      const liv = living.get(s) ?? 0;
      const nf = figBySurname.get(s) ?? 0;
      return `<div style="margin:2px 0">
        <span style="color:#cfe0ff">the ${s} clan</span>
        <span style="color:#9ab">— ${liv} living of ${n} all told</span>${nf ? ` <span style="color:#ffd08a;font-size:11px">· ${nf} ${nf === 1 ? 'legend' : 'legends'}</span>` : ''}</div>`;
    }).join('');
    return `<div style="${SECTION}">Great clans <span style="color:#789">(by bloodline, incl. the dead)</span></div>${rows}`;
  }
}
