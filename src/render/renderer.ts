import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import {
  C_POSITION, C_AGENT, C_SPECIES, C_FLORA, C_FAUNA, C_RESOURCE, C_BUSINESS, C_CLOCK, C_TILEMAP,
} from '../sim/components.ts';
import type {
  Position, Agent, SpeciesComp, Flora, Fauna, Resource, Business, Clock,
} from '../sim/components.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { wealthStats } from '../sim/wealth.ts';

const ACTION_COLOR: Record<string, string> = {
  wander:    '#e0e0ff',
  seek_food: '#ff9944',
  sleep:     '#7799ff',
  work:      '#ffd24a',
};

// Species are visibly distinct by dot radius (size) plus a species-coloured ring.
const SIZE_RADIUS: Record<string, number> = {
  small:  0.30,
  medium: 0.42,
  large:  0.54,
};

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly cellSize: number;
  private onEntityClick: ((entity: EntityId) => void) | null = null;
  private _pendingClick: { gx: number; gy: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cfg: SimConfig,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.cellSize = Math.floor(
      Math.min(canvas.width / cfg.gridWidth, canvas.height / cfg.gridHeight),
    );

    canvas.addEventListener('click', (e) => {
      // Map CSS click coords to canvas-internal pixels (the canvas may be
      // displayed at a different CSS size than its backing resolution).
      const r = canvas.getBoundingClientRect();
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      const gx = Math.floor((e.clientX - r.left) * scaleX / this.cellSize);
      const gy = Math.floor((e.clientY - r.top)  * scaleY / this.cellSize);
      this._pendingClick = { gx, gy };
    });
  }

  setClickHandler(cb: (entity: EntityId) => void): void {
    this.onEntityClick = cb;
  }

  render(world: World, clockEntity: EntityId): void {
    const { ctx, cellSize, cfg } = this;
    const W = cfg.gridWidth  * cellSize;
    const H = cfg.gridHeight * cellSize;

    ctx.fillStyle = '#10101e';
    ctx.fillRect(0, 0, W, H);

    // Biome terrain background (one fill per tile).
    const mapEnts = world.query(C_TILEMAP);
    const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
    if (map) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          ctx.fillStyle = map.colors[map.biomeIndex[y * map.width + x]];
          ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // Businesses — fixed buildings: a bordered square in the profession's colour.
    for (const e of world.query(C_BUSINESS, C_POSITION)) {
      const biz = world.getComponent<Business>(e, C_BUSINESS)!;
      const pos = world.getComponent<Position>(e, C_POSITION)!;
      const m = cellSize * 0.12;
      ctx.fillStyle = biz.color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(pos.x * cellSize + m, pos.y * cellSize + m, cellSize - 2 * m, cellSize - 2 * m);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#1a1a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x * cellSize + m, pos.y * cellSize + m, cellSize - 2 * m, cellSize - 2 * m);
    }

    // Resource nodes — small inset squares (brightness by remaining amount).
    for (const e of world.query(C_RESOURCE, C_POSITION)) {
      const r   = world.getComponent<Resource>(e, C_RESOURCE)!;
      const pos = world.getComponent<Position>(e, C_POSITION)!;
      const inset = cellSize * 0.28;
      ctx.globalAlpha = 0.4 + r.amount * 0.6;
      ctx.fillStyle = r.color;
      ctx.fillRect(pos.x * cellSize + inset, pos.y * cellSize + inset, cellSize - inset * 2, cellSize - inset * 2);
      ctx.globalAlpha = 1;
    }

    // Flora — circle whose size/opacity grows with maturity.
    for (const e of world.query(C_FLORA, C_POSITION)) {
      const f   = world.getComponent<Flora>(e, C_FLORA)!;
      const pos = world.getComponent<Position>(e, C_POSITION)!;
      const r = cellSize * (0.12 + f.maturity * 0.26);
      ctx.globalAlpha = 0.35 + f.maturity * 0.5;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(pos.x * cellSize + cellSize / 2, pos.y * cellSize + cellSize / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Fauna — diamonds, to read as distinct from round sapient agents.
    for (const e of world.query(C_FAUNA, C_POSITION)) {
      const fa  = world.getComponent<Fauna>(e, C_FAUNA)!;
      const pos = world.getComponent<Position>(e, C_POSITION)!;
      const cx = pos.x * cellSize + cellSize / 2;
      const cy = pos.y * cellSize + cellSize / 2;
      const r  = cellSize * 0.32;
      ctx.fillStyle = fa.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Sapient agents: fill colour = current action, ring colour + radius = species.
    for (const e of world.query(C_AGENT, C_POSITION)) {
      const agent   = world.getComponent<Agent>(e, C_AGENT)!;
      const pos     = world.getComponent<Position>(e, C_POSITION)!;
      const species = world.getComponent<SpeciesComp>(e, C_SPECIES);

      const cx = pos.x * cellSize + cellSize / 2;
      const cy = pos.y * cellSize + cellSize / 2;
      const r  = Math.max(2, cellSize * (SIZE_RADIUS[species?.size ?? 'medium'] ?? 0.42));

      ctx.fillStyle = ACTION_COLOR[agent.action] ?? '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      if (species) {
        ctx.strokeStyle = species.color;
        ctx.lineWidth = Math.max(1, cellSize * 0.12);
        ctx.stroke();
      }
    }

    // HUD overlay
    const clock = world.getComponent<Clock>(clockEntity, C_CLOCK)!;
    const pop   = world.query(C_AGENT).length;
    const fauna = world.query(C_FAUNA).length;
    const flora = world.query(C_FLORA).length;
    const w = wealthStats(world);
    const label = `Day ${clock.day}  ${clock.isDay ? '☀' : '☾'}  Hour ${clock.hour}  |  ` +
      `Folk ${pop}  Fauna ${fauna}  Flora ${flora}  |  median ${Math.round(w.median)}g  Gini ${w.gini.toFixed(2)}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, 28);
    ctx.fillStyle = '#ccd';
    ctx.font = '11px monospace';
    ctx.fillText(label, 8, 17);
  }

  // Called from main.ts after render. Picks the most interesting entity on the
  // clicked tile: sapient agent > fauna > resource > flora.
  consumeClick(world: World): EntityId | null {
    if (!this._pendingClick) return null;
    const { gx, gy } = this._pendingClick;
    this._pendingClick = null;

    const at = (component: string): EntityId | null => {
      for (const e of world.query(component, C_POSITION)) {
        const pos = world.getComponent<Position>(e, C_POSITION)!;
        if (pos.x === gx && pos.y === gy) return e;
      }
      return null;
    };

    const hit = at(C_AGENT) ?? at(C_FAUNA) ?? at(C_BUSINESS) ?? at(C_RESOURCE) ?? at(C_FLORA);
    if (hit !== null) this.onEntityClick?.(hit);
    return hit;
  }
}
