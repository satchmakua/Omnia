// The Faiths lens (M18, hotkey R): the religions the town follows — their deity, tenets, how
// devout they are, how many keep them, and how they descend and schism into sects. A pure read
// of the ReligionStore (mirrors the Tribes/Lineages views).
import type { World } from '../sim/ecs.ts';
import { C_AGENT } from '../sim/components.ts';
import type { Agent } from '../sim/components.ts';
import { getReligionStore } from '../religion/religionStore.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

export class FaithsDashboard extends ModalPanel {
  constructor() { super('Faiths', '560px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const store = getReligionStore(world);
    if (!store) { this.body.innerHTML = '<div style="color:#778">No faiths.</div>'; return; }

    const followers = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const id = world.getComponent<Agent>(e, C_AGENT)!.religionId;
      if (id) followers.set(id, (followers.get(id) ?? 0) + 1);
    }
    const all = Object.values(store.byId);
    const living = all.filter(r => !r.extinct).sort((a, b) => (followers.get(b.id) ?? 0) - (followers.get(a.id) ?? 0));
    const lost = all.filter(r => r.extinct);

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        The faiths the folk keep — each born of a founding culture's values, each with a god, a few tenets,
        and a devoutness that draws the faithful closer. Faiths split into sects over the ages, like tongues and clans.</div>`;

    const piety = (f: number) => f > 0.66 ? 'devout' : f > 0.4 ? 'observant' : 'lax';
    const rows = living.map(r => {
      const n = followers.get(r.id) ?? 0;
      const parent = r.parent && store.byId[r.parent] ? ` <span style="color:#889">⟵ ${store.byId[r.parent].name}</span>` : '';
      return `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;border-top:1px solid rgba(255,255,255,0.07);padding-top:6px">
        <span style="width:13px;height:13px;border-radius:3px;background:${r.color};display:inline-block;flex:0 0 auto"></span>
        <div style="flex:1;min-width:0">
          <div style="color:#e6e6f0">${r.name}${parent}</div>
          <div style="color:#889;font-size:11px">venerates ${r.deity} · ${r.tenets.join(', ')} · ${piety(r.fervor)} · ${n} ${n === 1 ? 'follower' : 'followers'}</div>
        </div></div>`;
    }).join('');

    const lostHtml = lost.length
      ? `<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0"><div style="${SECTION}">Forgotten faiths</div>` +
        lost.map(r => `<div style="color:#889;margin:2px 0">† ${r.name}${r.parent && store.byId[r.parent] ? ` <span style="color:#677">⟵ ${store.byId[r.parent].name}</span>` : ''}</div>`).join('')
      : '';

    this.body.innerHTML =
      `<div style="${SECTION}">Faiths <span style="color:#789">(${living.length})</span></div>${intro}` +
      `${rows || '<div style="color:#778">none yet</div>'}${lostHtml}`;
  }
}
