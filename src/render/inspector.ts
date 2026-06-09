import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import { C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES } from '../sim/components.ts';
import type { Agent, Needs, Wallet, Position, SpeciesComp } from '../sim/components.ts';

function bar(v: number): string {
  const filled = Math.round(v * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${Math.round(v * 100)}%`;
}

export class Inspector {
  private readonly panel: HTMLDivElement;
  private selected: EntityId | null = null;

  constructor() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position:   'fixed',
      right:      '0',
      top:        '0',
      width:      '230px',
      height:     '100vh',
      background: 'rgba(8,8,24,0.92)',
      color:      '#dde',
      fontFamily: 'monospace',
      fontSize:   '12px',
      lineHeight: '1.7',
      padding:    '14px',
      boxSizing:  'border-box',
      display:    'none',
      overflowY:  'auto',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
    });
    document.body.appendChild(this.panel);
  }

  inspect(entity: EntityId, world: World): void {
    this.selected = entity;
    this.panel.style.display = 'block';
    this._render(entity, world);
  }

  update(world: World): void {
    if (this.selected === null) return;
    if (!world.isAlive(this.selected)) {
      this.panel.innerHTML =
        '<b style="color:#f88">Agent died</b><br>' +
        '<button id="ii-close" style="margin-top:8px;background:#333;color:#eee;border:none;cursor:pointer;padding:3px 8px">✕ Close</button>';
      document.getElementById('ii-close')?.addEventListener('click', () => this.close());
      this.selected = null;
      return;
    }
    this._render(this.selected, world);
  }

  close(): void {
    this.selected = null;
    this.panel.style.display = 'none';
  }

  private _render(entity: EntityId, world: World): void {
    const agent   = world.getComponent<Agent>(entity, C_AGENT)!;
    const needs   = world.getComponent<Needs>(entity, C_NEEDS)!;
    const wallet  = world.getComponent<Wallet>(entity, C_WALLET)!;
    const pos     = world.getComponent<Position>(entity, C_POSITION)!;
    const species = world.getComponent<SpeciesComp>(entity, C_SPECIES);

    const speciesLine = species
      ? `<div><b>Species</b> <span style="color:${species.color}">${species.name}</span> (${species.size})</div>`
      : '';

    this.panel.innerHTML = `
      <button id="ii-close" style="float:right;background:transparent;color:#888;border:none;cursor:pointer;font-size:16px">✕</button>
      <div style="font-size:14px;font-weight:bold;margin-bottom:8px;color:#fff">${agent.name}</div>
      ${speciesLine}
      <div><b>Action</b> ${agent.action}</div>
      <div><b>Age</b> ${agent.ticksAlive} ticks</div>
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="border-color:rgba(255,255,255,0.1);margin:8px 0">
      <div style="color:#aac;font-size:11px;text-transform:uppercase;letter-spacing:1px">Needs</div>
      <div>Hunger ${bar(needs.hunger)}</div>
      <div>Energy ${bar(needs.energy)}</div>
      <hr style="border-color:rgba(255,255,255,0.1);margin:8px 0">
      <div style="color:#aac;font-size:11px;text-transform:uppercase;letter-spacing:1px">Wallet</div>
      <div>Gold ${wallet.gold.toFixed(1)}</div>
    `;
    document.getElementById('ii-close')?.addEventListener('click', () => this.close());
  }
}
