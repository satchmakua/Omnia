import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import { C_POSITION, C_AGENT, C_FOOD, C_CLOCK } from '../sim/components.ts';
import type { Position, Agent, Food, Clock } from '../sim/components.ts';

const ACTION_COLOR: Record<string, string> = {
  wander:    '#e0e0ff',
  seek_food: '#ff9944',
  sleep:     '#7799ff',
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

    // Food sources
    for (const e of world.query(C_FOOD, C_POSITION)) {
      const food = world.getComponent<Food>(e, C_FOOD)!;
      const pos  = world.getComponent<Position>(e, C_POSITION)!;
      const a = 0.15 + food.amount * 0.6;
      ctx.fillStyle = `rgba(40,200,90,${a.toFixed(2)})`;
      ctx.fillRect(pos.x * cellSize, pos.y * cellSize, cellSize, cellSize);
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= cfg.gridWidth; x++) {
      ctx.beginPath(); ctx.moveTo(x * cellSize, 0); ctx.lineTo(x * cellSize, H); ctx.stroke();
    }
    for (let y = 0; y <= cfg.gridHeight; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cellSize); ctx.lineTo(W, y * cellSize); ctx.stroke();
    }

    // Agents
    const r = Math.max(2, cellSize / 2 - 1);
    for (const e of world.query(C_AGENT, C_POSITION)) {
      const agent = world.getComponent<Agent>(e, C_AGENT)!;
      const pos   = world.getComponent<Position>(e, C_POSITION)!;
      ctx.fillStyle = ACTION_COLOR[agent.action] ?? '#fff';
      ctx.beginPath();
      ctx.arc(pos.x * cellSize + cellSize / 2, pos.y * cellSize + cellSize / 2, r, 0, Math.PI * 2);
      ctx.fill();
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
