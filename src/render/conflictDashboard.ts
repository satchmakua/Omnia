// The Conflict lens (M16, hotkey X): the town's violent life at a glance — active wars,
// its champions (folk who've slain the most foes), its most-wanted outlaws, and how the
// dead actually died. A pure read of the Combat/Crime records, the OrgStore wars, and the
// cumulative cause-of-death histogram.
import type { World } from '../sim/ecs.ts';
import { C_AGENT, C_COMBAT, C_CRIME, C_WORLDSTATS } from '../sim/components.ts';
import type { Agent, Combat, Crime } from '../sim/components.ts';
import { getOrgStore } from '../org/orgStore.ts';
import type { WorldStatsData } from '../history/stats.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

// Violent vs natural causes get different colours in the breakdown.
const VIOLENT = /slain|murder|battle|struck down|attacking/i;

export class ConflictDashboard extends ModalPanel {
  constructor() { super('Conflict', '560px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const store = getOrgStore(world);
    const orgColor = (id?: string) => (id && store ? store.byId[id]?.color : undefined) ?? '#c0c0cc';

    // ── Active wars ──
    const members = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const id = world.getComponent<Agent>(e, C_AGENT)!.orgId;
      if (id) members.set(id, (members.get(id) ?? 0) + 1);
    }
    const wars = (store?.wars ?? []).map(w => {
      const a = store!.byId[w.a], b = store!.byId[w.b];
      if (!a || !b) return '';
      return `<div style="margin:4px 0">
        <span style="color:${a.color}">${a.name}</span> <span style="color:#888">(${members.get(w.a) ?? 0})</span>
        <span style="color:#ff7a6a"> ⚔ </span>
        <span style="color:${b.color}">${b.name}</span> <span style="color:#888">(${members.get(w.b) ?? 0})</span>
      </div>`;
    }).filter(Boolean).join('');

    // ── Champions (most kills) & Most wanted (worst rap sheet) ──
    const vets = world.query(C_AGENT, C_COMBAT)
      .map(e => ({ a: world.getComponent<Agent>(e, C_AGENT)!, c: world.getComponent<Combat>(e, C_COMBAT)! }))
      .filter(v => v.c.kills > 0 || v.c.scars > 0)
      .sort((x, y) => (y.c.kills - x.c.kills) || (y.c.scars - x.c.scars)).slice(0, 8);
    const champRows = vets.map(v =>
      `<div style="display:flex;justify-content:space-between;margin:2px 0">
        <span><span style="color:${orgColor(v.a.orgId)}">●</span> ${v.a.name}</span>
        <span style="color:#9ab">${v.c.kills} ${v.c.kills === 1 ? 'kill' : 'kills'}${v.c.scars ? ` · ${v.c.scars} ${v.c.scars === 1 ? 'scar' : 'scars'}` : ''}</span>
      </div>`).join('');

    const score = (c: Crime) => c.murders * 100 + c.assaults * 10 + c.thefts;
    const outlaws = world.query(C_AGENT, C_CRIME)
      .map(e => ({ a: world.getComponent<Agent>(e, C_AGENT)!, c: world.getComponent<Crime>(e, C_CRIME)! }))
      .filter(o => score(o.c) > 0)
      .sort((x, y) => score(y.c) - score(x.c)).slice(0, 8);
    const wantedRows = outlaws.map(o => {
      const bits = [
        o.c.murders ? `${o.c.murders} ${o.c.murders === 1 ? 'murder' : 'murders'}` : '',
        o.c.assaults ? `${o.c.assaults} ${o.c.assaults === 1 ? 'assault' : 'assaults'}` : '',
        o.c.thefts ? `${o.c.thefts} ${o.c.thefts === 1 ? 'theft' : 'thefts'}` : '',
      ].filter(Boolean).join(', ');
      return `<div style="display:flex;justify-content:space-between;margin:2px 0">
        <span><span style="color:${o.c.murders ? '#ff5a5a' : '#ffae6a'}">⚖</span> ${o.a.name}</span>
        <span style="color:#caa">${bits}</span></div>`;
    }).join('');

    // ── Cause of death (cumulative; bounded key-set) ──
    const wsEnts = world.query(C_WORLDSTATS);
    const ws = wsEnts.length ? world.getComponent<WorldStatsData>(wsEnts[0], C_WORLDSTATS) : undefined;
    const causes = ws ? Object.entries(ws.causeOfDeath).sort((a, b) => b[1] - a[1]) : [];
    const total = causes.reduce((s, [, n]) => s + n, 0) || 1;
    const causeRows = causes.map(([cause, n]) => {
      const pct = (n / total) * 100;
      const col = VIOLENT.test(cause) ? '#ff6a6a' : '#7f93b0';
      return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
        <span style="width:130px;color:#bcd;font-size:11px;text-align:right">${cause}</span>
        <span style="flex:1;background:rgba(255,255,255,0.05);border-radius:3px;height:11px;position:relative">
          <span style="position:absolute;left:0;top:0;bottom:0;width:${pct.toFixed(0)}%;background:${col};border-radius:3px"></span></span>
        <span style="width:30px;color:#9ab;font-size:11px">${n}</span></div>`;
    }).join('');
    const violentDeaths = causes.filter(([c]) => VIOLENT.test(c)).reduce((s, [, n]) => s + n, 0);

    const sub = (s: string) => `<div style="${SECTION}">${s}</div>`;
    const none = '<div style="color:#778;font-size:12px">none yet</div>';
    this.body.innerHTML =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:6px">
        The town's violent life — wars between tribes, the folk who've made their name in battle, the
        outlaws who prey on their neighbours, and how the dead met their end (${violentDeaths} of ${total} by violence).</div>` +
      sub('Active wars') + (wars || none) +
      sub('Champions <span style="color:#789">(most foes slain)</span>') + (champRows || none) +
      sub('Most wanted') + (wantedRows || none) +
      sub('How the dead died') + (causeRows || none);
  }
}
