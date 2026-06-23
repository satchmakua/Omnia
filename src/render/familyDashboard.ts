// Family-tree dashboard (M6.5 slice 3, hotkey T): the lineage of the inspected
// person across four generations. The dead resolve through their tombstones, so
// "your grandmother who founded the guild" still appears. Click any relative to
// re-root the tree on them and browse the ancestry.
import type { World, EntityId } from '../sim/ecs.ts';
import { C_AGENT, C_MAGIC, C_LINEAGE, C_TOMBSTONE } from '../sim/components.ts';
import type { Agent, Lineage, Tombstone } from '../sim/components.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

interface Kin { partner: number | null; parents: number[]; children: number[]; }

function kinOf(world: World, id: EntityId): Kin | null {
  const lin = world.getComponent<Lineage>(id, C_LINEAGE);
  if (lin) return { partner: lin.partner, parents: lin.parents, children: lin.children };
  const t = world.getComponent<Tombstone>(id, C_TOMBSTONE);
  if (t) return { partner: t.partner, parents: t.parents, children: t.children };
  return null;
}

function personInfo(world: World, id: EntityId): { name: string; dead: boolean; mage: boolean } | null {
  if (world.hasComponent(id, C_AGENT)) {
    return { name: world.getComponent<Agent>(id, C_AGENT)!.name, dead: false, mage: world.hasComponent(id, C_MAGIC) };
  }
  if (world.hasComponent(id, C_TOMBSTONE)) {
    return { name: world.getComponent<Tombstone>(id, C_TOMBSTONE)!.name, dead: true, mage: false };
  }
  return null;
}

export class FamilyDashboard extends ModalPanel {
  private readonly tree: HTMLDivElement;
  private world: World | null = null;
  private rootId: EntityId | null = null;

  constructor(private readonly onSelect: (e: EntityId) => void) {
    super('Family', '560px');
    this.tree = document.createElement('div');
    this.tree.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest('[data-fid]') as HTMLElement | null;
      if (!chip) return;
      const id = Number(chip.dataset.fid);
      this.rootId = id;
      this.onSelect(id);   // inspect + jump (main no-ops for the dead)
      this.render();
    });
    this.body.append(this.tree);
  }

  toggle(world: World, selected: EntityId | null): void {
    this.world = world;
    if (this.visible) { this.hide(); return; }
    this.rootId = selected;
    this.reveal();
    this.render();
  }

  refresh(world: World): void { this.world = world; if (this.visible) this.render(); }
  /** Master-tab API: set the focus person (from the inspector) and render. */
  setSelected(id: EntityId | null): void { this.rootId = id; }
  update(world: World): void { this.world = world; this.render(); }

  private chip(id: EntityId, highlight: boolean): string {
    const p = personInfo(this.world!, id);
    if (!p) return '';
    return `<span data-fid="${id}" style="display:inline-block;padding:4px 10px;margin:3px;border-radius:14px;cursor:pointer;
      background:${highlight ? '#3a3a66' : 'rgba(255,255,255,0.06)'};border:1px solid rgba(255,255,255,0.12);
      color:${p.dead ? '#9a9aa6' : '#fff'}">${p.name}${p.mage ? ' <span style="color:#d090f0">✦</span>' : ''}${p.dead ? ' †' : ''}</span>`;
  }

  private row(label: string, ids: EntityId[], highlight: EntityId | null = null): string {
    const chips = ids.map(id => this.chip(id, id === highlight)).filter(Boolean).join('');
    return `<div style="text-align:center">
      <div style="${SECTION};text-align:center">${label}</div>
      ${chips || '<span style="color:#778">—</span>'}</div>`;
  }

  private render(): void {
    const w = this.world;
    if (!w || this.rootId == null || !kinOf(w, this.rootId)) {
      this.titleEl.textContent = 'Family';
      this.tree.innerHTML = '<div style="color:#889;padding:14px 0;text-align:center">Click a person on the map (or in the Directory), then press T.</div>';
      return;
    }
    const root = this.rootId;
    const k = kinOf(w, root)!;
    const self = personInfo(w, root)!;
    this.titleEl.textContent = `Family of ${self.name}`;
    const heading = `<div style="text-align:center;color:#cfe;margin-bottom:6px">Family of <b>${self.name}</b></div>`;

    const grandparents: EntityId[] = [];
    const seen = new Set<EntityId>();
    for (const p of k.parents) {
      const pk = kinOf(w, p);
      if (pk) for (const gp of pk.parents) if (!seen.has(gp)) { seen.add(gp); grandparents.push(gp); }
    }
    const selfRow = k.partner != null ? [root, k.partner] : [root];

    this.tree.innerHTML =
      heading +
      this.row('Grandparents', grandparents) +
      this.row('Parents', k.parents) +
      this.row('Self & partner', selfRow, root) +
      this.row('Children', k.children) +
      '<div style="margin-top:10px;color:#667;text-align:center">click anyone to follow the line</div>';
  }
}
