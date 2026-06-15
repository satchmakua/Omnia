import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import {
  C_POSITION, C_AGENT, C_SPECIES, C_MAGIC, C_FLORA, C_FAUNA, C_RESOURCE, C_BUSINESS,
  C_TOMBSTONE, C_CLOCK, C_TILEMAP,
} from '../sim/components.ts';
import type {
  Position, Agent, SpeciesComp, Flora, Fauna, Resource, Business, Clock,
} from '../sim/components.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { wealthStats } from '../sim/wealth.ts';
import { ageInYears } from '../sim/config.ts';

// A distinct silhouette per class so the world reads at a glance:
//   folk = pawn (head + body)    fauna = triangle    flora = sprout
//   resource = block (square)    business = house (square + roof)
const ACTION_COLOR: Record<string, string> = {
  wander:    '#dfe2ff',
  seek_food: '#ff9944',
  sleep:     '#6f8bff',
  work:      '#ffd24a',
  socialize: '#ff86c8',
};

const SIZE_RADIUS: Record<string, number> = { small: 0.30, medium: 0.40, large: 0.50 };

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
    this.cellSize = Math.floor(Math.min(canvas.width / cfg.gridWidth, canvas.height / cfg.gridHeight));

    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      const gx = Math.floor((e.clientX - r.left) * scaleX / this.cellSize);
      const gy = Math.floor((e.clientY - r.top)  * scaleY / this.cellSize);
      this._pendingClick = { gx, gy };
    });
  }

  setClickHandler(cb: (entity: EntityId) => void): void { this.onEntityClick = cb; }

  render(world: World, clockEntity: EntityId): void {
    const { ctx, cellSize, cfg } = this;
    const W = cfg.gridWidth * cellSize;
    const H = cfg.gridHeight * cellSize;

    ctx.fillStyle = '#10101e';
    ctx.fillRect(0, 0, W, H);

    // Biome terrain background.
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

    // ── Flora: sprouts (drawn first / lowest) ────────────────────────────────
    for (const e of world.query(C_FLORA, C_POSITION)) {
      const f = world.getComponent<Flora>(e, C_FLORA)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      this.drawSprout(p.x, p.y, f.color, f.maturity);
    }

    // ── Resource nodes: mineral blocks ───────────────────────────────────────
    for (const e of world.query(C_RESOURCE, C_POSITION)) {
      const r = world.getComponent<Resource>(e, C_RESOURCE)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      this.drawBlock(p.x, p.y, r.color, r.amount);
    }

    // ── Businesses: houses ───────────────────────────────────────────────────
    for (const e of world.query(C_BUSINESS, C_POSITION)) {
      const biz = world.getComponent<Business>(e, C_BUSINESS)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      this.drawHouse(p.x, p.y, biz.color);
    }

    // ── Fauna: triangles ─────────────────────────────────────────────────────
    for (const e of world.query(C_FAUNA, C_POSITION)) {
      const fa = world.getComponent<Fauna>(e, C_FAUNA)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      this.drawTriangle(p.x, p.y, fa.color);
    }

    // ── Folk: pawns (head + body), drawn on top ──────────────────────────────
    for (const e of world.query(C_AGENT, C_POSITION)) {
      const agent = world.getComponent<Agent>(e, C_AGENT)!;
      const sp = world.getComponent<SpeciesComp>(e, C_SPECIES);
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const ageFactor = 0.55 + 0.45 * Math.min(1, ageInYears(agent.ticksAlive, cfg) / cfg.adultAgeYears);
      const scale = (SIZE_RADIUS[sp?.size ?? 'medium'] ?? 0.40) * ageFactor;
      this.drawPawn(p.x, p.y, sp?.color ?? '#ddd', ACTION_COLOR[agent.action] ?? '#fff',
        scale, world.hasComponent(e, C_MAGIC));
    }

    this.drawHud(world, clockEntity, W);
  }

  // ── shape helpers ──────────────────────────────────────────────────────────
  private drawSprout(gx: number, gy: number, color: string, maturity: number): void {
    const { ctx, cellSize: c } = this;
    const cx = gx * c + c / 2, base = gy * c + c * 0.8;
    const h = c * (0.2 + maturity * 0.4);
    ctx.globalAlpha = 0.5 + maturity * 0.5;
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, c * 0.08);
    ctx.beginPath(); ctx.moveTo(cx, base); ctx.lineTo(cx, base - h); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, base - h, c * (0.1 + maturity * 0.14), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawBlock(gx: number, gy: number, color: string, amount: number): void {
    const { ctx, cellSize: c } = this;
    const m = c * 0.26;
    ctx.globalAlpha = 0.45 + amount * 0.55;
    ctx.fillStyle = color;
    ctx.fillRect(gx * c + m, gy * c + m, c - 2 * m, c - 2 * m);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(gx * c + m, gy * c + m, c - 2 * m, c - 2 * m);
  }

  private drawHouse(gx: number, gy: number, color: string): void {
    const { ctx, cellSize: c } = this;
    const x = gx * c, y = gy * c, m = c * 0.14;
    const left = x + m, right = x + c - m, top = y + c * 0.42, bottom = y + c - m;
    ctx.fillStyle = color;
    ctx.fillRect(left, top, right - left, bottom - top);          // body
    ctx.beginPath();                                              // roof
    ctx.moveTo(left - c * 0.04, top); ctx.lineTo(x + c / 2, y + m); ctx.lineTo(right + c * 0.04, top);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#15151f'; ctx.lineWidth = 1;
    ctx.strokeRect(left, top, right - left, bottom - top);
  }

  private drawTriangle(gx: number, gy: number, color: string): void {
    const { ctx, cellSize: c } = this;
    const cx = gx * c + c / 2, cy = gy * c + c / 2, r = c * 0.34;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r); ctx.lineTo(cx - r, cy + r);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  }

  private drawPawn(gx: number, gy: number, species: string, action: string, scale: number, mage: boolean): void {
    const { ctx, cellSize: c } = this;
    const cx = gx * c + c / 2, cy = gy * c + c / 2;
    const bodyR = Math.max(2, c * scale);
    const headR = bodyR * 0.6;
    ctx.fillStyle = species;
    ctx.strokeStyle = action;
    ctx.lineWidth = Math.max(1, c * 0.13);
    ctx.beginPath(); ctx.arc(cx, cy + bodyR * 0.35, bodyR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // body
    ctx.beginPath(); ctx.arc(cx, cy - bodyR * 0.55, headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // head
    if (mage) {
      ctx.fillStyle = '#e090ff';
      ctx.beginPath(); ctx.arc(cx, cy + bodyR * 0.35, Math.max(1, bodyR * 0.4), 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawHud(world: World, clockEntity: EntityId, W: number): void {
    const { ctx } = this;
    const clock = world.getComponent<Clock>(clockEntity, C_CLOCK)!;
    const yr = (clock.tick / (this.cfg.ticksPerDay * this.cfg.daysPerYear)).toFixed(0);
    const pop = world.query(C_AGENT).length;
    const mages = world.query(C_AGENT, C_MAGIC).length;
    const graves = world.query(C_TOMBSTONE).length;
    const fauna = world.query(C_FAUNA).length;
    const w = wealthStats(world);
    const label = `Year ${yr}  Day ${clock.day}  ${clock.isDay ? '☀' : '☾'}  |  ` +
      `Folk ${pop}  Mages ${mages}  Graves ${graves}  |  Fauna ${fauna}  |  Gini ${w.gini.toFixed(2)}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, 28);
    ctx.fillStyle = '#ccd';
    ctx.font = '11px monospace';
    ctx.fillText(label, 8, 17);
  }

  // Picks the most interesting entity on the clicked tile: folk > fauna > business > resource > flora.
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
