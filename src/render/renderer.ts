import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import { C_POSITION, C_AGENT, C_SPECIES, C_FOOD, C_CLOCK, C_TILEMAP } from '../sim/components.ts';
import type { Position, Agent, SpeciesComp, Food, Clock } from '../sim/components.ts';
import type { TileMapData } from '../world/tilemap.ts';

const ACTION_COLOR: Record<string, string> = {
  wander:    '#e0e0ff',
  seek_food: '#ff9944',
  sleep:     '#7799ff',
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
  private onAgentClick: ((entity: EntityId) => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cfg: SimConfig,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.cellSize = Math.floor(
      Math.min(canvas.width / cfg.gridWidth, canvas.height / cfg.gridHeight),
    );

    canvas.addEventListener('click', (e) => {
      const r  = canvas.getBoundingClientRect();
      const gx = Math.floor((e.clientX - r.left)  / this.cellSize);
      const gy = Math.floor((e.clientY - r.top)   / this.cellSize);
      this.handleClick(gx, gy);
    });
  }

  setClickHandler(cb: (entity: EntityId) => void): void {
    this.onAgentClick = cb;
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

    // Food sources — bright inset marker so they read over any biome colour.
    for (const e of world.query(C_FOOD, C_POSITION)) {
      const food = world.getComponent<Food>(e, C_FOOD)!;
      const pos  = world.getComponent<Position>(e, C_POSITION)!;
      const inset = cellSize * (0.5 - food.amount * 0.18); // fuller = bigger marker
      ctx.fillStyle = `rgba(180,255,120,${(0.35 + food.amount * 0.55).toFixed(2)})`;
      ctx.fillRect(
        pos.x * cellSize + inset, pos.y * cellSize + inset,
        cellSize - inset * 2, cellSize - inset * 2,
      );
    }

    // Agents: fill colour = current action, ring colour + radius = species.
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
    const label = `Day ${clock.day}  ${clock.isDay ? '☀' : '☾'}  Hour ${clock.hour}  |  Pop ${pop}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, 28);
    ctx.fillStyle = '#ccd';
    ctx.font = '11px monospace';
    ctx.fillText(label, 8, 17);
  }

  private handleClick(gx: number, gy: number): void {
    // No world reference stored; caller supplies it via the closure in main.ts.
    this._pendingClick = { gx, gy };
  }

  // Called from main.ts after render with the current world snapshot.
  consumeClick(world: World): EntityId | null {
    if (!this._pendingClick) return null;
    const { gx, gy } = this._pendingClick;
    this._pendingClick = null;

    const agents = world.query(C_AGENT, C_POSITION);
    for (const e of agents) {
      const pos = world.getComponent<Position>(e, C_POSITION)!;
      if (pos.x === gx && pos.y === gy) {
        this.onAgentClick?.(e);
        return e;
      }
    }
    return null;
  }

  private _pendingClick: { gx: number; gy: number } | null = null;
}
