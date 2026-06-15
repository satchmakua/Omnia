import { createSimulation } from './sim/world.ts';
import { tick } from './sim/loop.ts';
import { defaultConfig } from './sim/config.ts';
import { loadContent } from './content/loader.ts';
import { Renderer } from './render/renderer.ts';
import { Inspector } from './render/inspector.ts';
import { LegendsPanel } from './render/legendsPanel.ts';
import { SpeedControl } from './render/controls.ts';
import { EventFeed } from './render/eventFeed.ts';

// Browser content source: Vite bundles every YAML under /content as raw text.
// (Node code paths use src/content/fsSource.ts instead.)
const rawFiles = import.meta.glob('/content/**/*.{yaml,yml}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const fileMap = new Map<string, string>(
  Object.entries(rawFiles).map(([path, text]) => [path.replace(/^\/content\//, ''), text]),
);
const content = loadContent(fileMap);

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const cfg    = defaultConfig;
const sim    = createSimulation(cfg, content);
const { world, rng, clockEntity } = sim;

const renderer  = new Renderer(canvas, cfg);
const inspector = new Inspector();
const legends = new LegendsPanel();
const eventFeed = new EventFeed();

renderer.setClickHandler((entity) => inspector.inspect(entity, world));

// Real-time playback: the renderer draws every animation frame, but the sim only
// advances at `speed` ticks per second (decoupled from real time, per
// ARCHITECTURE.md). The speed slider / Space key change `speed`; 0 = paused.
let speed = cfg.simSpeedTicksPerSecond;
const controls = new SpeedControl(speed, (v) => { speed = v; });

// Dev-only debug handle (stripped from production builds by Vite).
if (import.meta.env.DEV) {
  (window as unknown as { __omnia: unknown }).__omnia = {
    sim, world, content, renderer, inspector, controls, eventFeed, legends,
    // step() advances the sim manually (useful when a hidden tab throttles rAF).
    step: (n = 1) => { for (let i = 0; i < n; i++) tick(world, rng, cfg, clockEntity, content); },
  };
}

let last = performance.now();
let tickAccumulator = 0;

function loop(now: number) {
  const dtSeconds = Math.min(now - last, 250) / 1000; // clamp to avoid catch-up spirals
  last = now;

  if (speed > 0) {
    tickAccumulator += dtSeconds * speed;
    let steps = Math.floor(tickAccumulator);
    tickAccumulator -= steps;
    steps = Math.min(steps, 30); // never block the frame on a huge backlog
    for (let i = 0; i < steps; i++) tick(world, rng, cfg, clockEntity, content);
  }

  renderer.render(world, clockEntity);
  renderer.consumeClick(world);
  inspector.update(world);
  eventFeed.render(world);
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { controls.togglePause(); e.preventDefault(); }
  if (e.key === 'c' || e.key === 'C') { legends.toggle(world); }
});

requestAnimationFrame(loop);
