// Directory dashboard (M6.5 slice 3, hotkey F): a searchable roster of every soul
// in town. Type to filter by name; click a row to inspect them and jump the camera
// to where they are.
import type { World, EntityId } from '../sim/ecs.ts';
import { C_AGENT, C_SPECIES, C_JOB, C_WALLET, C_MAGIC, C_LINEAGE } from '../sim/components.ts';
import type { Agent, SpeciesComp, Job, Wallet, Lineage } from '../sim/components.ts';
import { ageInYears, defaultConfig } from '../sim/config.ts';
import { ModalPanel } from './modalPanel.ts';

export class DirectoryDashboard extends ModalPanel {
  private readonly input: HTMLInputElement;
  private readonly list: HTMLDivElement;
  private world: World | null = null;

  constructor(private readonly onSelect: (e: EntityId) => void) {
    super('Directory', '520px');

    this.input = document.createElement('input');
    this.input.placeholder = 'Search folk by name…';
    Object.assign(this.input.style, {
      width: '100%', boxSizing: 'border-box', background: '#10101e', color: '#eee',
      border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '8px 10px',
      font: '12.5px monospace', marginBottom: '8px',
    } as Partial<CSSStyleDeclaration>);
    this.input.addEventListener('input', () => this.renderList());

    this.list = document.createElement('div');
    this.list.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest('[data-id]') as HTMLElement | null;
      if (row) this.onSelect(Number(row.dataset.id));
    });

    this.body.append(this.input, this.list);
  }

  toggle(world: World): void {
    this.world = world;
    if (this.visible) { this.hide(); return; }
    this.reveal();
    this.renderList();
    this.input.focus();
  }

  refresh(world: World): void { this.world = world; if (this.visible) this.renderList(); }
  /** Master-tab API: render unconditionally, and focus the search box when shown. */
  update(world: World): void { this.world = world; this.renderList(); }
  focusSearch(): void { this.input.focus(); }

  private renderList(): void {
    const w = this.world;
    if (!w) return;
    const q = this.input.value.trim().toLowerCase();

    const folk = w.query(C_AGENT)
      .map(e => ({ e, a: w.getComponent<Agent>(e, C_AGENT)! }))
      .filter(({ a }) => !q || a.name.toLowerCase().includes(q))
      .sort((p, n) => p.a.name.localeCompare(n.a.name));

    this.titleEl.textContent = `Directory · ${folk.length} folk`;
    const countLine = `<div style="color:#9ab;margin:0 0 6px">${folk.length} folk${q ? ' matching' : ''}</div>`;

    const rows = folk.map(({ e, a }) => {
      const sp = w.getComponent<SpeciesComp>(e, C_SPECIES);
      const job = w.getComponent<Job>(e, C_JOB);
      const wallet = w.getComponent<Wallet>(e, C_WALLET);
      const lin = w.getComponent<Lineage>(e, C_LINEAGE);
      const mage = w.hasComponent(e, C_MAGIC);
      const age = Math.floor(ageInYears(a.ticksAlive, defaultConfig));
      const kids = lin ? lin.children.filter(c => w.hasComponent(c, C_AGENT)).length : 0;
      return `<div data-id="${e}" style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;border-top:1px solid rgba(255,255,255,0.05)"
        onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='transparent'">
        <span style="flex:1;color:#fff">${a.name}${mage ? ' <span style="color:#d090f0">✦</span>' : ''}</span>
        <span style="width:64px;color:#9ab">${sp?.name ?? 'folk'}</span>
        <span style="width:36px;text-align:right;color:#9ab">${age}y</span>
        <span style="width:96px;color:#aab">${job?.professionName ?? '—'}</span>
        <span style="width:54px;text-align:right">${wallet ? Math.round(wallet.gold) + 'g' : ''}</span>
        <span style="width:30px;text-align:right;color:#889">${kids ? '♟' + kids : ''}</span>
      </div>`;
    }).join('');

    this.list.innerHTML = countLine + (rows || '<div style="color:#778;padding:8px 0">no one by that name</div>');
  }
}
