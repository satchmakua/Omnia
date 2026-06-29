// The Conflict lens (M16, hotkey X): the town's violent life at a glance — active wars and
// the war history, the most combative & most peaceful tribes, its champions and outlaws, who
// has slain whom, and how the dead actually died. A pure read of the Combat/Crime records,
// the OrgStore (active + concluded wars), the tombstones, and the cause-of-death histogram.
import type { World } from '../sim/ecs.ts';
import { C_AGENT, C_COMBAT, C_CRIME, C_WORLDSTATS, C_TOMBSTONE, C_ALIGNMENT, C_RELATIONSHIPS } from '../sim/components.ts';
import type { Agent, Combat, Crime, Tombstone, Alignment, Relationships } from '../sim/components.ts';
import { alignmentName } from '../sim/heredity.ts';
import { getOrgStore } from '../org/orgStore.ts';
import type { WorldStatsData } from '../history/stats.ts';
import { ticksPerYear, defaultConfig } from '../sim/config.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

const VIOLENT = /slain|murder|battle|struck down|attacking/i;
const TPY = ticksPerYear(defaultConfig);
const yr = (tick: number) => Math.floor(tick / TPY);

export class ConflictDashboard extends ModalPanel {
  constructor() { super('Conflict', '580px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const store = getOrgStore(world);
    const name = (id?: string) => (id && store ? store.byId[id]?.name : undefined) ?? '—';
    const color = (id?: string) => (id && store ? store.byId[id]?.color : undefined) ?? '#c0c0cc';

    // Members + a combativeness tally per living tribe.
    const members = new Map<string, number>();
    const tribeKills = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const id = world.getComponent<Agent>(e, C_AGENT)!.orgId;
      if (!id) continue;
      members.set(id, (members.get(id) ?? 0) + 1);
      const c = world.getComponent<Combat>(e, C_COMBAT);
      if (c) tribeKills.set(id, (tribeKills.get(id) ?? 0) + c.kills);
    }
    const wars = store?.wars ?? [];
    const warLog = store?.warLog ?? [];
    const warCount = (id: string) =>
      wars.filter(w => w.a === id || w.b === id).length + warLog.filter(w => w.a === id || w.b === id).length;

    // ── Active wars ──
    const activeRows = wars.map(w => {
      if (!store!.byId[w.a] || !store!.byId[w.b]) return '';
      return `<div style="margin:3px 0">
        <span style="color:${color(w.a)}">${name(w.a)}</span> <span style="color:#888">(${members.get(w.a) ?? 0})</span>
        <span style="color:#ff7a6a"> ⚔ </span>
        <span style="color:${color(w.b)}">${name(w.b)}</span> <span style="color:#888">(${members.get(w.b) ?? 0})</span></div>`;
    }).filter(Boolean).join('');

    // ── War history (concluded) ──
    const historyRows = [...warLog].reverse().slice(0, 8).map(w => {
      const outcome = w.winner
        ? `<span style="color:#ffb27a">${name(w.winner)} prevailed</span>`
        : `<span style="color:#9bd0b0">peace</span>`;
      return `<div style="color:#aab;font-size:12px;margin:2px 0">
        <span style="color:${color(w.a)}">${name(w.a)}</span> vs <span style="color:${color(w.b)}">${name(w.b)}</span>
        — ${outcome} <span style="color:#677">· yr ${yr(w.ended)}</span></div>`;
    }).join('');

    // ── Most combative / most peaceful living tribes ──
    const living = store ? Object.values(store.byId).filter(o => !o.extinct && (members.get(o.id) ?? 0) > 0) : [];
    let tribesLine = '<div style="color:#778;font-size:12px">no clans</div>';
    if (living.length > 0) {
      const scored = living.map(o => ({ o, wars: warCount(o.id), kills: tribeKills.get(o.id) ?? 0 }));
      const combative = [...scored].sort((x, y) => (y.wars - x.wars) || (y.kills - x.kills) || (y.o.values.martial - x.o.values.martial))[0];
      const peaceful = [...scored].sort((x, y) => (x.wars - y.wars) || (x.kills - y.kills) || (x.o.values.martial - y.o.values.martial))[0];
      tribesLine =
        `<div style="margin:2px 0"><span style="color:#ff8a7a">⚔ Most combative:</span>
          <span style="color:${combative.o.color}">${combative.o.name}</span>
          <span style="color:#889;font-size:11px">(${combative.wars} ${combative.wars === 1 ? 'war' : 'wars'}, ${combative.kills} kills, martial ${combative.o.values.martial.toFixed(2)})</span></div>
         <div style="margin:2px 0"><span style="color:#8fd0a0">☮ Most peaceful:</span>
          <span style="color:${peaceful.o.color}">${peaceful.o.name}</span>
          <span style="color:#889;font-size:11px">(${peaceful.wars} ${peaceful.wars === 1 ? 'war' : 'wars'}, ${peaceful.kills} kills, martial ${peaceful.o.values.martial.toFixed(2)})</span></div>`;
    }

    // ── Champions (most kills) & Most wanted (worst rap sheet) ──
    const vets = world.query(C_AGENT, C_COMBAT)
      .map(e => ({ a: world.getComponent<Agent>(e, C_AGENT)!, c: world.getComponent<Combat>(e, C_COMBAT)! }))
      .filter(v => v.c.kills > 0 || v.c.scars > 0)
      .sort((x, y) => (y.c.kills - x.c.kills) || (y.c.scars - x.c.scars)).slice(0, 6);
    const champRows = vets.map(v =>
      `<div style="display:flex;justify-content:space-between;margin:2px 0">
        <span><span style="color:${color(v.a.orgId)}">●</span> ${v.a.name}</span>
        <span style="color:#9ab">${v.c.kills} ${v.c.kills === 1 ? 'kill' : 'kills'}${v.c.scars ? ` · ${v.c.scars} ${v.c.scars === 1 ? 'scar' : 'scars'}` : ''}</span></div>`).join('');

    const cscore = (c: Crime) => c.murders * 100 + c.assaults * 10 + c.thefts;
    const outlaws = world.query(C_AGENT, C_CRIME)
      .map(e => ({ e, a: world.getComponent<Agent>(e, C_AGENT)!, c: world.getComponent<Crime>(e, C_CRIME)! }))
      .filter(o => cscore(o.c) > 0).sort((x, y) => cscore(y.c) - cscore(x.c)).slice(0, 6);
    const align = (e: number) => { const al = world.getComponent<Alignment>(e, C_ALIGNMENT); return al ? alignmentName(al) : ''; };
    const wantedRows = outlaws.map(o => {
      const bits = [o.c.murders ? `${o.c.murders} ${o.c.murders === 1 ? 'murder' : 'murders'}` : '',
        o.c.assaults ? `${o.c.assaults} assault${o.c.assaults === 1 ? '' : 's'}` : '',
        o.c.thefts ? `${o.c.thefts} theft${o.c.thefts === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
      const al = align(o.e);
      return `<div style="display:flex;justify-content:space-between;margin:2px 0">
        <span><span style="color:${o.c.murders ? '#ff5a5a' : '#ffae6a'}">⚖</span> ${o.a.name}${al ? ` <span style="color:#9a8ab0;font-size:11px">${al}</span>` : ''}</span>
        <span style="color:#caa">${bits}</span></div>`;
    }).join('');

    // ── Who killed whom (recent slayings, from the tombstones that name a slayer) ──
    const slain = world.query(C_TOMBSTONE)
      .map(e => world.getComponent<Tombstone>(e, C_TOMBSTONE)!)
      .filter(t => t.slayer)
      .sort((a, b) => b.diedTick - a.diedTick).slice(0, 7);
    const slayRows = slain.map(t =>
      `<div style="color:#caa;font-size:12px;margin:2px 0">${t.name} <span style="color:#888">— ${t.cause} —</span> <span style="color:#ff8a8a">${t.slayer}</span> <span style="color:#677">· yr ${yr(t.diedTick)}</span></div>`).join('');

    // ── Bad blood (interpersonal rivalries with their reasons, M29 s1) ──
    // The bitterest grudge per living pair — feuds emerging from theft, assault, murdered kin, or
    // a rivalry in love. (One-directional grudges, e.g. a slain man's son vs the killer, count too.)
    const grudges = new Map<string, { a: string; b: string; reason: string; s: number }>();
    for (const e of world.query(C_AGENT, C_RELATIONSHIPS)) {
      const r = world.getComponent<Relationships>(e, C_RELATIONSHIPS)!;
      const an = world.getComponent<Agent>(e, C_AGENT)!.name;
      for (const [idStr, edge] of Object.entries(r.edges)) {
        const id = Number(idStr);
        if ((edge.type !== 'rival' && edge.sentiment >= -0.2) || !world.hasComponent(id, C_AGENT)) continue;
        const key = e < id ? `${e}.${id}` : `${id}.${e}`;
        const cur = grudges.get(key);
        if (!cur || edge.sentiment < cur.s) {
          grudges.set(key, { a: an, b: world.getComponent<Agent>(id, C_AGENT)!.name, reason: edge.reason ?? 'bad blood', s: edge.sentiment });
        }
      }
    }
    const grudgeRows = [...grudges.values()].sort((x, y) => x.s - y.s).slice(0, 7).map(g =>
      `<div style="color:#caa;font-size:12px;margin:2px 0">${g.a} <span style="color:#ff7a7a">⚔</span> ${g.b} <span style="color:#888">— ${g.reason}</span></div>`).join('');

    // ── Cause of death (cumulative; bounded key-set) ──
    const wsEnts = world.query(C_WORLDSTATS);
    const ws = wsEnts.length ? world.getComponent<WorldStatsData>(wsEnts[0], C_WORLDSTATS) : undefined;
    const causes = ws ? Object.entries(ws.causeOfDeath).sort((a, b) => b[1] - a[1]) : [];
    const total = causes.reduce((s, [, n]) => s + n, 0) || 1;
    const causeRows = causes.map(([cause, n]) => {
      const pct = (n / total) * 100;
      const col = VIOLENT.test(cause) ? '#ff6a6a' : '#7f93b0';
      return `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
        <span style="width:140px;color:#bcd;font-size:11px;text-align:right">${cause}</span>
        <span style="flex:1;background:rgba(255,255,255,0.05);border-radius:3px;height:11px;position:relative">
          <span style="position:absolute;left:0;top:0;bottom:0;width:${pct.toFixed(0)}%;background:${col};border-radius:3px"></span></span>
        <span style="width:28px;color:#9ab;font-size:11px">${n}</span></div>`;
    }).join('');
    const violentDeaths = causes.filter(([c]) => VIOLENT.test(c)).reduce((s, [, n]) => s + n, 0);

    const sub = (s: string) => `<div style="${SECTION}">${s}</div>`;
    const none = '<div style="color:#778;font-size:12px">none yet</div>';
    this.body.innerHTML =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:6px">
        The town's violent life — wars between clans, the folk who've made their name in battle, the
        outlaws who prey on their neighbours, and how the dead met their end (${violentDeaths} of ${total} by violence).</div>` +
      sub('Active wars') + (activeRows || none) +
      sub('War history') + (historyRows || none) +
      sub('Clans') + tribesLine +
      sub('Champions <span style="color:#789">(most foes slain)</span>') + (champRows || none) +
      sub('Most wanted') + (wantedRows || none) +
      sub('Bad blood <span style="color:#789">(personal grudges)</span>') + (grudgeRows || none) +
      sub('Who killed whom') + (slayRows || none) +
      sub('How the dead died') + (causeRows || none);
  }
}
