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
import { SpeedControl } from './render/controls.ts';
import { EventFeed } from './render/eventFeed.ts';

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

// The currently running simulation (null while the start menu is up).
let active: Simulation | null = null;
let activeCfg: SimConfig = baseCfg;
let lastSeed = baseCfg.seed;
let state: 'menu' | 'running' | 'paused' = 'menu';

renderer.setClickHandler((entity) => { if (active) inspector.inspect(entity, active.world); });

let speed = baseCfg.simSpeedTicksPerSecond;
const controls = new SpeedControl(speed, (v) => { speed = v; });

function newSimulation(seed: number): void {
  activeCfg = { ...baseCfg, seed };
  active = createSimulation(activeCfg, content);
  lastSeed = seed;
  inspector.close();
  state = 'running';
}

function pause(): void {
  if (state !== 'running') return;
  state = 'paused';
  menu.showPause({
    onResume: () => { state = 'running'; },
    onRestart: () => newSimulation(lastSeed),
    onQuit: () => { active = null; state = 'menu'; openStart(); },
  });
}

function openStart(): void {
  state = 'menu';
  menu.showStart(lastSeed, newSimulation);
}

// Dev-only debug handle (stripped from production builds by Vite).
if (import.meta.env.DEV) {
  (window as unknown as { __omnia: unknown }).__omnia = {
    get sim() { return active; },
    get world() { return active?.world; },
    content, renderer, inspector, controls, eventFeed, legends, legend, menu,
    newSimulation,
    step: (n = 1) => { if (active) for (let i = 0; i < n; i++) tick(active.world, active.rng, activeCfg, active.clockEntity, content); },
  };
}

let last = performance.now();
let tickAccumulator = 0;

function loop(now: number) {
  const dtSeconds = Math.min(now - last, 250) / 1000;
  last = now;

  if (state === 'running' && active && speed > 0) {
    tickAccumulator += dtSeconds * speed;
    let steps = Math.min(Math.floor(tickAccumulator), 30);
    tickAccumulator -= Math.floor(tickAccumulator);
    for (let i = 0; i < steps; i++) tick(active.world, active.rng, activeCfg, active.clockEntity, content);
  }

  if (active) {
    renderer.render(active.world, active.clockEntity);
    renderer.consumeClick(active.world);
    inspector.update(active.world);
    eventFeed.render(active.world);
  }
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state === 'running') pause();
    else if (state === 'paused') { menu.hide(); state = 'running'; }
    return;
  }
  if (state !== 'running' || !active) return;
  if (e.key === ' ') { controls.togglePause(); e.preventDefault(); }
  else if (e.key === 'c' || e.key === 'C') { legends.toggle(active.world); }
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
