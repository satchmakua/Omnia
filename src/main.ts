import { createSimulation } from './sim/world.ts';
import type { Simulation } from './sim/world.ts';
import { tick } from './sim/loop.ts';
import { buildSave, loadSave, serializeSave, parseSave } from './sim/saveload.ts';
import { listSaves, putSave, getSaveJson, deleteSave } from './sim/saveStore.ts';
import { loadSimConfig } from './sim/configLoader.ts';
import type { SimConfig } from './sim/config.ts';
import simulationYaml from '../config/simulation.yaml?raw';
import { loadContent } from './content/loader.ts';
import { Renderer } from './render/renderer.ts';
import { Inspector } from './render/inspector.ts';
import { LegendsPanel } from './render/legendsPanel.ts';
import { Legend } from './render/legend.ts';
import { Menu } from './render/menu.ts';
import type { SetupOptions } from './render/menu.ts';
import { MasterPanel } from './render/masterPanel.ts';
import { EconomyDashboard } from './render/economyDashboard.ts';
import { DirectoryDashboard } from './render/directoryDashboard.ts';
import { FamilyDashboard } from './render/familyDashboard.ts';
import { LineagesDashboard } from './render/lineagesDashboard.ts';
import { EcologyDashboard } from './render/ecologyDashboard.ts';
import { ConversationDashboard } from './render/conversationDashboard.ts';
import { LanguageDashboard } from './render/languageDashboard.ts';
import { OrgDashboard } from './render/orgDashboard.ts';
import { ConflictDashboard } from './render/conflictDashboard.ts';
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
// The authoritative tunables come from config/simulation.yaml (M9); the setup screen
// then overrides seed / population / map size per run.
const baseCfg = loadSimConfig(simulationYaml);

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
const ecology   = new EcologyDashboard();
const conversation = new ConversationDashboard();
const language     = new LanguageDashboard();
const tribes       = new OrgDashboard();
const conflict     = new ConflictDashboard();

// One master tabbed view holds every global view (M10 slice 1). Per-view hotkeys jump
// straight to a tab; Tab opens it on the current one. The inspector stays the entity
// side-panel; the Legend (L) and Town Happenings (H) stay as glanceable overlays.
const master = new MasterPanel();
master.register({ id: 'legends',   label: 'Legends',   hotkey: 'c', el: legends.content,   update: (w) => legends.update(w) });
master.register({ id: 'economy',   label: 'Economy',   hotkey: 'e', el: economy.content,   update: (w) => economy.update(w) });
master.register({ id: 'directory', label: 'Find',      hotkey: 'f', el: directory.content, update: (w) => directory.update(w), onShow: () => directory.focusSearch() });
master.register({ id: 'family',    label: 'Family',    hotkey: 't', el: family.content,    update: (w) => family.update(w),    onShow: () => family.setSelected(inspector.selectedEntity) });
master.register({ id: 'lineages',  label: 'Lineages',  hotkey: 'g', el: lineages.content,  update: (w) => lineages.update(w) });
master.register({ id: 'ecology',   label: 'Ecology',   hotkey: 'y', el: ecology.content,   update: (w) => ecology.update(w) });
master.register({ id: 'conversation', label: 'Conversation', hotkey: 'v', el: conversation.content, update: (w) => conversation.update(w) });
master.register({ id: 'language',  label: 'Language',  hotkey: 'n', el: language.content,  update: (w) => language.update(w) });
master.register({ id: 'tribes',    label: 'Tribes',    hotkey: 'k', el: tribes.content,    update: (w) => tribes.update(w) });
master.register({ id: 'conflict',  label: 'Conflict',  hotkey: 'x', el: conflict.content,  update: (w) => conflict.update(w) });

// The currently running simulation (null while the start menu is up).
let active: Simulation | null = null;
let activeCfg: SimConfig = baseCfg;
let lastSeed = baseCfg.seed;
// The last chosen setup (seed / starting population / map size), reused by restart.
let lastSetup: SetupOptions = { seed: baseCfg.seed, population: baseCfg.initialPopulation, mapSize: baseCfg.gridWidth };
let state: 'menu' | 'running' | 'paused' = 'menu';
let realElapsedMs = 0;   // real-world time spent watching this run (excludes paused/menu)

// The "soul" provider: the deterministic stub by default; the live local model
// (Ollama) when toggled on in Settings (applies on the next run). The async path is
// driven off the hot path by the AISystem and recorded for exact replay (M7.5).
let liveModel = false;
let activeProvider: AIProvider = stubProvider;
const OLLAMA = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };

renderer.setClickHandler((entity) => { if (active) inspector.inspect(entity, active.world); });

let speed = baseCfg.simSpeedTicksPerSecond;
const controls = new SpeedControl(speed, (v) => { speed = v; });

function newSimulation(opts: SetupOptions): void {
  lastSetup = opts;
  activeCfg = {
    ...baseCfg, seed: opts.seed, initialPopulation: opts.population,
    gridWidth: opts.mapSize, gridHeight: opts.mapSize,
  };
  active = createSimulation(activeCfg, content);
  renderer.configure(activeCfg);                 // size the camera/cells to the chosen map
  activeProvider = liveModel ? new OllamaProvider(OLLAMA) : stubProvider;
  lastSeed = opts.seed;
  realElapsedMs = 0;
  inspector.close();
  state = 'running';
}

// Load a serialized save (a named world, or an imported file). Snapshot-fast when the save
// carries one (M12); replays from config otherwise. Robust: a bad save logs and is ignored.
function loadFromJson(json: string): void {
  try {
    const save = parseSave(json);
    activeCfg = save.config;
    active = loadSave(save, content);
    renderer.configure(activeCfg);
    activeProvider = liveModel ? new OllamaProvider(OLLAMA) : stubProvider;
    lastSeed = save.config.seed;
    lastSetup = { seed: save.config.seed, population: save.config.initialPopulation, mapSize: save.config.gridWidth };
    realElapsedMs = 0;
    inspector.close();
    menu.hide();
    state = 'running';
  } catch (e) {
    console.error('Failed to load save:', e);
  }
}

function defaultSaveName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `world ${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Download the current world as a portable .omnia file (M12 disk export).
function exportCurrent(): void {
  if (!active) return;
  const blob = new Blob([serializeSave(buildSave(active, activeCfg))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${defaultSaveName()}.omnia`;
  a.click();
  URL.revokeObjectURL(url);
}

// The save manager (M12): named worlds in IndexedDB + disk export/import.
function showSavesMenu(): void {
  menu.showSaves({
    list: () => listSaves(),
    onSaveAs: async (name) => {
      if (!active) return;
      const save = buildSave(active, activeCfg);
      const meta = { name, savedAt: Date.now(), tick: save.savedAtTick, pop: active.world.query(C_AGENT).length, seed: activeCfg.seed };
      await putSave({ name, json: serializeSave(save), meta });
    },
    onLoadNamed: (name) => { void getSaveJson(name).then((json) => { if (json) loadFromJson(json); }); },
    onDelete: (name) => deleteSave(name),
    onExport: () => exportCurrent(),
    onImport: (file) => { void file.text().then(loadFromJson); },
    onBack: () => showPauseMenu(),
    defaultName: defaultSaveName(),
  });
}

function showPauseMenu(): void {
  menu.showPause({
    onResume: () => { state = 'running'; },
    onRestart: () => newSimulation(lastSetup),
    onManageSaves: () => showSavesMenu(),
    onSettings: () => menu.showSettings(lastSeed, speed, liveModel, {
      onApply: (seed) => { menu.hide(); newSimulation({ ...lastSetup, seed }); },
      onToggleLive: () => { liveModel = !liveModel; },
      onBack: () => showPauseMenu(),
    }),
    onControls: () => menu.showControls(() => showPauseMenu()),
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
  menu.showStart(lastSetup, newSimulation);
}

// Dev-only debug handle (stripped from production builds by Vite).
if (import.meta.env.DEV) {
  (window as unknown as { __omnia: unknown }).__omnia = {
    get sim() { return active; },
    get world() { return active?.world; },
    content, renderer, inspector, controls, eventFeed, legend, menu, master, newSimulation,
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

  // Smooth motion is only worthwhile at watchable speeds (when tiles snap visibly); at fast-
  // forward, many ticks per frame make interpolation pointless, so we skip it.
  const smoothMotion = state === 'running' && speed > 0 && speed <= 50;

  if (state === 'running' && active && speed > 0) {
    realElapsedMs += dtSeconds * 1000;
    tickAccumulator += dtSeconds * speed;
    // Cap ticks-per-frame high enough for ~1 year/sec at top speed, but bounded so a
    // stall can't trigger a catch-up spiral.
    const steps = Math.min(Math.floor(tickAccumulator), 500);
    tickAccumulator -= Math.floor(tickAccumulator);
    for (let i = 0; i < steps; i++) {
      tick(active.world, active.rng, activeCfg, active.clockEntity, content, activeProvider);
      if (smoothMotion) renderer.syncPositions(active.world);   // snapshot tiles for gliding
    }
  }

  if (active) {
    if (!smoothMotion) renderer.clearInterp();
    renderer.render(active.world, active.clockEntity, realElapsedMs, smoothMotion ? tickAccumulator : 1);
    renderer.consumeClick(active.world);
    inspector.update(active.world);
    eventFeed.render(active.world);
    // Keep the open master tab's figures live (cheap; throttled).
    if (frame++ % 20 === 0) master.refresh(active.world);
  }
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (master.visible) master.hide();             // close the master view first
    else if (inspector.isOpen) inspector.close();  // then close an open inspector card
    else if (state === 'running') pause();
    else if (state === 'paused') { menu.hide(); state = 'running'; }
    return;
  }
  // Don't fire hotkeys while typing in a field (directory search, seed input).
  if (document.activeElement instanceof HTMLInputElement) return;
  if (state !== 'running' || !active) return;
  // preventDefault on the letter hotkeys so the keystroke that opens a search field
  // (Find) isn't also typed into it.
  if (e.key === ' ') { controls.togglePause(); e.preventDefault(); }
  else if (e.key === 'Tab') { master.open(active.world); e.preventDefault(); }
  else if (master.isTabKey(e.key)) { master.openTab(e.key, active.world); e.preventDefault(); }
  else if (e.key === 'l' || e.key === 'L') { legend.toggle(); e.preventDefault(); }
  else if (e.key === 'h' || e.key === 'H') { eventFeed.toggle(); e.preventDefault(); }
  else if (e.key === 'ArrowLeft')  { renderer.panBy(-0.12, 0); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { renderer.panBy(0.12, 0); e.preventDefault(); }
  else if (e.key === 'ArrowUp')    { renderer.panBy(0, -0.12); e.preventDefault(); }
  else if (e.key === 'ArrowDown')  { renderer.panBy(0, 0.12); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') { renderer.zoomAt(canvas.width / 2, canvas.height / 2, 1.2); }
  else if (e.key === '-' || e.key === '_') { renderer.zoomAt(canvas.width / 2, canvas.height / 2, 1 / 1.2); }
});

openStart();
requestAnimationFrame(loop);
