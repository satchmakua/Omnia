// The Tribes lens (M14, hotkey K): the town's organizations — kin-bands that hold together,
// govern themselves, and split as they grow. Each has its own colour (visible on the map as
// the folk tint) and a government emergent from its values. A pure read of the OrgStore.
import type { World } from '../sim/ecs.ts';
import { C_AGENT } from '../sim/components.ts';
import type { Agent } from '../sim/components.ts';
import { getOrgStore } from '../org/orgStore.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

export class OrgDashboard extends ModalPanel {
  constructor() { super('Tribes', '560px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const store = getOrgStore(world);
    if (!store) { this.body.innerHTML = '<div style="color:#778">No tribes.</div>'; return; }

    const members = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const id = world.getComponent<Agent>(e, C_AGENT)!.orgId;
      if (id) members.set(id, (members.get(id) ?? 0) + 1);
    }
    const all = Object.values(store.byId);
    const living = all.filter(o => !o.extinct).sort((a, b) => (members.get(b.id) ?? 0) - (members.get(a.id) ?? 0));
    const lost = all.filter(o => o.extinct);

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        Kin-bands that hold together, govern themselves, and split as they grow. Each tribe has its own
        colour — that's the tint on its folk out on the map — and a government that emerges from its values.</div>`;

    const rows = living.map((o) => {
      const n = members.get(o.id) ?? 0;
      const leader = o.leader != null && world.hasComponent(o.leader, C_AGENT)
        ? world.getComponent<Agent>(o.leader, C_AGENT)!.name : '—';
      const parent = o.parent && store.byId[o.parent] ? ` <span style="color:#889">⟵ ${store.byId[o.parent].name}</span>` : '';
      return `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;border-top:1px solid rgba(255,255,255,0.07);padding-top:6px">
        <span style="width:13px;height:13px;border-radius:3px;background:${o.color};display:inline-block;flex:0 0 auto"></span>
        <div style="flex:1;min-width:0">
          <div style="color:#e6e6f0">${o.name}${parent}</div>
          <div style="color:#889;font-size:11px">${o.government} · ${n} folk · led by ${leader}</div>
        </div></div>`;
    }).join('');

    const lostHtml = lost.length
      ? `<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0"><div style="${SECTION}">Fallen tribes</div>` +
        lost.map(o => `<div style="color:#889;margin:2px 0">† ${o.name}${o.parent && store.byId[o.parent] ? ` <span style="color:#677">⟵ ${store.byId[o.parent].name}</span>` : ''}</div>`).join('')
      : '';

    this.body.innerHTML =
      `<div style="${SECTION}">Tribes <span style="color:#789">(${living.length})</span></div>${intro}` +
      `${rows || '<div style="color:#778">none yet</div>'}${lostHtml}`;
  }
}
