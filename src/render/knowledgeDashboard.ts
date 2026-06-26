// The Knowledge lens (M17, hotkey J): the tech tree the tribes climb — the lost arts of the
// fallen world, re-ascended rung by rung (D8). Shows every tech by age, how many living tribes
// command it, which arts have been lost, and each tribe's progress. A pure read of the tech
// content registry + the OrgStore. (The per-mage magic tree lives in the inspector's Magic block.)
import type { World } from '../sim/ecs.ts';
import { C_AGENT } from '../sim/components.ts';
import type { Agent } from '../sim/components.ts';
import type { Registry } from '../content/registry.ts';
import type { Tech } from '../content/schema.ts';
import { getOrgStore } from '../org/orgStore.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

const ERA_NAMES = ['Tribal Age', 'Tribal Age', 'Bronze Age', 'Iron Age', 'Medieval Age', 'Industrial Age', 'Modern Age', 'Sci-Fi Age'];

export class KnowledgeDashboard extends ModalPanel {
  constructor(private readonly tech: Registry<Tech>) { super('Knowledge', '620px'); }

  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const store = getOrgStore(world);
    const living = store ? Object.values(store.byId).filter(o => !o.extinct) : [];
    const lost = new Set(store?.lost ?? []);
    // How many living tribes command each tech.
    const holders = new Map<string, number>();
    for (const o of living) for (const t of o.techs ?? []) holders.set(t, (holders.get(t) ?? 0) + 1);
    const members = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const id = world.getComponent<Agent>(e, C_AGENT)!.orgId;
      if (id) members.set(id, (members.get(id) ?? 0) + 1);
    }

    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        The arts of the fallen world, re-ascended rung by rung — each tribe researches its own way up.
        ✓ = a living tribe commands it; the brighter, the more do. An art whose last knowers die out is
        <span style="color:#e0883c">lost</span> until rediscovered.</div>`;

    // The tree by tier/age.
    const byTier = new Map<number, Tech[]>();
    for (const t of this.tech.all()) { const a = byTier.get(t.tier) ?? []; a.push(t); byTier.set(t.tier, a); }
    const tiers = [...byTier.keys()].sort((a, b) => a - b);
    const treeHtml = tiers.map(tier => {
      const nodes = (byTier.get(tier) ?? []).sort((a, b) => a.cost - b.cost).map(t => {
        const n = holders.get(t.id) ?? 0;
        const isLost = lost.has(t.id);
        const mark = isLost ? '<span style="color:#e0883c">✗ lost</span>'
          : n > 0 ? `<span style="color:#8fe88f">✓ ${n} tribe${n === 1 ? '' : 's'}</span>`
          : '<span style="color:#667">○ unknown</span>';
        const color = isLost ? '#caa078' : n > 0 ? '#dde' : '#778';
        const effects = t.effects.length ? ` <span style="color:#789;font-size:10px">[${t.effects.join(', ')}]</span>` : '';
        return `<div style="display:flex;justify-content:space-between;gap:8px;margin:2px 0">
          <span style="color:${color}">${t.name}${effects}</span><span style="font-size:11px">${mark}</span></div>`;
      }).join('');
      return `<div style="margin-top:8px"><div style="color:#8fc0e0;font-size:11px;text-transform:uppercase;letter-spacing:1px">${ERA_NAMES[tier] ?? `Tier ${tier}`}</div>${nodes}</div>`;
    }).join('');

    // Per-tribe progress.
    const tribeRows = living
      .sort((a, b) => (b.tier ?? 1) - (a.tier ?? 1) || (b.techs?.length ?? 0) - (a.techs?.length ?? 0))
      .map(o => `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
        <span style="width:11px;height:11px;border-radius:3px;background:${o.color};display:inline-block;flex:0 0 auto"></span>
        <span style="flex:1;color:#dde">${o.name}</span>
        <span style="color:#9ab;font-size:11px">${ERA_NAMES[o.tier ?? 1] ?? 'Tribal Age'} · ${o.techs?.length ?? 0} techs · ${members.get(o.id) ?? 0} folk</span></div>`).join('');

    const lostHtml = lost.size
      ? `<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0"><div style="${SECTION}">Lost arts</div>` +
        [...lost].map(id => `<div style="color:#e0883c;margin:2px 0">✗ ${this.tech.get(id)?.name ?? id}</div>`).join('')
      : '';

    this.body.innerHTML =
      `<div style="${SECTION}">Knowledge</div>${intro}${treeHtml}` +
      `<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0"><div style="${SECTION}">Tribes' progress</div>` +
      `${tribeRows || '<div style="color:#778">no tribes</div>'}${lostHtml}`;
  }
}
