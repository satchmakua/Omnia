import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import type { SimConfig } from '../sim/config.ts';
import {
  C_POSITION, C_AGENT, C_MAGIC, C_HEALTH, C_FLORA, C_FAUNA, C_RESOURCE, C_BUSINESS, C_HOME, C_CIVIC, C_RUIN, C_WONDERSITE,
  C_QUEST, C_CRIME, C_COMBAT, C_SPECIAL, C_FISH,
  C_CLOCK, C_TILEMAP, C_EVENTLOG,
} from '../sim/components.ts';
import type {
  Position, Agent, Health, Flora, Fauna, Resource, Business, Clock, Ruin, Combat, Special, Civic,
} from '../sim/components.ts';
import type { EventLogData } from '../history/eventlog.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { isWater } from '../world/tilemap.ts';
import { getOrgStore } from '../org/orgStore.ts';
import { ageInYears, calendarOf } from '../sim/config.ts';
import { CATEGORY_COLOR, resourceIcon } from './icons.ts';
import { isEmoji, EMOJI, faunaEmoji } from './skin.ts';

// Real-world watch time as H:MM:SS (or M:SS under an hour).
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

// A category-first map vocabulary (M6.5): one clear icon per *kind* of thing, dual-
// coded by shape AND accent colour so it reads even when small. Folk are one icon
// (races aren't distinguished); state shows as small badges. A camera (zoom + pan)
// lets you read the town close up or take in the whole map.

const BADGE = {
  mage:      '#c79bf0',
  ill:       '#e06666',
  work:      '#e6b15a',
  sleep:     '#9fb6d9',
  seek_food: '#ef9f6a',
  socialize: '#ef8fc0',
  relax:     '#7fd6b0',
};

// The 8-neighbourhood, for the "in company" chat badge (M10 slice 4.5).
const NEIGH8: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const MIN_SCALE = 1;
const MAX_SCALE = 9;

// A soft time-of-day wash over the map (D13: pastel, muted, calm). Keyframes are [dayFraction,
// r, g, b, alpha]; the sim's day runs f∈[0,0.5) (f=0 dawn) and night f∈[0.5,1) (ClockSystem),
// so this is a warm sunrise at 0, clear day, a warm sunset at 0.5, then a cool blue night.
const DAY_NIGHT_KF: readonly [number, number, number, number, number][] = [
  [0.00, 255, 150, 95, 0.16],   // dawn — warm rose (day begins)
  [0.08, 255, 205, 160, 0.0],   // early morning — clear
  [0.42, 255, 240, 215, 0.0],   // late day — clear
  [0.50, 255, 125, 70, 0.18],   // dusk — warm amber (night begins)
  [0.60, 40, 52, 96, 0.28],     // early night — blue
  [0.75, 24, 34, 78, 0.34],     // deep night — deepest blue
  [0.92, 36, 48, 92, 0.25],     // pre-dawn — easing
  [1.00, 255, 150, 95, 0.16],   // wraps to dawn
];
function dayNightTint(f: number): [number, number, number, number] {
  f = ((f % 1) + 1) % 1;
  for (let i = 1; i < DAY_NIGHT_KF.length; i++) {
    const b = DAY_NIGHT_KF[i];
    if (f <= b[0]) {
      const a = DAY_NIGHT_KF[i - 1];
      const t = (f - a[0]) / (b[0] - a[0] || 1);
      return [
        Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t),
        Math.round(a[3] + (b[3] - a[3]) * t), a[4] + (b[4] - a[4]) * t,
      ];
    }
  }
  return [DAY_NIGHT_KF[0][1], DAY_NIGHT_KF[0][2], DAY_NIGHT_KF[0][3], DAY_NIGHT_KF[0][4]];
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cellSize: number;
  private mapW: number;
  private mapH: number;
  private onEntityClick: ((entity: EntityId) => void) | null = null;
  onTileClick: ((x: number, y: number) => void) | null = null;   // empty-tile click → inspect terrain (M24)
  private _pendingClick: { gx: number; gy: number } | null = null;

  // Camera: screen = world*scale + offset (world is in map pixels).
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dragging = false;
  private down = false;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;

  // Combat FX (M16 legibility): brief fading marks at the sites of fights & deaths, ingested
  // render-only from the EventLog (combat events now carry a position). Zero sim cost.
  private flashes: { x: number; y: number; kind: string; age: number }[] = [];
  private lastFxTick = -1;

  // Smooth movement: mobile creatures snap one tile per tick; the renderer glides them between
  // their previous and current tiles so motion reads fluidly. Updated on tick boundaries
  // (`syncPositions`) and drawn at an interpolation `alpha`. Pure render — the sim is untouched.
  private interp = new Map<EntityId, { px: number; py: number; cx: number; cy: number }>();
  private lastTintTick = -1;   // for damping the day/night wash at fast-forward (no strobe)

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private cfg: SimConfig,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.cellSize = Math.floor(Math.min(canvas.width / cfg.gridWidth, canvas.height / cfg.gridHeight));
    this.mapW = cfg.gridWidth * this.cellSize;
    this.mapH = cfg.gridHeight * this.cellSize;
    canvas.style.cursor = 'grab';
    this.clampOffset();
    this.bindInput();
  }

  // Reconfigure for a (possibly different-sized) world and reset the camera to fit —
  // so a new run with a chosen map size renders, clamps, and click-maps correctly.
  configure(cfg: SimConfig): void {
    this.cfg = cfg;
    this.cellSize = Math.max(1, Math.floor(Math.min(this.canvas.width / cfg.gridWidth, this.canvas.height / cfg.gridHeight)));
    this.mapW = cfg.gridWidth * this.cellSize;
    this.mapH = cfg.gridHeight * this.cellSize;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.flashes = [];
    this.lastFxTick = -1;
    this.interp.clear();
    this.clampOffset();
  }

  // Snapshot mobile-creature tiles at a tick boundary so the renderer can glide between the
  // previous and current tile. A >1-tile jump (a spawn, or a resync after fast-forward) snaps
  // rather than gliding. Called by the main loop once per tick while interpolating.
  syncPositions(world: World): void {
    const seen = new Set<EntityId>();
    for (const marker of [C_AGENT, C_FAUNA]) {
      for (const e of world.query(marker, C_POSITION)) {
        if (seen.has(e)) continue;
        seen.add(e);
        const p = world.getComponent<Position>(e, C_POSITION)!;
        const ip = this.interp.get(e);
        if (!ip) { this.interp.set(e, { px: p.x, py: p.y, cx: p.x, cy: p.y }); continue; }
        if (Math.abs(p.x - ip.cx) > 1 || Math.abs(p.y - ip.cy) > 1) { ip.px = ip.cx = p.x; ip.py = ip.cy = p.y; }
        else { ip.px = ip.cx; ip.py = ip.cy; ip.cx = p.x; ip.cy = p.y; }
      }
    }
    for (const e of this.interp.keys()) if (!seen.has(e)) this.interp.delete(e);
  }
  clearInterp(): void { this.interp.clear(); }

  setClickHandler(cb: (entity: EntityId) => void): void { this.onEntityClick = cb; }

  // ── camera ───────────────────────────────────────────────────────────────────
  private canvasPos(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.canvas.height / r.height),
    };
  }

  private clampOffset(): void {
    const viewW = this.canvas.width, viewH = this.canvas.height;
    const w = this.mapW * this.scale, h = this.mapH * this.scale;
    this.offsetX = w <= viewW ? (viewW - w) / 2 : Math.min(0, Math.max(viewW - w, this.offsetX));
    this.offsetY = h <= viewH ? (viewH - h) / 2 : Math.min(0, Math.max(viewH - h, this.offsetY));
  }

  zoomAt(cx: number, cy: number, factor: number): void {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
    if (next === this.scale) return;
    const wx = (cx - this.offsetX) / this.scale, wy = (cy - this.offsetY) / this.scale;
    this.scale = next;
    this.offsetX = cx - wx * this.scale;
    this.offsetY = cy - wy * this.scale;
    this.clampOffset();
  }

  /** Pan by a fraction of the viewport (used by arrow keys). */
  panBy(fx: number, fy: number): void {
    this.offsetX -= fx * this.canvas.width;
    this.offsetY -= fy * this.canvas.height;
    this.clampOffset();
  }

  /** Centre the view on a grid tile (used by the directory "jump to" action). */
  centerOn(gx: number, gy: number): void {
    if (this.scale < 2.5) this.scale = 2.5;        // zoom in a little so it's worth jumping
    const px = (gx + 0.5) * this.cellSize, py = (gy + 0.5) * this.cellSize;
    this.offsetX = this.canvas.width / 2 - px * this.scale;
    this.offsetY = this.canvas.height / 2 - py * this.scale;
    this.clampOffset();
  }

  private bindInput(): void {
    const cv = this.canvas;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { x, y } = this.canvasPos(e);
      this.zoomAt(x, y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    cv.addEventListener('mousedown', (e) => {
      this.down = true; this.dragging = false; this.moved = 0;
      const p = this.canvasPos(e); this.lastX = p.x; this.lastY = p.y;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.down) return;
      const p = this.canvasPos(e);
      const dx = p.x - this.lastX, dy = p.y - this.lastY;
      this.lastX = p.x; this.lastY = p.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.moved > 4) { this.dragging = true; cv.style.cursor = 'grabbing'; }
      if (this.dragging) { this.offsetX += dx; this.offsetY += dy; this.clampOffset(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.down) return;
      this.down = false; cv.style.cursor = 'grab';
      if (this.dragging) return;                 // a drag, not a click
      const p = this.canvasPos(e);
      const gx = Math.floor((p.x - this.offsetX) / this.scale / this.cellSize);
      const gy = Math.floor((p.y - this.offsetY) / this.scale / this.cellSize);
      this._pendingClick = { gx, gy };
    });
  }

  // ── render ───────────────────────────────────────────────────────────────────
  render(world: World, clockEntity: EntityId, elapsedMs = 0, alpha = 1): void {
    const { ctx, cellSize, cfg } = this;
    const smooth = alpha < 1 && this.interp.size > 0;
    const drawX = (e: EntityId, raw: number) => { const ip = smooth ? this.interp.get(e) : undefined; return ip ? ip.px + (ip.cx - ip.px) * alpha : raw; };
    const drawY = (e: EntityId, raw: number) => { const ip = smooth ? this.interp.get(e) : undefined; return ip ? ip.py + (ip.cy - ip.py) * alpha : raw; };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0b14';                   // void beyond the map edge
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);

    // Biome terrain.
    const mapEnts = world.query(C_TILEMAP);
    const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
    if (map) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          ctx.fillStyle = map.colors[map.biomeIndex[y * map.width + x]];
          ctx.fillRect(x * cellSize, y * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
      }
    }

    const emoji = isEmoji();   // M34: the emoji skin draws each entity as a system emoji glyph
    for (const e of world.query(C_FLORA, C_POSITION)) {
      const f = world.getComponent<Flora>(e, C_FLORA)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (emoji) this.drawEmoji(p.x, p.y, EMOJI[f.maturity >= f.edibleAt ? 'plantRipe' : 'plant']);
      else this.iconPlant(p.x, p.y, f.color, f.maturity, f.maturity >= f.edibleAt);
    }
    for (const e of world.query(C_RESOURCE, C_POSITION)) {
      const r = world.getComponent<Resource>(e, C_RESOURCE)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const kind = resourceIcon(r.typeId);
      if (emoji) this.drawEmoji(p.x, p.y, EMOJI[kind]);
      else this.iconResource(p.x, p.y, kind, r.color, r.amount);
    }
    for (const e of world.query(C_BUSINESS, C_POSITION)) {
      const biz = world.getComponent<Business>(e, C_BUSINESS)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (emoji) this.drawEmoji(p.x, p.y, EMOJI[biz.fishery ? 'dock' : 'building']);
      else if (biz.fishery) this.iconDock(p.x, p.y); else this.iconBuilding(p.x, p.y, biz.color);
    }
    for (const e of world.query(C_HOME, C_POSITION)) {     // owned homes — the town's growth (M11)
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (emoji) this.drawEmoji(p.x, p.y, EMOJI.home);
      else this.iconBuilding(p.x, p.y, CATEGORY_COLOR.home);
    }
    for (const e of world.query(C_CIVIC, C_POSITION)) {     // civic buildings — landmarks + functional (M11/M21)
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const civic = world.getComponent<Civic>(e, C_CIVIC)!;
      if (emoji) this.drawEmoji(p.x, p.y, EMOJI[civic.icon ?? 'civic'] ?? EMOJI.civic);
      else this.iconCivicBuilding(p.x, p.y, civic.icon ?? 'civic');
    }
    for (const e of world.query(C_RUIN, C_POSITION)) {       // ruins of the past (M20 s2b)
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const ruin = world.getComponent<Ruin>(e, C_RUIN)!;
      if (emoji) this.drawEmoji(p.x, p.y, EMOJI.ruin);
      else this.iconRuin(p.x, p.y, ruin.discovered);
    }
    for (const e of world.query(C_WONDERSITE, C_POSITION)) {  // great wonders (M20 s3b)
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (emoji) this.drawEmoji(p.x, p.y, EMOJI.wonder);
      else this.iconWonder(p.x, p.y);
    }
    for (const e of world.query(C_FISH, C_POSITION)) {        // aquatic life in the water (M24)
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (emoji) this.drawEmoji(drawX(e, p.x), drawY(e, p.y), EMOJI.fish);
      else this.iconFish(drawX(e, p.x), drawY(e, p.y));
    }
    for (const e of world.query(C_FAUNA, C_POSITION)) {
      const fa = world.getComponent<Fauna>(e, C_FAUNA)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      if (emoji) this.drawEmoji(drawX(e, p.x), drawY(e, p.y), faunaEmoji(fa.speciesId, fa.diet));
      else this.iconAnimal(drawX(e, p.x), drawY(e, p.y), fa.color, fa.size);   // species colour + size
    }
    for (const e of world.query(C_SPECIAL, C_POSITION)) {   // monsters & uncanny visitors (M21)
      const sp = world.getComponent<Special>(e, C_SPECIAL)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const h = world.getComponent<Health>(e, C_HEALTH);
      if (emoji) this.drawEmoji(drawX(e, p.x), drawY(e, p.y), EMOJI[sp.icon] ?? EMOJI.monster);
      else this.iconSpecial(drawX(e, p.x), drawY(e, p.y), sp.icon, !!h && h.value < 0.55);
    }
    // "In company": folk standing beside another folk are conversing. The chat badge
    // (M10 s4.5) shows this regardless of the socialize *action* (which only fires on a
    // low social need, so it was rare) — so the town's adjacency-driven talk reads on the
    // map. A cheap render-only pass over folk tiles; the sim is untouched.
    const W = cfg.gridWidth;
    const folkTiles = new Set<number>();
    for (const e of world.query(C_AGENT, C_POSITION)) {
      const p = world.getComponent<Position>(e, C_POSITION)!;
      folkTiles.add(p.y * W + p.x);
    }
    const inCompany = (p: Position) =>
      NEIGH8.some(([dx, dy]) => folkTiles.has((p.y + dy) * W + (p.x + dx)));

    const orgStore = getOrgStore(world);   // tribe colours tint the folk (M14)
    for (const e of world.query(C_AGENT, C_POSITION)) {
      const agent = world.getComponent<Agent>(e, C_AGENT)!;
      const p = world.getComponent<Position>(e, C_POSITION)!;
      const child = ageInYears(agent.ticksAlive, cfg) < cfg.adultAgeYears;
      const health = world.getComponent<Health>(e, C_HEALTH);
      const cmb = world.getComponent<Combat>(e, C_COMBAT);
      const boat = !!map && isWater(map, p.x, p.y);
      const mage = world.hasComponent(e, C_MAGIC);
      if (emoji) {
        this.drawEmoji(drawX(e, p.x), drawY(e, p.y), boat ? EMOJI.boat : child ? EMOJI.child : mage ? EMOJI.mage : EMOJI.folk, child ? 0.85 : 1);
        continue;
      }
      this.iconFolk(drawX(e, p.x), drawY(e, p.y), child, {
        mage,
        ill: !!health?.ill,
        wounded: !!health && health.value < 0.55,   // visibly hurt (combat or illness)
        action: agent.action,
        chatting: inCompany(p),
        bodyColor: agent.orgId && orgStore ? orgStore.byId[agent.orgId]?.color : undefined,
        quest: world.hasComponent(e, C_QUEST),                       // ⚑ on a quest (M20 s3)
        veteran: !!cmb && (cmb.kills > 0 || cmb.scars > 0),          // ⚔ a fighter (M16)
        outlaw: world.hasComponent(e, C_CRIME),                      // ⚖ an outlaw (M16)
        mentalState: agent.mentalState,                              // a mental break mark (M28 s2)
        boat,                                                        // ⛵ afloat — a folk on the water rides a boat (M24)
      });
    }

    this.drawCombatFx(world, elapsedMs);   // fading clash/death marks (still in world space)

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawDayNight(world, clockEntity);   // soft time-of-day wash over the map (D13 aesthetic)
    this.drawHud(world, clockEntity, elapsedMs);
  }

  // A gentle day→night colour wash (D13). Drawn over the world but under the HUD, so the map
  // breathes through dawn/day/dusk/night while the banner stays legible. Damped toward nothing at
  // fast-forward (many ticks/frame) so the cycle doesn't strobe when you skip through time.
  private drawDayNight(world: World, clockEntity: EntityId): void {
    const clock = world.getComponent<Clock>(clockEntity, C_CLOCK);
    if (!clock) return;
    const dt = this.lastTintTick < 0 ? 0 : Math.abs(clock.tick - this.lastTintTick);
    this.lastTintTick = clock.tick;
    const damp = Math.max(0, Math.min(1, 1 - (dt - 4) / 12));   // full ≤4 ticks/frame → 0 by ~16
    if (damp <= 0) return;
    const f = (clock.tick % this.cfg.ticksPerDay) / this.cfg.ticksPerDay;
    const [r, g, b, a] = dayNightTint(f);
    const alpha = a * damp;
    if (alpha < 0.004) return;
    this.ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // Emoji-skin glyph (M34): draw a system emoji filling the tile, at the (possibly interpolated)
  // tile coords. Uses the OS emoji font — no assets. `scale` < 1 shrinks it (e.g. a child).
  private drawEmoji(gx: number, gy: number, char: string, scale = 1): void {
    const { ctx, cellSize } = this;
    ctx.font = `${(cellSize * 0.82 * scale).toFixed(1)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, gx * cellSize + cellSize / 2, gy * cellSize + cellSize / 2);
  }

  // ── icon primitives (drawn in a ±11 design space, scaled to the cell) ─────────
  private at(gx: number, gy: number, fs: number, draw: () => void): void {
    const { ctx, cellSize } = this;
    ctx.save();
    ctx.translate(gx * cellSize + cellSize / 2, gy * cellSize + cellSize / 2);
    ctx.scale((cellSize / 22) * fs, (cellSize / 22) * fs);
    draw();
    ctx.restore();
  }

  private iconFolk(gx: number, gy: number, child: boolean, st: { mage: boolean; ill: boolean; wounded: boolean; action: string; chatting: boolean; bodyColor?: string; quest?: boolean; veteran?: boolean; outlaw?: boolean; mentalState?: string; boat?: boolean }): void {
    const ctx = this.ctx;
    // A folk on the water rides a boat (M24): a wooden hull beneath them, with a little wake.
    if (st.boat) {
      this.at(gx, gy, 1, () => {
        ctx.strokeStyle = '#5a93a8'; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-10, 10); ctx.quadraticCurveTo(-7.5, 8.5, -5, 10); ctx.moveTo(5, 10); ctx.quadraticCurveTo(7.5, 8.5, 10, 10); ctx.stroke();   // wake
        ctx.fillStyle = '#8a5a36';   // the hull
        ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(8, 5); ctx.lineTo(5.5, 11); ctx.lineTo(-5.5, 11); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6b4426'; ctx.fillRect(-8, 4.2, 16, 1.4);   // gunwale
      });
    }
    this.at(gx, gy, child ? 0.72 : 1, () => {
      ctx.fillStyle = st.bodyColor ?? CATEGORY_COLOR.folk;   // tinted by tribe (M14)
      ctx.beginPath(); ctx.arc(0, -6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-6, 9); ctx.quadraticCurveTo(-6, -1, 0, -1); ctx.quadraticCurveTo(6, -1, 6, 9); ctx.closePath();
      ctx.fill();
      const ac = BADGE[st.action as keyof typeof BADGE];
      if (ac) this.badge(st.action, ac, 6, 8);
      // Chat badge: two small "speech" dots at the upper-left when standing beside another
      // folk — visible conversation, decoupled from the rare socialize action (M10 s4.5).
      if (st.chatting) {
        ctx.fillStyle = BADGE.socialize;
        ctx.beginPath(); ctx.arc(-7, -7, 1.3, 0, Math.PI * 2); ctx.arc(-3.4, -7, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      if (st.ill) { ctx.strokeStyle = BADGE.ill; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(-7, -3); ctx.moveTo(-9, -5); ctx.lineTo(-5, -5); ctx.stroke(); }
      if (st.wounded) { ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(4, 11); ctx.stroke(); }  // a red "hurt" bar at the feet
      if (st.mage) { ctx.fillStyle = BADGE.mage; this.spark(7, -9); }
      // ⚑ on a quest: a small gold pennant above the head (M20 s3).
      if (st.quest) {
        ctx.strokeStyle = '#ffd278'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, -10.5); ctx.lineTo(0, -15.5); ctx.stroke();
        ctx.fillStyle = '#ffd278'; ctx.beginPath(); ctx.moveTo(0, -15.5); ctx.lineTo(5, -13.7); ctx.lineTo(0, -12.2); ctx.closePath(); ctx.fill();
      }
      // ⚔ a veteran fighter: tiny crossed swords at the lower right (M16).
      if (st.veteran) {
        ctx.strokeStyle = '#d6dae4'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(5, 2); ctx.lineTo(9.5, 6.5); ctx.moveTo(9.5, 2); ctx.lineTo(5, 6.5); ctx.stroke();
      }
      // ⚖ an outlaw: a small red mark at the lower left (M16).
      if (st.outlaw) { ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.arc(-7.5, 4, 1.7, 0, Math.PI * 2); ctx.fill(); }
      // A mental break (M28 s2): a mark above the head — despair (blue drizzle), rage (red flash), joy (gold sparkle).
      if (st.mentalState === 'despair') {
        ctx.strokeStyle = '#7fa8d0'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-2, -13); ctx.lineTo(-2, -10.5); ctx.moveTo(2, -13); ctx.lineTo(2, -10.5); ctx.stroke();
      } else if (st.mentalState === 'anger') {
        ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-2, -11); ctx.lineTo(0.5, -14); ctx.lineTo(-0.8, -12); ctx.lineTo(1.5, -15); ctx.stroke();
      } else if (st.mentalState === 'elation') {
        ctx.strokeStyle = '#ffd278'; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -15.2); ctx.lineTo(0, -11.2); ctx.moveTo(-2, -13.2); ctx.lineTo(2, -13.2);
        ctx.moveTo(-1.4, -14.6); ctx.lineTo(1.4, -11.8); ctx.moveTo(1.4, -14.6); ctx.lineTo(-1.4, -11.8); ctx.stroke();
      }
    });
  }

  // Combat FX: brief fading marks at the sites of recent fights & deaths. Ingested render-
  // only from the EventLog's positioned combat events — the simulation is never touched.
  private drawCombatFx(world: World, elapsedMs: number): void {
    const FX_LIFE = 750;
    const logEnts = world.query(C_EVENTLOG);
    const clockEnts = world.query(C_CLOCK);
    if (logEnts.length && clockEnts.length) {
      const tick = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick;
      if (tick < this.lastFxTick) { this.flashes = []; this.lastFxTick = tick; }   // sim reset / replay
      if (tick > this.lastFxTick) {
        const log = world.getComponent<EventLogData>(logEnts[0], C_EVENTLOG)!;
        for (const ev of log.entries) {
          if (ev.tick > this.lastFxTick && ev.x !== undefined && ev.y !== undefined) {
            this.flashes.push({ x: ev.x, y: ev.y, kind: ev.kind, age: 0 });
          }
        }
        if (this.flashes.length > 64) this.flashes.splice(0, this.flashes.length - 64);
        this.lastFxTick = tick;
      }
    }
    const ctx = this.ctx;
    for (const f of this.flashes) f.age += elapsedMs;
    this.flashes = this.flashes.filter(f => f.age < FX_LIFE);
    for (const f of this.flashes) {
      const t = f.age / FX_LIFE;
      const death = f.kind === 'death';
      const color = death ? '#ff4040' : f.kind === 'crime' ? '#ff7a3a' : '#ffd24a';
      const spokes = death ? 8 : 6;
      this.at(f.x, f.y, 1 + t * (death ? 1.6 : 0.9), () => {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = color; ctx.lineWidth = death ? 2 : 1.6; ctx.lineCap = 'round';
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
          ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
          ctx.stroke();
        }
        if (death) { ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke(); }
      });
    }
  }

  // Small action badges, drawn in design space at (bx,by).
  private badge(action: string, color: string, bx: number, by: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    if (action === 'work') { ctx.beginPath(); ctx.moveTo(bx - 3, by - 2); ctx.lineTo(bx + 3, by - 2); ctx.moveTo(bx, by - 2); ctx.lineTo(bx, by + 3); ctx.stroke(); }
    else if (action === 'sleep') { ctx.beginPath(); ctx.arc(bx, by, 3, 0.5, Math.PI * 1.5, false); ctx.arc(bx + 1.4, by, 2.2, Math.PI * 1.5, 0.5, true); ctx.fill(); }
    else if (action === 'seek_food') { ctx.beginPath(); ctx.moveTo(bx - 2, by - 3); ctx.lineTo(bx - 2, by + 3); ctx.moveTo(bx, by - 3); ctx.lineTo(bx, by + 3); ctx.moveTo(bx + 2, by - 3); ctx.lineTo(bx + 2, by + 3); ctx.stroke(); }
    else if (action === 'socialize') { ctx.beginPath(); ctx.arc(bx - 1.6, by, 1.4, 0, Math.PI * 2); ctx.arc(bx + 1.6, by, 1.4, 0, Math.PI * 2); ctx.fill(); }
    else if (action === 'relax') { ctx.beginPath(); ctx.arc(bx, by - 1, 3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }   // a content little smile (M28 leisure)
  }

  private spark(x: number, y: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y - 3.2); ctx.lineTo(x + 1.6, y); ctx.lineTo(x, y + 3.2); ctx.lineTo(x - 1.6, y); ctx.closePath();
    ctx.moveTo(x - 3.2, y); ctx.lineTo(x, y - 1.6); ctx.lineTo(x + 3.2, y); ctx.lineTo(x, y + 1.6); ctx.closePath();
    ctx.fill();
  }

  // A small fish (M24): body, tail fin, dorsal fin, eye. Drawn a touch smaller than fauna.
  private iconFish(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 0.72, () => {
      ctx.fillStyle = CATEGORY_COLOR.fish;
      ctx.beginPath(); ctx.ellipse(0.5, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill();   // body
      ctx.beginPath(); ctx.moveTo(-5.5, 0); ctx.lineTo(-9, -3); ctx.lineTo(-9, 3); ctx.closePath(); ctx.fill();   // tail
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(2, -5); ctx.lineTo(3.5, -3); ctx.closePath(); ctx.fill();    // dorsal fin
      ctx.fillStyle = '#0c1a22'; ctx.beginPath(); ctx.arc(4, -0.6, 0.9, 0, Math.PI * 2); ctx.fill();              // eye
    });
  }

  private iconAnimal(gx: number, gy: number, color: string, size: 'small' | 'medium' | 'large' = 'medium'): void {
    const ctx = this.ctx;
    const scale = size === 'large' ? 1.3 : size === 'small' ? 0.82 : 1;
    this.at(gx, gy, scale, () => {
      ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(-1, 0, 7.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();   // body
      ctx.beginPath(); ctx.arc(6.5, -2, 3.2, 0, Math.PI * 2); ctx.fill();             // head
      ctx.beginPath();                                                                // pointed ears
      ctx.moveTo(4.7, -4.5); ctx.lineTo(4.2, -7.2); ctx.lineTo(6.1, -5.3); ctx.closePath();
      ctx.moveTo(8.3, -4.5); ctx.lineTo(9.3, -7.0); ctx.lineTo(7.0, -5.3); ctx.closePath();
      ctx.fill();
      ctx.beginPath();                                                                // four legs + tail
      ctx.moveTo(-6, 3.5); ctx.lineTo(-6, 8); ctx.moveTo(-2, 4); ctx.lineTo(-2, 8.2);
      ctx.moveTo(2, 4); ctx.lineTo(2, 8.2); ctx.moveTo(5, 3.5); ctx.lineTo(5, 7.8);
      ctx.moveTo(-8, -0.5); ctx.quadraticCurveTo(-11.5, -1.5, -10.8, -5.5); ctx.stroke();
      ctx.fillStyle = '#0c0c14'; ctx.beginPath(); ctx.arc(7.4, -2.4, 0.9, 0, Math.PI * 2); ctx.fill(); // eye
    });
  }

  private iconPlant(gx: number, gy: number, color: string, maturity: number, ripe: boolean): void {
    const ctx = this.ctx;
    this.at(gx, gy, 0.7 + maturity * 0.5, () => {
      ctx.globalAlpha = 0.55 + maturity * 0.45;
      ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(0, -3); ctx.stroke();
      ctx.fillStyle = color;
      this.leaf(-4, 0, -0.5); this.leaf(4, -3, 0.5);
      if (ripe) { ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(0, -4, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
  }

  private leaf(x: number, y: number, rot: number): void {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private iconResource(gx: number, gy: number, kind: 'ore' | 'timber' | 'crystal', color: string, amount: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.globalAlpha = 0.5 + amount * 0.5;
      ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.8;
      if (kind === 'timber') {
        // A stack of cut log-ends, each with a growth ring (a small woodpile).
        ctx.lineWidth = 0.9;
        for (const [lx, ly] of [[-4, 2.5], [4, 2.5], [0, -3.5]] as const) {
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(lx, ly, 3.6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(lx, ly, 3.6, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.arc(lx, ly, 1.5, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (kind === 'crystal') {
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, -1); ctx.lineTo(2, 8); ctx.lineTo(-2, 8); ctx.lineTo(-5, -1); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-5, -1); ctx.lineTo(5, -1); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-7, 4); ctx.lineTo(-4, -5); ctx.lineTo(4, -6); ctx.lineTo(8, 1); ctx.lineTo(4, 7); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(0, 2); ctx.lineTo(8, 1); ctx.moveTo(0, 2); ctx.lineTo(-5, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  }

  private iconBuilding(gx: number, gy: number, color: string): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(0, -9); ctx.lineTo(9, -1); ctx.closePath(); ctx.fill();
      ctx.fillRect(-7, -1, 14, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-2, 3, 4, 6);
    });
  }

  // A fishery (M24): a wooden pier on pilings over a wavy waterline, with a mooring post.
  private iconDock(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.strokeStyle = '#5a93a8'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-10, 7);
      for (let x = -10; x < 10; x += 5) ctx.quadraticCurveTo(x + 2.5, 5, x + 5, 7);   // waterline
      ctx.stroke();
      ctx.fillStyle = '#9a6c43'; ctx.fillRect(-8, -2, 16, 2.6);   // deck
      ctx.fillStyle = '#7a5436';
      ctx.fillRect(-6, 0.6, 1.6, 6); ctx.fillRect(4.4, 0.6, 1.6, 6);   // pilings
      ctx.fillRect(-1, -7, 2, 5);   // mooring post
    });
  }

  // A civic landmark: the house silhouette with a small banner on the roof.
  private iconCivic(gx: number, gy: number, color: string): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(0, -9); ctx.lineTo(9, -1); ctx.closePath(); ctx.fill();
      ctx.fillRect(-7, -1, 14, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-2, 3, 4, 6);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -13); ctx.lineTo(4, -12); ctx.lineTo(0, -11); ctx.closePath(); ctx.fill();
    });
  }

  // A civic building (M21): a plain landmark, or one of the functional kinds (infirmary /
  // tavern / watch-house), each with its own glyph.
  private iconCivicBuilding(gx: number, gy: number, icon: string): void {
    switch (icon) {
      case 'infirmary': this.iconInfirmary(gx, gy); break;
      case 'tavern':    this.iconTavern(gx, gy); break;
      case 'watch':     this.iconWatch(gx, gy); break;
      case 'market':    this.iconMarket(gx, gy); break;
      case 'workshop':  this.iconWorkshop(gx, gy); break;
      default:          this.iconCivic(gx, gy, CATEGORY_COLOR.civic); break;
    }
  }

  // An infirmary: the civic house silhouette marked with a red cross.
  private iconInfirmary(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = '#d4dbe0';
      ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(0, -9); ctx.lineTo(9, -1); ctx.closePath(); ctx.fill();
      ctx.fillRect(-7, -1, 14, 10);
      ctx.fillStyle = '#d23b3b';
      ctx.fillRect(-1.3, 0.5, 2.6, 8);   // the cross — vertical bar
      ctx.fillRect(-4, 3.2, 8, 2.6);     // …and horizontal bar
    });
  }

  // A tavern: the civic house with a foaming ale-mug on the front.
  private iconTavern(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = '#c89a5a';
      ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(0, -9); ctx.lineTo(9, -1); ctx.closePath(); ctx.fill();
      ctx.fillRect(-7, -1, 14, 10);
      ctx.fillStyle = '#ecdcb8';
      ctx.fillRect(-3.2, 1.8, 5, 6.2);   // mug body
      ctx.strokeStyle = '#ecdcb8'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(1.8, 2.6); ctx.quadraticCurveTo(4.6, 3, 1.8, 6.6); ctx.stroke();   // handle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-0.7, 1.8, 3, 1.3, 0, 0, Math.PI * 2); ctx.fill();   // foam
    });
  }

  // A watch-house: a crenellated tower bearing a shield.
  private iconWatch(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = '#8696b3';
      ctx.fillRect(-5, -6, 10, 15);                         // the tower
      ctx.fillRect(-5, -8.5, 2.6, 2.6); ctx.fillRect(-1.3, -8.5, 2.6, 2.6); ctx.fillRect(2.4, -8.5, 2.6, 2.6);  // crenellations
      ctx.fillStyle = '#cdd6e2';
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(3, -2); ctx.lineTo(3, 1.5); ctx.quadraticCurveTo(3, 4, 0, 5); ctx.quadraticCurveTo(-3, 4, -3, 1.5); ctx.lineTo(-3, -2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5b6b86'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 3); ctx.moveTo(-2, 0.5); ctx.lineTo(2, 0.5); ctx.stroke();   // shield mark
    });
  }

  // A market: a striped awning over a wooden counter with a little produce.
  private iconMarket(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = '#9a6c43';
      ctx.fillRect(-7, 0, 1.4, 8); ctx.fillRect(5.6, 0, 1.4, 8);   // stall posts
      ctx.fillStyle = '#c0613f';
      ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(9, -3); ctx.lineTo(7, 1); ctx.lineTo(-7, 1); ctx.closePath(); ctx.fill();   // awning
      ctx.strokeStyle = '#ecd6b0'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-2.5, 1); ctx.moveTo(0, -3); ctx.lineTo(0, 1); ctx.moveTo(4, -3); ctx.lineTo(2.5, 1); ctx.stroke();   // stripes
      ctx.fillStyle = '#a9794e'; ctx.fillRect(-8, 4, 16, 2.6);   // counter
      ctx.fillStyle = '#cf8a4a'; ctx.beginPath(); ctx.arc(-3.5, 2.6, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8fae6a'; ctx.beginPath(); ctx.arc(0.5, 2.6, 1.1, 0, Math.PI * 2); ctx.fill();   // produce
    });
  }

  // A workshop: a blacksmith's anvil with a hammer-head resting on it.
  private iconWorkshop(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = '#8a8f99';
      ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(6, -3); ctx.lineTo(9, -1.4); ctx.lineTo(6, 0); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();   // face + horn
      ctx.fillRect(-2, 0, 4, 4);     // stem
      ctx.fillRect(-6, 4, 12, 3);    // base
      ctx.fillStyle = '#5d6470';
      ctx.fillRect(-5.5, -5.5, 3.5, 2.4); ctx.fillRect(-4.2, -3.2, 1, 0.9);   // hammer head + neck
    });
  }

  // A ruin: broken stubs of fallen columns. Brighter once discovered, faint while still buried.
  private iconRuin(gx: number, gy: number, discovered: boolean): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = discovered ? CATEGORY_COLOR.ruin : 'rgba(140,130,112,0.45)';
      ctx.fillRect(-7, -1, 3, 7);    // a stub
      ctx.fillRect(-1, -5, 3, 11);   // a taller broken column
      ctx.fillRect(5, 0, 3, 6);      // a low remnant
      ctx.fillRect(-8, 6, 16, 2);    // the fallen base
    });
  }

  // A wonder: a tall, gleaming spire with a beacon — the town's crowning work.
  private iconWonder(gx: number, gy: number): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1, () => {
      ctx.fillStyle = CATEGORY_COLOR.wonder;
      ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(0, -13); ctx.lineTo(5, 8); ctx.closePath(); ctx.fill();   // the spire
      ctx.fillStyle = '#fff7d8';
      ctx.beginPath(); ctx.arc(0, -13, 2, 0, Math.PI * 2); ctx.fill();   // the beacon
    });
  }

  // ── special agents (M21): monsters & uncanny visitors, drawn a touch larger than folk ──
  private iconSpecial(gx: number, gy: number, kind: string, wounded: boolean): void {
    const ctx = this.ctx;
    this.at(gx, gy, 1.28, () => {
      switch (kind) {
        case 'dragon':  this.drawDragon(); break;
        case 'vampire': this.drawVampire(); break;
        case 'undead':  this.drawUndead(); break;
        case 'ghost':   this.drawGhost(); break;
        case 'alien':   this.drawAlien(); break;
        case 'kraken':  this.drawKraken(); break;
        case 'guardian': this.drawGuardian(); break;   // a friendly summon (M26 s2b)
        default:        this.drawMonster(); break;   // 'monster' — a dire beast
      }
      if (wounded) { ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-4, 11.5); ctx.lineTo(4, 11.5); ctx.stroke(); }
    });
  }

  // A conjured guardian spirit (M26 s2b): a radiant wisp with a soft aura, bright core and halo —
  // benevolent, distinct from the hollow-eyed ghost.
  private drawGuardian(): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#9fe0ff';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.95; ctx.fillStyle = '#cfeeff';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(6, -2, 4.5, 4); ctx.quadraticCurveTo(2.5, 8, 0, 8.5); ctx.quadraticCurveTo(-2.5, 8, -4.5, 4); ctx.quadraticCurveTo(-6, -2, 0, -9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff4cf';
    ctx.beginPath(); ctx.ellipse(0, 0, 2.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(0, -7.5, 3.2, 1.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // A heraldic wyvern: spread membranous wings, a horned head, glowing eyes, a curling tail.
  private drawDragon(): void {
    const ctx = this.ctx, body = '#c87a52';
    ctx.fillStyle = '#8f4f33';
    ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(-11, -7); ctx.lineTo(-8, -2); ctx.lineTo(-11, 2); ctx.lineTo(-8, 3); ctx.lineTo(-1, 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -2); ctx.lineTo(11, -7); ctx.lineTo(8, -2); ctx.lineTo(11, 2); ctx.lineTo(8, 3); ctx.lineTo(1, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(3, -1, 1.6, 7); ctx.lineTo(-1.6, 7); ctx.quadraticCurveTo(-3, -1, 0, -7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = body; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1.4, 7); ctx.quadraticCurveTo(-3, 10, -0.5, 11.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -8, 2.7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e7c39c'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2.4, -9.5); ctx.lineTo(-3.6, -12); ctx.moveTo(2.4, -9.5); ctx.lineTo(3.6, -12); ctx.stroke();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(-1, -8, 0.8, 0, Math.PI * 2); ctx.arc(1, -8, 0.8, 0, Math.PI * 2); ctx.fill();
  }

  // A classic count: a high-collared cape, a pale face, a widow's-peak, red eyes, white fangs.
  private drawVampire(): void {
    const ctx = this.ctx, cape = '#3a1830', face = '#ede2d0', hair = '#131019';
    ctx.fillStyle = cape;
    ctx.beginPath(); ctx.moveTo(-9, 9); ctx.lineTo(-6, -1); ctx.quadraticCurveTo(0, -4, 6, -1); ctx.lineTo(9, 9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(-2.5, 3); ctx.lineTo(-1, -2); ctx.closePath();
    ctx.moveTo(6, -1); ctx.lineTo(2.5, 3); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = face; ctx.beginPath(); ctx.arc(0, -4, 3.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.moveTo(-3.9, -4.6); ctx.quadraticCurveTo(-4.4, -8.4, 0, -8.4); ctx.quadraticCurveTo(4.4, -8.4, 3.9, -4.6);
    ctx.quadraticCurveTo(2, -6.3, 0, -4); ctx.quadraticCurveTo(-2, -6.3, -3.9, -4.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d12a2a';
    ctx.beginPath(); ctx.arc(-1.6, -4, 0.85, 0, Math.PI * 2); ctx.arc(1.6, -4, 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-1.3, -1); ctx.lineTo(-0.5, 0.7); ctx.lineTo(0.1, -1); ctx.closePath();
    ctx.moveTo(0.3, -1); ctx.lineTo(1.1, 0.7); ctx.lineTo(1.7, -1); ctx.closePath(); ctx.fill();
  }

  // A bare skull: black eye-sockets, a nasal void, a row of teeth.
  private drawUndead(): void {
    const ctx = this.ctx, bone = '#d6d8e0';
    ctx.fillStyle = bone;
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-6, -9, 0, -9); ctx.quadraticCurveTo(6, -9, 6, -2);
    ctx.quadraticCurveTo(6, 2, 4, 3.2); ctx.lineTo(4, 6); ctx.lineTo(-4, 6); ctx.lineTo(-4, 3.2); ctx.quadraticCurveTo(-6, 2, -6, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#101018';
    ctx.beginPath(); ctx.arc(-2.7, -3, 1.9, 0, Math.PI * 2); ctx.arc(2.7, -3, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.lineTo(-1.1, 1.4); ctx.lineTo(1.1, 1.4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#101018'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(3, 4); ctx.moveTo(-1.6, 4); ctx.lineTo(-1.6, 6.4); ctx.moveTo(0, 4); ctx.lineTo(0, 6.4); ctx.moveTo(1.6, 4); ctx.lineTo(1.6, 6.4); ctx.stroke();
  }

  // A snarling horned beast: jagged horns, glowing eyes, a fanged maw.
  private drawMonster(): void {
    const ctx = this.ctx, hide = '#d06b6b';
    ctx.fillStyle = '#a84a4a';
    ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(-8.5, -11); ctx.lineTo(-2.5, -5.5); ctx.closePath();
    ctx.moveTo(5, -4); ctx.lineTo(8.5, -11); ctx.lineTo(2.5, -5.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hide;
    ctx.beginPath(); ctx.moveTo(-7, -1); ctx.quadraticCurveTo(-7, -7, 0, -7); ctx.quadraticCurveTo(7, -7, 7, -1); ctx.quadraticCurveTo(7, 6, 0, 8); ctx.quadraticCurveTo(-7, 6, -7, -1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath(); ctx.moveTo(-4.2, -1.8); ctx.lineTo(-1.4, -0.6); ctx.lineTo(-4, 0.6); ctx.closePath();
    ctx.moveTo(4.2, -1.8); ctx.lineTo(1.4, -0.6); ctx.lineTo(4, 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-3.4, 3); ctx.lineTo(-2.4, 5.6); ctx.lineTo(-1.4, 3); ctx.lineTo(-0.4, 5.6); ctx.lineTo(0.6, 3); ctx.lineTo(1.6, 5.6); ctx.lineTo(2.6, 3); ctx.closePath(); ctx.fill();
  }

  // A hovering wraith: a rounded cowl, a wavy hem, dark hollows. Faintly translucent.
  private drawGhost(): void {
    const ctx = this.ctx, pale = '#aec4ea';
    ctx.globalAlpha = 0.9; ctx.fillStyle = pale;
    ctx.beginPath(); ctx.moveTo(-6, 7); ctx.lineTo(-6, -2); ctx.quadraticCurveTo(-6, -9, 0, -9); ctx.quadraticCurveTo(6, -9, 6, -2); ctx.lineTo(6, 7);
    ctx.lineTo(4, 5.2); ctx.lineTo(2, 7); ctx.lineTo(0, 5.2); ctx.lineTo(-2, 7); ctx.lineTo(-4, 5.2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.fillStyle = '#2a3550';
    ctx.beginPath(); ctx.ellipse(-2.3, -3, 1.3, 1.8, 0, 0, Math.PI * 2); ctx.ellipse(2.3, -3, 1.3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 1, 1.1, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  }

  // A grey in green: a bulbous head, big slanted black eyes, a slender body.
  private drawAlien(): void {
    const ctx = this.ctx, skin = '#5cc95c';
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.moveTo(-2, 11); ctx.lineTo(-1.4, 1); ctx.lineTo(1.4, 1); ctx.lineTo(2, 11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = skin; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, 9); ctx.lineTo(-1.6, 5); ctx.moveTo(4, 9); ctx.lineTo(1.6, 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(7, -8.5, 5.2, -1.5); ctx.quadraticCurveTo(3.2, 2.5, 0, 2.5); ctx.quadraticCurveTo(-3.2, 2.5, -5.2, -1.5); ctx.quadraticCurveTo(-7, -8.5, 0, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a0a10';
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 2.5, -3.4); ctx.rotate(s * 0.49);
      ctx.beginPath(); ctx.ellipse(0, 0, 1.5, 2.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // A kraken (M24): a bulbous mantle with dark eyes and five splaying tentacles.
  private drawKraken(): void {
    const ctx = this.ctx, skin = '#577a87';
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(0, -3, 6, 5, 0, 0, Math.PI * 2); ctx.fill();   // mantle
    ctx.strokeStyle = skin; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-5, 1); ctx.quadraticCurveTo(-7, 5, -5, 9);
    ctx.moveTo(-2.5, 2); ctx.quadraticCurveTo(-3.2, 6, -1, 10);
    ctx.moveTo(0, 2.5); ctx.quadraticCurveTo(0, 7, 0, 10.5);
    ctx.moveTo(2.5, 2); ctx.quadraticCurveTo(3.2, 6, 1, 10);
    ctx.moveTo(5, 1); ctx.quadraticCurveTo(7, 5, 5, 9);
    ctx.stroke();                                                                // tentacles
    ctx.fillStyle = '#0c1418';
    ctx.beginPath(); ctx.arc(-2.2, -3.4, 1, 0, Math.PI * 2); ctx.arc(2.2, -3.4, 1, 0, Math.PI * 2); ctx.fill();
  }

  private drawHud(world: World, clockEntity: EntityId, elapsedMs: number): void {
    const { ctx } = this;
    const clock = world.getComponent<Clock>(clockEntity, C_CLOCK)!;
    const { year, season, month } = calendarOf(clock.tick, this.cfg);
    const pop = world.query(C_AGENT).length;

    // Top banner: just the in-sim date, the day/night phase, the headcount, and the
    // real-world time you've been watching. Everything else lives in the views.
    const label = `${clock.isDay ? '☀' : '☾'} Year ${year} · ${season} · M${month}` +
      `   ·   Folk ${pop}   ·   ⏱ ${formatElapsed(elapsedMs)}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.canvas.width, 28);
    ctx.fillStyle = '#ccd';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, 8, 17);

    // Zoom, labelled, tucked into the bottom-right corner (off the top banner).
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const zoom = `Zoom ${Math.round(this.scale * 100)}%`;
    ctx.font = '10px monospace';
    const zw = ctx.measureText(zoom).width + 12;
    ctx.fillRect(this.canvas.width - zw - 6, this.canvas.height - 22, zw, 16);
    ctx.fillStyle = '#9aa';
    ctx.fillText(zoom, this.canvas.width - zw, this.canvas.height - 10);
  }

  // Picks the most interesting entity on the clicked tile: folk > fauna > business > home > resource > flora.
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

    const hit = at(C_SPECIAL) ?? at(C_AGENT) ?? at(C_FAUNA) ?? at(C_WONDERSITE) ?? at(C_BUSINESS) ?? at(C_HOME) ?? at(C_CIVIC) ?? at(C_RUIN) ?? at(C_RESOURCE) ?? at(C_FISH) ?? at(C_FLORA);
    if (hit !== null) this.onEntityClick?.(hit);
    else this.onTileClick?.(gx, gy);   // empty tile → inspect the terrain itself (M24: water is inspectable)
    return hit;
  }
}
