// The master tabbed view (M10 slice 1, hotkey Tab / per-view hotkeys): ONE modal that
// holds every global view as a scrollable tab, replacing the flat list of separate
// dashboards. Each view hands over its persistent content element (`el`); the master
// hosts them all in a shared slot and just shows/refreshes the active one — so the
// directory's search box, the family tree's navigation, etc. keep their state across
// tab switches. New views are just one more `register()` call.
import type { World } from '../sim/ecs.ts';

export interface MasterTab {
  id: string;
  label: string;
  hotkey: string;                       // the single key that jumps straight to this tab
  el: HTMLElement;                       // the view's persistent content element
  update: (world: World) => void;       // (re)render the live content
  onShow?: (world: World) => void;       // e.g. focus a search box when the tab opens
}

export class MasterPanel {
  private readonly panel: HTMLDivElement;
  private readonly tabBar: HTMLDivElement;
  private readonly slot: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly tabs: MasterTab[] = [];
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private activeId: string | null = null;
  private world: World | null = null;
  private _visible = false;

  constructor() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      width: 'min(760px, 94vw)', height: 'min(80vh, 840px)', background: 'rgba(10,10,26,0.98)',
      color: '#e6e6f0', fontFamily: 'monospace', fontSize: '12.5px', lineHeight: '1.6',
      display: 'none', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
      boxShadow: '0 12px 50px rgba(0,0,0,0.6)', zIndex: '12',
    } as Partial<CSSStyleDeclaration>);

    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 6px', flex: '0 0 auto' } as Partial<CSSStyleDeclaration>);
    this.titleEl = document.createElement('div');
    Object.assign(this.titleEl.style, { fontSize: '15px', fontWeight: 'bold', color: '#ffd278' } as Partial<CSSStyleDeclaration>);
    const close = document.createElement('button');
    close.textContent = '✕';
    Object.assign(close.style, { background: 'transparent', color: '#889', border: 'none', cursor: 'pointer', fontSize: '16px' } as Partial<CSSStyleDeclaration>);
    close.addEventListener('click', () => this.hide());
    header.append(this.titleEl, close);

    this.tabBar = document.createElement('div');
    Object.assign(this.tabBar.style, { display: 'flex', gap: '4px', padding: '0 12px', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.1)', flex: '0 0 auto' } as Partial<CSSStyleDeclaration>);

    this.slot = document.createElement('div');
    Object.assign(this.slot.style, { flex: '1 1 auto', overflowY: 'auto', padding: '12px 16px' } as Partial<CSSStyleDeclaration>);

    this.panel.append(header, this.tabBar, this.slot);
    document.body.appendChild(this.panel);
  }

  register(tab: MasterTab): void {
    this.tabs.push(tab);
    const btn = document.createElement('button');
    btn.textContent = `${tab.label} · ${tab.hotkey.toUpperCase()}`;
    Object.assign(btn.style, {
      background: '#23233a', color: '#cdd', border: '1px solid rgba(255,255,255,0.12)',
      borderBottom: 'none', borderRadius: '7px 7px 0 0', padding: '7px 11px', margin: '6px 0 0',
      font: '12px monospace', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto',
    } as Partial<CSSStyleDeclaration>);
    btn.addEventListener('click', () => { if (this.world) this.select(tab.id, this.world); });
    this.buttons.set(tab.id, btn);
    this.tabBar.append(btn);
    tab.el.style.display = 'none';
    this.slot.append(tab.el);   // adopt the view's content element
  }

  /** True if `key` is one of the registered tab hotkeys. */
  isTabKey(key: string): boolean {
    const k = key.toLowerCase();
    return this.tabs.some(t => t.hotkey === k);
  }

  get visible(): boolean { return this._visible; }

  // Open straight to a tab (per-view hotkey), or toggle it shut if already on it.
  openTab(key: string, world: World): void {
    const tab = this.tabs.find(t => t.hotkey === key.toLowerCase());
    if (!tab) return;
    if (this._visible && this.activeId === tab.id) { this.hide(); return; }
    this._visible = true;
    this.panel.style.display = 'flex';
    this.select(tab.id, world);
  }

  /** Open the master view on the current/first tab (the master hotkey). */
  open(world: World): void {
    if (this._visible) { this.hide(); return; }
    this._visible = true;
    this.panel.style.display = 'flex';
    this.select(this.activeId ?? this.tabs[0]?.id ?? '', world);
  }

  hide(): void { this._visible = false; this.panel.style.display = 'none'; }

  private select(tabId: string, world: World): void {
    this.world = world;
    this.activeId = tabId;
    for (const t of this.tabs) {
      const on = t.id === tabId;
      t.el.style.display = on ? 'block' : 'none';
      const btn = this.buttons.get(t.id)!;
      btn.style.background = on ? '#3a3a66' : '#23233a';
      btn.style.color = on ? '#fff' : '#cdd';
      if (on) {
        this.titleEl.textContent = t.label;
        t.onShow?.(world);
        t.update(world);
      }
    }
  }

  /** Keep the open tab's figures live (called throttled from the loop). */
  refresh(world: World): void {
    if (!this._visible || this.activeId == null) return;
    this.world = world;
    this.tabs.find(t => t.id === this.activeId)?.update(world);
  }
}
