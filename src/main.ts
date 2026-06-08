import { createSimulation } from './sim/world.ts';
import { tick } from './sim/loop.ts';
import { defaultConfig } from './sim/config.ts';
import { Renderer } from './render/renderer.ts';
import { Inspector } from './render/inspector.ts';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const cfg    = defaultConfig;
const sim    = createSimulation(cfg);
const { world, rng, clockEntity } = sim;

const renderer  = new Renderer(canvas, cfg);
const inspector = new Inspector();

renderer.setClickHandler((entity) => inspector.inspect(entity, world));

let paused = false;

function loop() {
  if (!paused) tick(world, rng, cfg, clockEntity);
  renderer.render(world, clockEntity);
  renderer.consumeClick(world);
  inspector.update(world);
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
});

loop();
