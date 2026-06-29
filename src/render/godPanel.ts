// The God-Mode control panel (M27 slice 3). When god mode is on, this top-right overlay lets the
// player wield the content-driven powers (content/powers/*.yaml): pick a power → for a targeted
// power, click a soul; for a town-wide power, it fires at once. A "divine acts" log records what
// you've done, and two limits keep it a *nudge, not a cheat* (the DoD): a regenerating **divine
// favour** budget each act spends, and a per-power **cooldown**.
//
// All of this is **render-layer state** — favour, cooldowns and the log never touch the simulation.
// The only thing that reaches the sim is the recorded `Intervention` the `onCast` callback enqueues
// (deterministic, replay-exact, M27 s1). So determinism + sim/render separation hold.
import type { World, EntityId } from '../sim/ecs.ts';
import { C_AGENT, C_CLOCK } from '../sim/components.ts';
import type { Agent, Clock } from '../sim/components.ts';
import type { Power } from '../content/schema.ts';
import { makePanel } from './panelUtil.ts';

const MAX_FAVOUR = 200;
const FAVOUR_PER_DAY = 10;     // slow regen → expensive powers (smite) can't be spammed
const LOG_LIMIT = 10;

// A little glyph per effect for the acts log / buttons (pure flavour).
const GLYPH: Record<string, string> = { smite: '⚡', bless: '✦', curse: '☠', bestow: '💰', summon: '✷' };
const glyphOf = (p: Power): string => GLYPH[p.effect] ?? '✷';

interface ButtonRef { power: Power; el: HTMLDivElement; stateEl: HTMLSpanElement; }

export class GodPanel {
  private readonly panel: HTMLDivElement;
  private readonly favourEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;
  private readonly logEl: HTMLDivElement;
  private readonly buttons: ButtonRef[] = [];

  private readonly ticksPerDay: number;
  private readonly onCast: (power: Power, target: EntityId | null) => void;

  private favour = MAX_FAVOUR;
  private cooldownUntil: Record<string, number> = {};   // power id → tick it's usable again
  private log: string[] = [];
  private armedId: string | null = null;
  private lastTick = -1;     // for favour regen between frames (-1 = uninitialised)
  private tick = 0;
  private active = false;

  constructor(powers: Power[], ticksPerDay: number, onCast: (power: Power, target: EntityId | null) => void) {
    this.ticksPerDay = ticksPerDay;
    this.onCast = onCast;

    const { panel, body } = makePanel({
      title: '✦ God Mode',
      titleColor: '#ffd278',
      style: { position: 'fixed', right: '12px', top: '40px', width: '210px' },
    });
    this.panel = panel;
    this.panel.style.display = 'none';

    this.favourEl = document.createElement('div');
    Object.assign(this.favourEl.style, { margin: '0 0 6px', color: '#ffd278', fontSize: '11px' } as Partial<CSSStyleDeclaration>);

    this.hintEl = document.createElement('div');
    Object.assign(this.hintEl.style, { margin: '0 0 6px', minHeight: '14px', color: '#7fd6c0', fontSize: '10px' } as Partial<CSSStyleDeclaration>);

    // Powers, agent-targeted first (sorted by cost), then town-wide — a tidy reading order.
    const ordered = [...powers].sort((a, b) =>
      (a.target === b.target ? a.cost - b.cost : a.target === 'agent' ? -1 : 1));
    const btnWrap = document.createElement('div');
    for (const power of ordered) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px',
        padding: '4px 7px', margin: '3px 0', borderRadius: '6px', cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
      } as Partial<CSSStyleDeclaration>);
      el.title = power.blurb;
      const nameEl = document.createElement('span');
      nameEl.innerHTML = `${glyphOf(power)} <b style="color:#dde">${power.name}</b>`;
      const stateEl = document.createElement('span');
      Object.assign(stateEl.style, { color: '#99a', fontSize: '10px', flex: '0 0 auto' } as Partial<CSSStyleDeclaration>);
      el.append(nameEl, stateEl);
      el.addEventListener('click', () => this.onButtonClick(power));
      btnWrap.appendChild(el);
      this.buttons.push({ power, el, stateEl });
    }

    const logTitle = document.createElement('div');
    Object.assign(logTitle.style, {
      margin: '9px 0 3px', color: '#9ab', textTransform: 'uppercase', fontSize: '10px',
      letterSpacing: '1px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '7px',
    } as Partial<CSSStyleDeclaration>);
    logTitle.textContent = 'Divine acts';
    this.logEl = document.createElement('div');
    Object.assign(this.logEl.style, { color: '#aab', fontSize: '10px', maxHeight: '120px', overflowY: 'auto' } as Partial<CSSStyleDeclaration>);

    const foot = document.createElement('div');
    Object.assign(foot.style, { marginTop: '8px', color: '#667', fontSize: '10px' } as Partial<CSSStyleDeclaration>);
    foot.textContent = 'Pick a power · Esc cancels';

    body.append(this.favourEl, this.hintEl, btnWrap, logTitle, this.logEl, foot);
    document.body.appendChild(this.panel);
    this.renderLog();
  }

  // ── visibility ────────────────────────────────────────────────────────────────
  setActive(on: boolean): void {
    this.active = on;
    this.panel.style.display = on ? 'block' : 'none';
    if (!on) this.armedId = null;
  }
  get isActive(): boolean { return this.active; }
  get armed(): Power | null {
    return this.armedId ? this.buttons.find(b => b.power.id === this.armedId)?.power ?? null : null;
  }

  // Reset all UI state for a fresh world (new sim / load). Favour, cooldowns and the log are not
  // saved — a new world starts the god at full favour.
  reset(): void {
    this.favour = MAX_FAVOUR;
    this.cooldownUntil = {};
    this.log = [];
    this.armedId = null;
    this.lastTick = -1;
    this.renderLog();
  }

  // ── per-frame refresh: regen favour from the clock, update button states ────────
  update(world: World): void {
    if (!this.active) return;
    const ce = world.query(C_CLOCK);
    this.tick = ce.length ? world.getComponent<Clock>(ce[0], C_CLOCK)!.tick : 0;
    // Regen favour by elapsed sim-days since the last frame (handles fast-forward & pause).
    if (this.lastTick < 0 || this.tick < this.lastTick) this.lastTick = this.tick;   // (re)initialise / world reset
    const days = (this.tick - this.lastTick) / this.ticksPerDay;
    if (days > 0) {
      this.favour = Math.min(MAX_FAVOUR, this.favour + days * FAVOUR_PER_DAY);
      this.lastTick = this.tick;
    }
    this.render();
  }

  // ── interaction ─────────────────────────────────────────────────────────────────
  private onButtonClick(power: Power): void {
    if (!this.canApply(power)) return;          // greyed out: on cooldown or not enough favour
    if (power.target === 'world') {             // town-wide: fire at once, no target
      this.onCast(power, null);
      this.commit(power, null);
    } else {                                    // targeted: arm it, then await a map click
      this.armedId = this.armedId === power.id ? null : power.id;   // click again to disarm
      this.render();
    }
  }

  /** The player clicked a map entity while a targeted power was armed. Apply it if it's a soul. */
  castAt(target: EntityId, world: World): boolean {
    const power = this.armed;
    if (!power || power.target !== 'agent') return false;
    if (!world.hasComponent(target, C_AGENT)) return false;        // only folk can be targeted
    if (!this.canApply(power)) return false;
    const name = world.getComponent<Agent>(target, C_AGENT)?.name ?? null;
    this.onCast(power, target);
    this.commit(power, name);
    return true;
  }

  cancelArm(): void { if (this.armedId) { this.armedId = null; this.render(); } }

  private canApply(power: Power): boolean {
    return this.favour >= power.cost && this.tick >= (this.cooldownUntil[power.id] ?? 0);
  }

  // Spend favour, start the cooldown, log the act, disarm. `subject` is the target's name (targeted
  // powers) or null (town-wide).
  private commit(power: Power, subject: string | null): void {
    this.favour = Math.max(0, this.favour - power.cost);
    this.cooldownUntil[power.id] = this.tick + power.cooldownDays * this.ticksPerDay;
    const who = subject ? ` — ${subject}` : ' — the town';
    this.log.unshift(`${glyphOf(power)} ${power.name}${who}`);
    if (this.log.length > LOG_LIMIT) this.log.length = LOG_LIMIT;
    this.armedId = null;
    this.renderLog();
    this.render();
  }

  // ── rendering ─────────────────────────────────────────────────────────────────
  private render(): void {
    const filled = Math.round((this.favour / MAX_FAVOUR) * 12);
    this.favourEl.innerHTML = `Favour ${'▰'.repeat(filled)}<span style="color:#554">${'▱'.repeat(12 - filled)}</span> ${Math.floor(this.favour)}`;

    const armed = this.armed;
    this.hintEl.textContent = armed ? `▶ Click a soul to ${armed.name}` : '';

    for (const { power, el, stateEl } of this.buttons) {
      const cdRemain = (this.cooldownUntil[power.id] ?? 0) - this.tick;
      const onCooldown = cdRemain > 0;
      const usable = this.canApply(power);
      el.style.opacity = usable ? '1' : '0.4';
      el.style.cursor = usable ? 'pointer' : 'default';
      el.style.borderColor = power.id === this.armedId ? '#ffd278' : 'rgba(255,255,255,0.12)';
      el.style.background = power.id === this.armedId ? 'rgba(255,210,120,0.14)' : 'rgba(255,255,255,0.04)';
      stateEl.textContent = onCooldown
        ? `⏳ ${Math.ceil(cdRemain / this.ticksPerDay)}d`
        : `✦${power.cost}`;
      stateEl.style.color = onCooldown ? '#c98' : (this.favour >= power.cost ? '#9c9' : '#c77');
    }
  }

  private renderLog(): void {
    this.logEl.innerHTML = this.log.length
      ? this.log.map(t => `<div style="margin:2px 0">${t}</div>`).join('')
      : '<div style="color:#667">— no acts yet —</div>';
  }
}
