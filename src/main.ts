import { createSimulation } from './sim/world.ts';
import { tick } from './sim/loop.ts';
import { defaultConfig } from './sim/config.ts';
import { loadContent } from './content/loader.ts';
import { Renderer } from './render/renderer.ts';
import { Inspector } from './render/inspector.ts';

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

renderer.setClickHandler((entity) => inspector.inspect(entity, world));

let paused = false;

function loop() {
  if (!paused) tick(world, rng, cfg, clockEntity, content);
  renderer.render(world, clockEntity);
  renderer.consumeClick(world);
  inspector.update(world);
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
});

loop();
