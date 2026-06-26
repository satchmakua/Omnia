// The Society lens (hotkey S): the town's character at a glance — its moral makeup on the
// 3×3 alignment grid, the leaning of each axis, how the outlaws compare (so the crime↔
// alignment link is visible), and the spread of personalities. A pure read of the Alignment/
// Personality/Crime components (M13). Answers "what kind of people live here?".
import type { World } from '../sim/ecs.ts';
import { C_AGENT, C_PERSONALITY } from '../sim/components.ts';
import type { Personality } from '../sim/components.ts';
import { alignmentCensus } from '../analysis/metrics.ts';
import { ModalPanel, SECTION, bar } from './modalPanel.ts';

// The 3×3 grid laid out as alignmentName() spells the cells (rows: moral; cols: order).
const GRID: string[][] = [
  ['Lawful Good',   'Neutral Good', 'Chaotic Good'],
  ['Lawful Neutral', 'True Neutral', 'Chaotic Neutral'],
  ['Lawful Evil',   'Neutral Evil', 'Chaotic Evil'],
];
const ROW_TINT = ['rgba(120,220,120,0.16)', 'rgba(200,200,210,0.07)', 'rgba(230,90,90,0.16)'];

function lean(v: number, lowPole: string, highPole: string): string {
  if (v > 0.15) return highPole;
  if (v < -0.15) return lowPole;
  return 'balanced';
}

export class SocietyDashboard extends ModalPanel {
  constructor() { super('Society', '560px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const c = alignmentCensus(world);
    if (c.total === 0) { this.body.innerHTML = '<div style="color:#778">No folk.</div>'; return; }

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        The moral makeup of the living, on the classic 3×3 grid — the moral axis (good ↔ evil) down,
        the order axis (lawful ↔ chaotic) across. Alignment is heritable, shifts with the life lived,
        and steers behaviour: the good cooperate, the chaotic offend more readily.</div>`;

    // The 3×3 grid as a table of counts, tinted by moral row.
    const cell = (label: string, tint: string) => {
      const n = c.byCell[label] ?? 0;
      const pct = Math.round((n / c.total) * 100);
      return `<td style="background:${tint};border:1px solid rgba(255,255,255,0.08);border-radius:5px;padding:7px 4px;text-align:center;width:33%">
        <div style="font-size:16px;font-weight:bold;color:#fff">${n}</div>
        <div style="font-size:10px;color:#bcd">${label}</div>
        <div style="font-size:10px;color:#778">${pct}%</div></td>`;
    };
    const grid = `<table style="width:100%;border-collapse:separate;border-spacing:4px;margin:4px 0 8px">` +
      GRID.map((row, r) => `<tr>${row.map(lbl => cell(lbl, ROW_TINT[r])).join('')}</tr>`).join('') + `</table>`;

    const moral = lean(c.meanGood, 'wicked', 'benevolent');
    const order = lean(c.meanLaw, 'unruly', 'orderly');
    const leanLine =
      `<div style="margin:4px 0">Moral axis ${bar((c.meanGood + 1) / 2, '#8fe88f')} <span style="color:#9ab">mean ${c.meanGood.toFixed(2)} · a ${moral} town</span></div>
       <div style="margin:4px 0">Order axis ${bar((c.meanLaw + 1) / 2, '#9ab0ff')} <span style="color:#9ab">mean ${c.meanLaw.toFixed(2)} · ${order}</span></div>
       <div style="color:#889;font-size:11px;margin-top:3px">${Math.round(c.goodFrac * 100)}% good · ${Math.round(c.evilFrac * 100)}% evil · ${Math.round(c.lawfulFrac * 100)}% lawful · ${Math.round(c.chaoticFrac * 100)}% chaotic</div>`;

    // The criminal class vs the town — the crime↔alignment coupling made legible.
    const crimeLine = c.outlaws > 0
      ? `<div style="color:#caa">The ${c.outlaws} known outlaw${c.outlaws === 1 ? '' : 's'} skew
          <span style="color:#ff8a8a">darker (good ${c.outlawMeanGood.toFixed(2)})</span> and
          <span style="color:#ffae6a">more chaotic (law ${c.outlawMeanLaw.toFixed(2)})</span>
          than the town (good ${c.meanGood.toFixed(2)}, law ${c.meanLaw.toFixed(2)}).</div>`
      : '<div style="color:#778;font-size:12px">No outlaws — the town keeps the peace.</div>';

    // Personality archetypes, most common first.
    const traits = new Map<string, number>();
    for (const e of world.query(C_AGENT, C_PERSONALITY)) {
      const t = world.getComponent<Personality>(e, C_PERSONALITY)!.trait;
      traits.set(t, (traits.get(t) ?? 0) + 1);
    }
    const maxT = Math.max(1, ...traits.values());
    const persRows = [...traits.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) =>
      `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
        <span style="width:84px;color:#cdd;text-align:right">${t}</span>
        ${bar(n / maxT, '#c9a6e6', 150)}<span style="color:#9ab;width:24px">${n}</span></div>`).join('');

    this.body.innerHTML =
      `<div style="${SECTION}">Alignment <span style="color:#789">(${c.total} folk)</span></div>${intro}${grid}` +
      `<div style="${SECTION}">The town's leaning</div>${leanLine}` +
      `<div style="${SECTION}">The criminal class</div>${crimeLine}` +
      `<div style="${SECTION}">Personalities</div>${persRows || '<div style="color:#778">—</div>'}`;
  }
}
