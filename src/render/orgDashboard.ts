// The Clans lens (M14, hotkey K): the town's organizations — kin-bands that hold together,
// govern themselves, and split as they grow. Each has its own colour (visible on the map as
// the folk tint) and a government emergent from its values. A pure read of the OrgStore.
import type { World } from '../sim/ecs.ts';
import { C_AGENT } from '../sim/components.ts';
import type { Agent } from '../sim/components.ts';
import { getOrgStore, areAllied, areRivals, vassalsOf } from '../org/orgStore.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

// Tech-tier → era label (M17), so the Clans view reads a clan's level of advancement.
const ERA_NAMES = ['Tribal Age', 'Tribal Age', 'Bronze Age', 'Iron Age', 'Medieval Age', 'Industrial Age', 'Modern Age', 'Sci-Fi Age'];

export class OrgDashboard extends ModalPanel {
  constructor() { super('Clans', '560px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const store = getOrgStore(world);
    if (!store) { this.body.innerHTML = '<div style="color:#778">No clans.</div>'; return; }

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
        Kin-bands that hold together, govern themselves, and split as they grow. Each clan has its own
        colour — that's the tint on its folk out on the map — and a government that emerges from its values.
        As the eras turn they forge <span style="color:#7fd6b0">alliances</span>, fall into
        <span style="color:#e0a0a0">rivalry</span>, and the weak may <span style="color:#d9b878">swear fealty</span> to a dominant power.</div>`;

    const rows = living.map((o) => {
      const n = members.get(o.id) ?? 0;
      const leader = o.leader != null && world.hasComponent(o.leader, C_AGENT)
        ? world.getComponent<Agent>(o.leader, C_AGENT)!.name : '—';
      const parent = o.parent && store.byId[o.parent] ? ` <span style="color:#889">⟵ ${store.byId[o.parent].name}</span>` : '';
      const foes = (store.wars ?? [])
        .filter(w => w.a === o.id || w.b === o.id)
        .map(w => store.byId[w.a === o.id ? w.b : w.a]?.name).filter(Boolean);
      const war = foes.length ? `<div style="color:#ff7a6a;font-size:11px">⚔ at war with ${foes.join(', ')}</div>` : '';
      // Diplomacy (M31): the standing it keeps with the other clans, and the realm it belongs to.
      const lord = o.lord && store.byId[o.lord] ? store.byId[o.lord].name : null;
      const vassals = vassalsOf(store, o.id).map(id => store.byId[id]?.name).filter(Boolean);
      const allies = living.filter(x => x.id !== o.id && areAllied(store, o.id, x.id)).map(x => x.name);
      const rivals = living.filter(x => x.id !== o.id && areRivals(store, o.id, x.id)).map(x => x.name);
      const diplo = [
        lord ? `<span style="color:#d9b878" title="a vassal — renders tribute, will not war its liege">⊢ sworn to ${lord}</span>` : '',
        vassals.length ? `<span style="color:#d9b878" title="holds these clans as vassals">♚ liege of ${vassals.join(', ')}</span>` : '',
        allies.length ? `<span style="color:#7fd6b0">allied with ${allies.join(', ')}</span>` : '',
        rivals.length ? `<span style="color:#e0a0a0">rivals: ${rivals.join(', ')}</span>` : '',
      ].filter(Boolean).join(' · ');
      const diploLine = diplo ? `<div style="font-size:11px;margin-top:1px">${diplo}</div>` : '';
      const nTech = o.techs?.length ?? 0;
      const arms = o.effects?.arms ?? 0, medicine = o.effects?.medicine ?? 0;
      const fx = [arms ? `<span title="military tech — better arms in war">⚔ arms ${arms}</span>` : '',
        medicine ? `<span title="medicine — members heal faster">⚕ med ${medicine}</span>` : ''].filter(Boolean).join(' · ');
      const tech = nTech > 0
        ? `<div style="color:#8fc0e0;font-size:11px">⚙ ${ERA_NAMES[o.tier ?? 1] ?? 'Tribal Age'} · ${nTech} tech${nTech === 1 ? '' : 's'}${fx ? ` · ${fx}` : ''}</div>` : '';
      return `<div style="display:flex;align-items:center;gap:8px;margin:5px 0;border-top:1px solid rgba(255,255,255,0.07);padding-top:6px">
        <span style="width:13px;height:13px;border-radius:3px;background:${o.color};display:inline-block;flex:0 0 auto"></span>
        <div style="flex:1;min-width:0">
          <div style="color:#e6e6f0">${o.name}${parent}</div>
          <div style="color:#889;font-size:11px">${o.government} · ${n} folk · led by ${leader}</div>${diploLine}${tech}${war}
        </div></div>`;
    }).join('');

    const lostHtml = lost.length
      ? `<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0"><div style="${SECTION}">Fallen clans</div>` +
        lost.map(o => `<div style="color:#889;margin:2px 0">† ${o.name}${o.parent && store.byId[o.parent] ? ` <span style="color:#677">⟵ ${store.byId[o.parent].name}</span>` : ''}</div>`).join('')
      : '';

    this.body.innerHTML =
      `<div style="${SECTION}">Clans <span style="color:#789">(${living.length})</span></div>${intro}` +
      `${rows || '<div style="color:#778">none yet</div>'}${lostHtml}`;
  }
}
