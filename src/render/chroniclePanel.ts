// A minimal read-only view of the Chronicle (the town's legends), toggled with
// the 'C' key. The rich "Legends" browser is a later milestone (M6); this is
// just enough to read the world's invented backstory while exploring.
import type { World } from '../sim/ecs.ts';
import { C_CHRONICLE } from '../sim/components.ts';
import { chronicleRecent } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';

export class ChroniclePanel {
  private readonly panel: HTMLDivElement;
  private visible = false;

  constructor() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position:   'fixed',
      left:       '50%',
      top:        '50%',
      transform:  'translate(-50%, -50%)',
      width:      'min(560px, 90vw)',
      maxHeight:  '70vh',
      background: 'rgba(10,10,26,0.96)',
      color:      '#e6e6f0',
      fontFamily: 'monospace',
      fontSize:   '13px',
      lineHeight: '1.7',
      padding:    '20px 24px',
      boxSizing:  'border-box',
      display:    'none',
      overflowY:  'auto',
      border:     '1px solid rgba(255,255,255,0.12)',
      borderRadius: '6px',
      boxShadow:  '0 8px 40px rgba(0,0,0,0.6)',
      zIndex:     '10',
    });
    document.body.appendChild(this.panel);
  }

  toggle(world: World): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.render(world);
  }

  render(world: World): void {
    const ents = world.query(C_CHRONICLE);
    const chronicle = ents.length ? world.getComponent<ChronicleData>(ents[0], C_CHRONICLE) : undefined;
    const entries = chronicle ? chronicleRecent(chronicle, 50) : [];

    const rows = entries.map(e => {
      const when = e.tick === 0 ? 'long ago' : `tick ${e.tick}`;
      return `<div style="margin:6px 0;padding-left:10px;border-left:2px solid rgba(255,210,120,0.5)">
        <span style="color:#888">${when}</span> — ${e.text}</div>`;
    }).join('');

    this.panel.innerHTML = `
      <div style="font-size:16px;font-weight:bold;color:#ffd278;margin-bottom:12px">The Chronicle</div>
      ${rows || '<div style="color:#888">No legends recorded yet.</div>'}
      <div style="margin-top:16px;color:#666">press C to close</div>`;
  }
}
