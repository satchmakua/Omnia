import { createSimulation } from './sim/world.ts';
import type { Simulation } from './sim/world.ts';
import { tick } from './sim/loop.ts';
import { enqueueIntervention } from './sim/interventions.ts';
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
import { HeritageDashboard } from './render/heritageDashboard.ts';
import { EcologyDashboard } from './render/ecologyDashboard.ts';
import { ConversationDashboard } from './render/conversationDashboard.ts';
import { ConflictDashboard } from './render/conflictDashboard.ts';
import { FaithsDashboard } from './render/faithsDashboard.ts';
import { SocietyDashboard } from './render/societyDashboard.ts';
import { EventsDashboard } from './render/eventsDashboard.ts';
import { KnowledgeDashboard } from './render/knowledgeDashboard.ts';
import { BestiaryDashboard } from './render/bestiaryDashboard.ts';
import { setSkin } from './render/skin.ts';
import type { Skin } from './render/skin.ts';
import { asTemperament } from './event/director.ts';
import { SpeedControl } from './render/controls.ts';
import { EventFeed } from './render/eventFeed.ts';
import { GodPanel } from './render/godPanel.ts';
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

// Visual skin (M34): a persisted choice the renderer / legend / bestiary read from the skin module.
// Set before the Legend is built so it draws in the right skin. (Lo-fi default; Emoji is the alt.)
let skin: Skin = localStorage.getItem('omnia.skin') === 'emoji' ? 'emoji' : 'lofi';
setSkin(skin);

const renderer  = new Renderer(canvas, baseCfg);
const inspector = new Inspector();
const legends   = new LegendsPanel();
const legend    = new Legend();

// Apply a skin live: update the shared skin state, persist it, and rebuild the (built-once) legend.
// The renderer + bestiary read the skin each frame/render, so they update on their own.
function applySkin(s: Skin): void {
  skin = s;
  setSkin(s);
  localStorage.setItem('omnia.skin', s);
  legend.refresh();
}
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
const heritage  = new HeritageDashboard(focusOn);
const ecology   = new EcologyDashboard();
const conversation = new ConversationDashboard();
const conflict     = new ConflictDashboard();
const faiths       = new FaithsDashboard();
const society      = new SocietyDashboard();
const events       = new EventsDashboard();
const knowledge    = new KnowledgeDashboard(content.tech);
const bestiary     = new BestiaryDashboard(content);

// One master tabbed view holds every global view (M10 slice 1). Per-view hotkeys jump
// straight to a tab; Tab opens it on the current one. The inspector stays the entity
// side-panel; the Legend (L) and Town Happenings (H) stay as glanceable overlays.
const master = new MasterPanel();
master.register({ id: 'legends',   label: 'Legends',   hotkey: 'c', el: legends.content,   update: (w) => legends.update(w) });
master.register({ id: 'economy',   label: 'Economy',   hotkey: 'e', el: economy.content,   update: (w) => economy.update(w) });
master.register({ id: 'directory', label: 'Find',      hotkey: 'f', el: directory.content, update: (w) => directory.update(w), onShow: () => directory.focusSearch() });
master.register({ id: 'family',    label: 'Family',    hotkey: 't', el: family.content,    update: (w) => family.update(w),    onShow: () => family.setSelected(inspector.selectedEntity) });
master.register({ id: 'heritage',  label: 'Heritage',  hotkey: 'k', el: heritage.content,  update: (w) => heritage.update(w) });
master.register({ id: 'ecology',   label: 'Ecology',   hotkey: 'y', el: ecology.content,   update: (w) => ecology.update(w) });
master.register({ id: 'conversation', label: 'Conversation', hotkey: 'v', el: conversation.content, update: (w) => conversation.update(w) });
master.register({ id: 'conflict',  label: 'Conflict',  hotkey: 'x', el: conflict.content,  update: (w) => conflict.update(w) });
master.register({ id: 'faiths',    label: 'Faiths',    hotkey: 'r', el: faiths.content,    update: (w) => faiths.update(w) });
master.register({ id: 'society',   label: 'Society',   hotkey: 's', el: society.content,   update: (w) => society.update(w) });
master.register({ id: 'events',    label: 'Events',    hotkey: 'm', el: events.content,     update: (w) => events.update(w) });
master.register({ id: 'knowledge', label: 'Knowledge', hotkey: 'j', el: knowledge.content,  update: (w) => knowledge.update(w) });
master.register({ id: 'bestiary',  label: 'Bestiary',  hotkey: 'b', el: bestiary.content,   update: (w) => bestiary.update(w) });

// The currently running simulation (null while the start menu is up).
let active: Simulation | null = null;
let activeCfg: SimConfig = baseCfg;
let lastSeed = baseCfg.seed;
// The last chosen setup (seed / starting population / map size), reused by restart.
let lastSetup: SetupOptions = { seed: baseCfg.seed, population: baseCfg.initialPopulation, mapSize: baseCfg.gridWidth, skin, temperament: asTemperament(baseCfg.storytellerTemperament) };
let state: 'menu' | 'running' | 'paused' = 'menu';
let realElapsedMs = 0;   // real-world time spent watching this run (excludes paused/menu)

// The "soul" provider: the deterministic stub by default; the live local model
// (Ollama) when toggled on in Settings (applies on the next run). The async path is
// driven off the hot path by the AISystem and recorded for exact replay (M7.5).
let liveModel = false;
let activeProvider: AIProvider = stubProvider;
const OLLAMA = { baseUrl: 'http://localhost:11434', model: 'llama3.2' };

// God mode (M27): off by default — the observatory is the default experience. When on, the player
// wields the content-driven powers through the GodPanel (slice 3). Every act is a recorded
// `Intervention` (replay-exact, D54); the panel's favour/cooldown limits are pure render-state.
let godMode = false;

let speed = baseCfg.simSpeedTicksPerSecond;
const controls = new SpeedControl(speed, (v) => { speed = v; });

// Apply a god-act immediately so the player sees it: enqueue the recorded intervention, then run a
// single tick (it applies on the next tick boundary — M27 s1). One extra tick is harmless and keeps
// determinism (it's a normal recorded tick).
function stepOnce(): void {
  if (active) tick(active.world, active.rng, activeCfg, active.clockEntity, content, activeProvider);
}
const godPanel = new GodPanel(content.powers.all(), baseCfg.ticksPerDay, (power, target) => {
  if (!active) return;
  enqueueIntervention(active.world, power.id, target);
  stepOnce();
});
// Show the panel only while god mode is on and a world is running.
function refreshGodPanel(): void { godPanel.setActive(godMode && state === 'running' && !!active); }

// Map clicks: while a targeted power is armed they cast it (on a soul); otherwise they inspect.
renderer.setClickHandler((entity) => {
  if (!active) return;
  if (godPanel.isActive && godPanel.armed) { godPanel.castAt(entity, active.world); return; }
  inspector.inspect(entity, active.world);
});
renderer.onTileClick = (x, y) => {
  if (!active) return;
  if (godPanel.isActive && godPanel.armed) { godPanel.cancelArm(); return; }   // click away to cancel
  inspector.inspectTile(x, y, active.world);   // inspect bare terrain/water (M24)
};

function newSimulation(opts: SetupOptions): void {
  lastSetup = opts;
  applySkin(opts.skin);                            // apply the chosen visual skin (M34)
  activeCfg = {
    ...baseCfg, seed: opts.seed, initialPopulation: opts.population,
    gridWidth: opts.mapSize, gridHeight: opts.mapSize, storytellerTemperament: opts.temperament,
  };
  active = createSimulation(activeCfg, content);
  renderer.configure(activeCfg);                 // size the camera/cells to the chosen map
  activeProvider = liveModel ? new OllamaProvider(OLLAMA) : stubProvider;
  lastSeed = opts.seed;
  realElapsedMs = 0;
  inspector.close();
  state = 'running';
  godPanel.reset();          // a fresh world → the god starts at full favour
  refreshGodPanel();
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
    lastSetup = { seed: save.config.seed, population: save.config.initialPopulation, mapSize: save.config.gridWidth, skin, temperament: asTemperament(save.config.storytellerTemperament) };
    realElapsedMs = 0;
    inspector.close();
    menu.hide();
    state = 'running';
    godPanel.reset();
    refreshGodPanel();
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
    onResume: () => { state = 'running'; refreshGodPanel(); },
    onRestart: () => newSimulation(lastSetup),
    onManageSaves: () => showSavesMenu(),
    onSettings: () => menu.showSettings(lastSeed, speed, liveModel, godMode, skin, {
      onApply: (seed) => { menu.hide(); newSimulation({ ...lastSetup, seed }); },
      onToggleLive: () => { liveModel = !liveModel; },
      onToggleGod: () => { godMode = !godMode; refreshGodPanel(); },
      onToggleSkin: () => applySkin(skin === 'emoji' ? 'lofi' : 'emoji'),   // live skin swap (M34)
      onBack: () => showPauseMenu(),
    }),
    onControls: () => menu.showControls(() => showPauseMenu()),
    onQuit: () => { active = null; state = 'menu'; refreshGodPanel(); openStart(); },
  });
}

function pause(): void {
  if (state !== 'running') return;
  state = 'paused';
  refreshGodPanel();   // tuck the god panel away behind the pause menu
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
    content, renderer, inspector, controls, eventFeed, legend, menu, master, godPanel, newSimulation,
    setLiveModel: (v: boolean) => { liveModel = v; },
    get provider() { return activeProvider; },
    step: (n = 1) => { if (active) for (let i = 0; i < n; i++) tick(active.world, active.rng, activeCfg, active.clockEntity, content, activeProvider); },
    // God mode (M27): the GodPanel UI drives this in normal play (s3); this dev handle pokes the
    // same seam. `kind` is a power id from content/powers/*.yaml (s2 — see `powers`).
    god: {
      get on() { return godMode; },
      enable() { godMode = true; refreshGodPanel(); },
      disable() { godMode = false; refreshGodPanel(); },
      powers: () => content.powers.all().map(p => ({ id: p.id, name: p.name, target: p.target, blurb: p.blurb })),
      act(kind: string, target: number | null, amount?: number) {
        if (godMode && active) return enqueueIntervention(active.world, kind, target, amount);
        return null;
      },
    },
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
    godPanel.update(active.world);    // god mode: regen favour + refresh power states (no-op when inactive)
    bestiary.observe(active.world);   // track "last seen" every frame, even with the tab closed (M22)
    // Keep the open master tab's figures live (cheap; throttled).
    if (frame++ % 20 === 0) master.refresh(active.world);
  }
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (godPanel.armed) godPanel.cancelArm();      // disarm a primed power first
    else if (master.visible) master.hide();        // then close the master view
    else if (inspector.isOpen) inspector.close();  // then close an open inspector card
    else if (state === 'running') pause();
    else if (state === 'paused') { menu.hide(); state = 'running'; refreshGodPanel(); }
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
  else if (e.key === 'g' || e.key === 'G') { godMode = !godMode; refreshGodPanel(); e.preventDefault(); }   // become a god / step back (M27)
  else if (e.key === 'ArrowLeft')  { renderer.panBy(-0.12, 0); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { renderer.panBy(0.12, 0); e.preventDefault(); }
  else if (e.key === 'ArrowUp')    { renderer.panBy(0, -0.12); e.preventDefault(); }
  else if (e.key === 'ArrowDown')  { renderer.panBy(0, 0.12); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') { renderer.zoomAt(canvas.width / 2, canvas.height / 2, 1.2); }
  else if (e.key === '-' || e.key === '_') { renderer.zoomAt(canvas.width / 2, canvas.height / 2, 1 / 1.2); }
});

openStart();
requestAnimationFrame(loop);
