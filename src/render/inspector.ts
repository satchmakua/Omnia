import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES, C_FAUNA, C_FLORA, C_RESOURCE, C_TILEMAP,
} from '../sim/components.ts';
import type {
  Agent, Needs, Wallet, Position, SpeciesComp, Fauna, Flora, Resource,
} from '../sim/components.ts';
import { biomeNameAt, inBounds } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';

function bar(v: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(v * 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${Math.round(v * 100)}%`;
}

const SECTION = 'color:#aac;font-size:11px;text-transform:uppercase;letter-spacing:1px';
const RULE = 'border-color:rgba(255,255,255,0.1);margin:8px 0';

export class Inspector {
  private readonly panel: HTMLDivElement;
  private selected: EntityId | null = null;

  constructor() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position:   'fixed',
      right:      '0',
      top:        '0',
      width:      '240px',
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
        '<b style="color:#f88">— gone —</b><br>' +
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

  private terrainLine(world: World, pos: Position): string {
    const mapEnts = world.query(C_TILEMAP);
    const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
    return (map && inBounds(map, pos.x, pos.y))
      ? `<div><b>Terrain</b> ${biomeNameAt(map, pos.x, pos.y)}</div>` : '';
  }

  private _render(entity: EntityId, world: World): void {
    const pos = world.getComponent<Position>(entity, C_POSITION)!;
    let body: string;

    if (world.hasComponent(entity, C_AGENT)) {
      body = this._agent(world, entity, pos);
    } else if (world.hasComponent(entity, C_FAUNA)) {
      body = this._fauna(world, entity, pos);
    } else if (world.hasComponent(entity, C_RESOURCE)) {
      body = this._resource(world, entity, pos);
    } else if (world.hasComponent(entity, C_FLORA)) {
      body = this._flora(world, entity, pos);
    } else {
      body = '<div>—</div>';
    }

    this.panel.innerHTML =
      `<button id="ii-close" style="float:right;background:transparent;color:#888;border:none;cursor:pointer;font-size:16px">✕</button>${body}`;
    document.getElementById('ii-close')?.addEventListener('click', () => this.close());
  }

  private title(text: string, sub: string): string {
    return `<div style="font-size:14px;font-weight:bold;margin-bottom:2px;color:#fff">${text}</div>` +
           `<div style="color:#99a;margin-bottom:8px">${sub}</div>`;
  }

  private _agent(world: World, e: EntityId, pos: Position): string {
    const agent   = world.getComponent<Agent>(e, C_AGENT)!;
    const needs   = world.getComponent<Needs>(e, C_NEEDS)!;
    const wallet  = world.getComponent<Wallet>(e, C_WALLET)!;
    const species = world.getComponent<SpeciesComp>(e, C_SPECIES);
    const speciesLine = species
      ? `<div><b>Species</b> <span style="color:${species.color}">${species.name}</span> (${species.size})</div>` : '';
    return `
      ${this.title(agent.name, 'sapient · folk')}
      ${speciesLine}
      ${this.terrainLine(world, pos)}
      <div><b>Action</b> ${agent.action}</div>
      <div><b>Age</b> ${agent.ticksAlive} ticks</div>
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Needs</div>
      <div>Hunger ${bar(needs.hunger)}</div>
      <div>Energy ${bar(needs.energy)}</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Wallet</div>
      <div>Gold ${wallet.gold.toFixed(1)}</div>`;
  }

  private _fauna(world: World, e: EntityId, pos: Position): string {
    const fa = world.getComponent<Fauna>(e, C_FAUNA)!;
    return `
      ${this.title(fa.name, 'fauna · instinct (no LLM)')}
      <div><b>Colour</b> <span style="color:${fa.color}">${fa.color}</span></div>
      ${this.terrainLine(world, pos)}
      <div><b>Age</b> ${fa.ticksAlive} ticks</div>
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Instinct</div>
      <div>Hunger ${bar(fa.hunger)}</div>
      <div><b>Breed in</b> ${fa.breedCooldownTicks} ticks</div>`;
  }

  private _flora(world: World, e: EntityId, pos: Position): string {
    const f = world.getComponent<Flora>(e, C_FLORA)!;
    const ripe = f.maturity >= f.edibleAt ? '<span style="color:#8f8">ripe</span>' : 'growing';
    return `
      ${this.title(f.name, 'flora · no brain')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Plant</div>
      <div>Maturity ${bar(f.maturity)}</div>
      <div><b>State</b> ${ripe}</div>
      <div><b>Food yield</b> ${f.foodYield.toFixed(2)}</div>`;
  }

  private _resource(world: World, e: EntityId, pos: Position): string {
    const r = world.getComponent<Resource>(e, C_RESOURCE)!;
    return `
      ${this.title(r.name, 'resource · no brain')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Node</div>
      <div>Amount ${bar(r.amount)}</div>
      <div><b>Type</b> ${r.renewable ? 'renewable' : 'finite'}</div>`;
  }
}
