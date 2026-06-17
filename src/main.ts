import { createSimulation } from './sim/world.ts';
import type { Simulation } from './sim/world.ts';
import { tick } from './sim/loop.ts';
import { defaultConfig } from './sim/config.ts';
import type { SimConfig } from './sim/config.ts';
import { loadContent } from './content/loader.ts';
import { Renderer } from './render/renderer.ts';
import { Inspector } from './render/inspector.ts';
import { LegendsPanel } from './render/legendsPanel.ts';
import { Legend } from './render/legend.ts';
import { Menu } from './render/menu.ts';
import { EconomyDashboard } from './render/economyDashboard.ts';
import { DirectoryDashboard } from './render/directoryDashboard.ts';
import { FamilyDashboard } from './render/familyDashboard.ts';
import { LineagesDashboard } from './render/lineagesDashboard.ts';
import { SpeedControl } from './render/controls.ts';
import { EventFeed } from './render/eventFeed.ts';
import { C_AGENT, C_POSITION } from './sim/components.ts';
import type { Position } from './sim/components.ts';
import type { EntityId } from './sim/ecs.ts';
import { stubProvider } from './ai/stubProvider.ts';
import { OllamaProvider } from './ai/ollamaProvider.ts';
import type { AIProvider } from './ai/provider.ts';

// Browser content source: Vite bundles every YAML under /content as raw text.
const rawFiles = import.meta.glob('/content/**/*.{yaml,yml}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const fileMap = new Map<string, string>(
  Object.entries(rawFiles).map(([path, text]) => [path.replace(/^\/content\//, ''), text]),
);
const content = loadContent(fileMap);

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const baseCfg = defaultConfig;

const renderer  = new Renderer(canvas, baseCfg);
const inspector = new Inspector();
const legends   = new LegendsPanel();
const legend    = new Legend();
const eventFeed = new EventFeed();
const menu      = new Menu();

// Inspect a person and jump the camera to them (no-op for the dead, who have no
// position). Used by the directory and family-tree dashboards.
function focusOn(e: EntityId): void {
  if (!active || !active.world.hasComponent(e, C_AGENT)) return;
  inspector.inspect(e, active.world);
  const p = active.world.getComponent<Position>(e, C_POSITION);
  if (p) renderer.centerOn(p.x, p.y);
}
const economy   = new EconomyDashboard();
const directory = new DirectoryDashboard(focusOn);
const family    = new FamilyDashboard(focusOn);
const lineages  = new LineagesDashboard();

// The currently running simulation (null while the start menu is up).
let active: Simulation | null = null;
let activeCfg: SimConfig = baseCfg;
let lastSeed = baseCfg.seed;
let state: 'menu' | 'running' | 'paused' = 'menu';

// The "soul" provider: the deterministic stub by default; the live local model
// (Ollama) when toggled on in Settings (applies on the next run). The async path is
// driven off the hot path by the AISystem and recorded for exact replay (M7.5).
let liveModel = false;
let activeProvider: AIProvider = stubProvider;
const OLLAMA = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };

renderer.setClickHandler((entity) => { if (active) inspector.inspect(entity, active.world); });

let speed = baseCfg.simSpeedTicksPerSecond;
const controls = new SpeedControl(speed, (v) => { speed = v; });

function newSimulation(seed: number): void {
  activeCfg = { ...baseCfg, seed };
  active = createSimulation(activeCfg, content);
  activeProvider = liveModel ? new OllamaProvider(OLLAMA) : stubProvider;
  lastSeed = seed;
  inspector.close();
  state = 'running';
}

function showPauseMenu(): void {
  menu.showPause({
    onResume: () => { state = 'running'; },
    onRestart: () => newSimulation(lastSeed),
    onSettings: () => menu.showSettings(lastSeed, speed, liveModel, {
      onApply: (seed) => { menu.hide(); newSimulation(seed); },
      onToggleLive: () => { liveModel = !liveModel; },
      onBack: () => showPauseMenu(),
    }),
    onQuit: () => { active = null; state = 'menu'; openStart(); },
  });
}

function pause(): void {
  if (state !== 'running') return;
  state = 'paused';
  showPauseMenu();
}

function openStart(): void {
  state = 'menu';
  menu.showStart(lastSeed, newSimulation);
}

// ── hotkey dashboards (mutually exclusive; one open at a time) ──────────────────
function anyDashOpen(): boolean {
  return legends.isOpen || directory.visible || economy.visible || family.visible || lineages.visible;
}
function closeDashboards(): void {
  legends.hide(); directory.hide(); economy.hide(); family.hide(); lineages.hide();
}
function toggleDashboard(kind: 'legends' | 'directory' | 'economy' | 'family' | 'lineages'): void {
  if (!active) return;
  const w = active.world;
  const wasOpen =
    kind === 'legends' ? legends.isOpen :
    kind === 'directory' ? directory.visible :
    kind === 'economy' ? economy.visible :
    kind === 'lineages' ? lineages.visible : family.visible;
  closeDashboards();
  if (wasOpen) return;
  if (kind === 'legends') legends.toggle(w);
  else if (kind === 'directory') directory.toggle(w);
  else if (kind === 'economy') economy.toggle(w);
  else if (kind === 'lineages') lineages.toggle(w);
  else family.toggle(w, inspector.selectedEntity);
}

// Dev-only debug handle (stripped from production builds by Vite).
if (import.meta.env.DEV) {
  (window as unknown as { __omnia: unknown }).__omnia = {
    get sim() { return active; },
    get world() { return active?.world; },
    content, renderer, inspector, controls, eventFeed, legends, legend, menu,
    economy, directory, family, lineages, newSimulation, toggleDashboard,
    setLiveModel: (v: boolean) => { liveModel = v; },
    get provider() { return activeProvider; },
    step: (n = 1) => { if (active) for (let i = 0; i < n; i++) tick(active.world, active.rng, activeCfg, active.clockEntity, content, activeProvider); },
  };
}

let last = performance.now();
let tickAccumulator = 0;
let frame = 0;

function loop(now: number) {
  const dtSeconds = Math.min(now - last, 250) / 1000;
  last = now;

  if (state === 'running' && active && speed > 0) {
    tickAccumulator += dtSeconds * speed;
    const steps = Math.min(Math.floor(tickAccumulator), 30);
    tickAccumulator -= Math.floor(tickAccumulator);
    for (let i = 0; i < steps; i++) tick(active.world, active.rng, activeCfg, active.clockEntity, content, activeProvider);
  }

  if (active) {
    renderer.render(active.world, active.clockEntity);
    renderer.consumeClick(active.world);
    inspector.update(active.world);
    eventFeed.render(active.world);
    // Keep an open dashboard's figures live (cheap; throttled).
    if (frame++ % 20 === 0) {
      economy.refresh(active.world);
      directory.refresh(active.world);
      family.refresh(active.world);
      lineages.refresh(active.world);
    }
  }
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (anyDashOpen()) closeDashboards();          // back out of a dashboard first
    else if (state === 'running') pause();
    else if (state === 'paused') { menu.hide(); state = 'running'; }
    return;
  }
  // Don't fire hotkeys while typing in a field (directory search, seed input).
  if (document.activeElement instanceof HTMLInputElement) return;
  if (state !== 'running' || !active) return;
  if (e.key === ' ') { controls.togglePause(); e.preventDefault(); }
  else if (e.key === 'c' || e.key === 'C') { toggleDashboard('legends'); }
  else if (e.key === 'e' || e.key === 'E') { toggleDashboard('economy'); }
  else if (e.key === 'f' || e.key === 'F') { toggleDashboard('directory'); }
  else if (e.key === 't' || e.key === 'T') { toggleDashboard('family'); }
  else if (e.key === 'g' || e.key === 'G') { toggleDashboard('lineages'); }
  else if (e.key === 'l' || e.key === 'L') { legend.toggle(); }
  else if (e.key === 'ArrowLeft')  { renderer.panBy(-0.12, 0); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { renderer.panBy(0.12, 0); e.preventDefault(); }
  else if (e.key === 'ArrowUp')    { renderer.panBy(0, -0.12); e.preventDefault(); }
  else if (e.key === 'ArrowDown')  { renderer.panBy(0, 0.12); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') { renderer.zoomAt(canvas.width / 2, canvas.height / 2, 1.2); }
  else if (e.key === '-' || e.key === '_') { renderer.zoomAt(canvas.width / 2, canvas.height / 2, 1 / 1.2); }
});

openStart();
requestAnimationFrame(loop);
