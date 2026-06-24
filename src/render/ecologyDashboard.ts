// The Ecology lens (M10, hotkey Y): the wildlife had no view of its own, yet the
// predator–prey food web (M8 slice 5) is one of the liveliest emergent systems in the
// sim. This tab makes it legible — the herds and their hunters, and the flora that
// feeds them — as a pure read of `C_FAUNA`/`C_FLORA` (sim/render separation holds).
import type { World } from '../sim/ecs.ts';
import { C_FAUNA, C_FLORA } from '../sim/components.ts';
import type { Fauna, Flora } from '../sim/components.ts';
import { ModalPanel, SECTION, bar } from './modalPanel.ts';

interface FaunaTally { name: string; color: string; diet: Fauna['diet']; count: number; hungerSum: number; }
interface FloraTally { name: string; color: string; count: number; ripe: number; }

export class EcologyDashboard extends ModalPanel {
  constructor() { super('Fauna & Flora', '560px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const fauna = this.tallyFauna(world);
    const flora = this.tallyFlora(world);
    this.body.innerHTML = this.faunaHtml(fauna) + this.floraHtml(flora);
  }

  private tallyFauna(world: World): Map<string, FaunaTally> {
    const by = new Map<string, FaunaTally>();
    for (const e of world.query(C_FAUNA)) {
      const f = world.getComponent<Fauna>(e, C_FAUNA)!;
      const t = by.get(f.speciesId)
        ?? { name: f.name, color: f.color, diet: f.diet, count: 0, hungerSum: 0 };
      t.count++; t.hungerSum += f.hunger;
      by.set(f.speciesId, t);
    }
    return by;
  }

  private tallyFlora(world: World): Map<string, FloraTally> {
    const by = new Map<string, FloraTally>();
    for (const e of world.query(C_FLORA)) {
      const f = world.getComponent<Flora>(e, C_FLORA)!;
      const t = by.get(f.speciesId) ?? { name: f.name, color: f.color, count: 0, ripe: 0 };
      t.count++; if (f.maturity >= f.edibleAt) t.ripe++;
      by.set(f.speciesId, t);
    }
    return by;
  }

  private faunaHtml(by: Map<string, FaunaTally>): string {
    const all = [...by.values()];
    const grazers = all.filter(t => t.diet !== 'predator');
    const predators = all.filter(t => t.diet === 'predator');
    const gN = grazers.reduce((s, t) => s + t.count, 0);
    const pN = predators.reduce((s, t) => s + t.count, 0);

    if (gN + pN === 0) return `<div style="color:#778">No animals abroad right now.</div>`;

    const ratio = pN > 0 ? `1 hunter per ${Math.round(gN / pN)} grazers` : 'no hunters left';
    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        Grazers eat the plants below; predators hunt the grazers. The two rise and fall against
        each other — too many hunters thin the herds, then the hunters go hungry. The “condition”
        bar is how well-fed a species is right now (full = thriving, empty = starving).</div>`;

    const summary =
      `<div style="display:flex;gap:16px;margin-bottom:8px">
        <span style="color:#8fe88f">${gN} grazers</span>
        <span style="color:#ff8f8f">${pN} predators</span>
        <span style="color:#aab">${ratio}</span></div>`;

    return `<div style="${SECTION}">Fauna — the wild herds & their hunters</div>
      ${intro}${summary}
      ${this.faunaGroup('Grazers', grazers)}
      ${this.faunaGroup('Predators', predators)}`;
  }

  private faunaGroup(label: string, rows: FaunaTally[]): string {
    if (rows.length === 0) return '';
    const body = rows.sort((a, b) => b.count - a.count).map(t => {
      const cond = t.count ? t.hungerSum / t.count : 0;
      const col = cond > 0.5 ? '#8fe88f' : cond > 0.3 ? '#e8d28f' : '#ff8f8f';
      return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
        <span style="width:12px;height:12px;border-radius:3px;background:${t.color};display:inline-block"></span>
        <span style="flex:1;color:#cdd">${t.name}</span>
        <span style="width:34px;text-align:right;color:#aab">×${t.count}</span>
        ${bar(cond, col, 90)}</div>`;
    }).join('');
    return `<div style="color:#9ab;margin:8px 0 2px">${label}</div>${body}`;
  }

  private floraHtml(by: Map<string, FloraTally>): string {
    const all = [...by.values()].sort((a, b) => b.count - a.count);
    const total = all.reduce((s, t) => s + t.count, 0);
    const ripe = all.reduce((s, t) => s + t.ripe, 0);
    if (total === 0) {
      return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
        <div style="${SECTION}">Flora — the plants underfoot</div>
        <div style="color:#778">Nothing growing yet.</div>`;
    }

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        Plants grow until they ripen, then grazers can forage them. “Ripe” is the share grown
        enough to eat right now — the food actually available to the herds.</div>`;

    const summary =
      `<div style="display:flex;gap:16px;margin-bottom:8px">
        <span style="color:#8fe88f">${total} plants</span>
        <span style="color:#aab">${Math.round((ripe / total) * 100)}% ripe (forageable)</span></div>`;

    const rows = all.map(t => {
      const pct = t.count ? t.ripe / t.count : 0;
      return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
        <span style="width:12px;height:12px;border-radius:3px;background:${t.color};display:inline-block"></span>
        <span style="flex:1;color:#cdd">${t.name}</span>
        <span style="width:34px;text-align:right;color:#aab">×${t.count}</span>
        ${bar(pct, '#9fe0a0', 90)}</div>`;
    }).join('');

    return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
      <div style="${SECTION}">Flora — the plants underfoot</div>
      ${intro}${summary}${rows}`;
  }
}
