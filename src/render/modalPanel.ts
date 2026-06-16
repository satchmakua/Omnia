// Shared chrome for the hotkey dashboards (M6.5 slice 3): a centred, scrollable
// overlay card with a title and a close button. Subclasses fill `body` and drive
// show/hide; the main loop refreshes whichever one is open so figures stay live.
export class ModalPanel {
  protected readonly panel: HTMLDivElement;
  protected readonly body: HTMLDivElement;
  protected readonly titleEl: HTMLDivElement;
  private _visible = false;

  constructor(title: string, width = '560px') {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      width: `min(${width}, 94vw)`, maxHeight: '84vh', background: 'rgba(10,10,26,0.97)',
      color: '#e6e6f0', fontFamily: 'monospace', fontSize: '12.5px', lineHeight: '1.6',
      padding: '16px 20px', boxSizing: 'border-box', display: 'none', overflowY: 'auto',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
      boxShadow: '0 12px 50px rgba(0,0,0,0.6)', zIndex: '12',
    } as Partial<CSSStyleDeclaration>);

    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px',
    } as Partial<CSSStyleDeclaration>);
    this.titleEl = document.createElement('div');
    Object.assign(this.titleEl.style, { fontSize: '15px', fontWeight: 'bold', color: '#ffd278' });
    this.titleEl.textContent = title;
    const close = document.createElement('button');
    close.textContent = '✕';
    Object.assign(close.style, {
      background: 'transparent', color: '#889', border: 'none', cursor: 'pointer', fontSize: '16px',
    } as Partial<CSSStyleDeclaration>);
    close.addEventListener('click', () => this.hide());
    header.append(this.titleEl, close);

    this.body = document.createElement('div');
    this.panel.append(header, this.body);
    document.body.appendChild(this.panel);
  }

  get visible(): boolean { return this._visible; }
  protected reveal(): void { this._visible = true; this.panel.style.display = 'block'; }
  hide(): void { this._visible = false; this.panel.style.display = 'none'; }
}

// Small shared bits the dashboards reuse.
export function bar(v: number, color = '#8fe88f', w = 120): string {
  const pct = Math.max(0, Math.min(100, Math.round(v * 100)));
  return `<span style="display:inline-block;width:${w}px;height:9px;background:rgba(255,255,255,0.08);border-radius:3px;vertical-align:middle">
    <span style="display:block;width:${pct}%;height:9px;background:${color};border-radius:3px"></span></span>`;
}

export const SECTION = 'color:#9ab;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:12px 0 5px';
