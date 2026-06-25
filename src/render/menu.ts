// Start menu and in-game pause menu (M6.5 slice 2). A full-screen overlay that
// blocks the sim behind it; the start menu boots a run (with a chosen seed), the
// pause menu offers resume / restart / quit-to-menu.

export interface PauseActions {
  onResume: () => void;
  onRestart: () => void;
  onSave: () => void;
  onLoad: () => void;
  hasSave: boolean;
  onSettings: () => void;
  onControls: () => void;
  onQuit: () => void;
}

// One source of truth for the key map, shown in the Controls screen (and the start
// menu's how-to). Moved off the always-on screen into the menu (M19).
const CONTROLS: [string, string][] = [
  ['Scroll / drag', 'zoom & pan the map'],
  ['Arrow keys · + −', 'pan & zoom'],
  ['Click', 'inspect anything (✕ or Esc closes the card)'],
  ['Space', 'pause / resume'],
  ['Esc', 'menu · or close an open card / dashboard'],
  ['C', 'Legends &amp; town charts'],
  ['E', 'Economy'],
  ['F', 'Find folk'],
  ['T', 'Family tree'],
  ['G', 'Lineages of cultures &amp; tongues'],
  ['Y', 'Ecology — fauna &amp; flora'],
  ['V', 'Conversation — what the town is saying'],
  ['N', 'Language — tongues, sounds &amp; fluency'],
  ['L', 'toggle the Legend key'],
  ['H', 'toggle Town Happenings'],
];

// What the start screen collects to begin a run.
export interface SetupOptions { seed: number; population: number; mapSize: number; }

// Map-size presets (square, in tiles). Small is the tuned default; the larger ones
// reach the M8 10–20× range. Each dim is used for both gridWidth and gridHeight.
export const MAP_SIZES: { label: string; dim: number }[] = [
  { label: 'Small', dim: 64 },
  { label: 'Medium', dim: 128 },
  { label: 'Large', dim: 200 },
  { label: 'Huge', dim: 288 },
];

const INPUT_STYLE: Partial<CSSStyleDeclaration> = {
  flex: '1', background: '#10101e', color: '#eee', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '8px', font: '13px monospace',
};

// A labelled control row (label · control · optional trailing element).
function labelledRow(labelText: string, control: HTMLElement, trailing?: HTMLElement): HTMLDivElement {
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 10px' } as Partial<CSSStyleDeclaration>);
  const label = document.createElement('span');
  label.textContent = labelText; label.style.color = '#99a'; label.style.minWidth = '52px';
  row.append(label, control);
  if (trailing) row.append(trailing);
  return row;
}

function styledButton(label: string, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.style, {
    display: 'block', width: '100%', margin: '6px 0', padding: '10px 14px',
    background: primary ? '#3a3a66' : '#23233a', color: '#eee',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: '7px',
    font: '13px monospace', cursor: 'pointer', textAlign: 'left',
  } as Partial<CSSStyleDeclaration>);
  b.addEventListener('mouseenter', () => { b.style.background = primary ? '#46467e' : '#2e2e4c'; });
  b.addEventListener('mouseleave', () => { b.style.background = primary ? '#3a3a66' : '#23233a'; });
  return b;
}

export class Menu {
  private readonly backdrop: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private _open = false;

  constructor() {
    this.backdrop = document.createElement('div');
    Object.assign(this.backdrop.style, {
      position: 'fixed', inset: '0', background: 'rgba(6,6,16,0.78)',
      display: 'none', alignItems: 'center', justifyContent: 'center', zIndex: '20',
    } as Partial<CSSStyleDeclaration>);

    this.card = document.createElement('div');
    Object.assign(this.card.style, {
      width: 'min(360px, 92vw)', background: 'rgba(14,14,30,0.98)', color: '#e6e6f0',
      fontFamily: 'monospace', padding: '24px 26px', borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 50px rgba(0,0,0,0.6)',
    } as Partial<CSSStyleDeclaration>);

    this.backdrop.appendChild(this.card);
    document.body.appendChild(this.backdrop);
  }

  get isOpen(): boolean { return this._open; }

  private open(): void { this._open = true; this.backdrop.style.display = 'flex'; }
  hide(): void { this._open = false; this.backdrop.style.display = 'none'; }

  private title(text: string, sub: string): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.innerHTML =
      `<div style="font-size:22px;font-weight:bold;color:#ffd278;letter-spacing:1px">${text}</div>` +
      `<div style="color:#99a;margin:4px 0 16px">${sub}</div>`;
    return wrap;
  }

  showStart(defaults: SetupOptions, onStart: (opts: SetupOptions) => void): void {
    this.card.innerHTML = '';
    this.card.appendChild(this.title('Omnia', 'the everything simulator — a town of deep little lives'));

    // Seed.
    const seedInput = document.createElement('input');
    seedInput.type = 'number'; seedInput.value = String(defaults.seed);
    Object.assign(seedInput.style, INPUT_STYLE);
    this.card.append(labelledRow('Seed', seedInput));

    // Starting population (10–100).
    let population = Math.max(10, Math.min(100, defaults.population));
    const popReadout = document.createElement('span');
    Object.assign(popReadout.style, { color: '#ffd278', minWidth: '28px', textAlign: 'right' } as Partial<CSSStyleDeclaration>);
    popReadout.textContent = String(population);
    const popSlider = document.createElement('input');
    popSlider.type = 'range'; popSlider.min = '10'; popSlider.max = '100'; popSlider.step = '5';
    popSlider.value = String(population);
    Object.assign(popSlider.style, { flex: '1', cursor: 'pointer' } as Partial<CSSStyleDeclaration>);
    popSlider.addEventListener('input', () => { population = Number(popSlider.value); popReadout.textContent = String(population); });
    this.card.append(labelledRow('Folk', popSlider, popReadout));

    // Map size presets.
    let mapSize = defaults.mapSize;
    const sizeRow = document.createElement('div');
    Object.assign(sizeRow.style, { display: 'flex', gap: '6px', margin: '2px 0 12px' } as Partial<CSSStyleDeclaration>);
    const sizeBtns: HTMLButtonElement[] = [];
    const highlight = () => sizeBtns.forEach((b, i) => {
      const sel = MAP_SIZES[i].dim === mapSize;
      b.style.background = sel ? '#46467e' : '#23233a';
      b.style.borderColor = sel ? '#8a8ad0' : 'rgba(255,255,255,0.12)';
    });
    MAP_SIZES.forEach((s) => {
      const b = document.createElement('button');
      b.textContent = s.label; b.title = `${s.dim}×${s.dim} tiles`;
      Object.assign(b.style, { flex: '1', padding: '8px 4px', color: '#eee',
        border: '1px solid rgba(255,255,255,0.12)', borderRadius: '7px', font: '12px monospace', cursor: 'pointer' } as Partial<CSSStyleDeclaration>);
      b.addEventListener('click', () => { mapSize = s.dim; highlight(); });
      sizeBtns.push(b); sizeRow.append(b);
    });
    highlight();
    const sizeLabel = document.createElement('div');
    sizeLabel.textContent = 'Map size'; Object.assign(sizeLabel.style, { color: '#99a', margin: '2px 0 4px' } as Partial<CSSStyleDeclaration>);
    this.card.append(sizeLabel, sizeRow);

    const start = styledButton('▶  New simulation', true);
    start.addEventListener('click', () => {
      const seed = Math.floor(Number(seedInput.value)) || defaults.seed;
      this.hide();
      onStart({ seed, population, mapSize });
    });

    const help = styledButton('?  How to play');
    const about = document.createElement('div');
    Object.assign(about.style, { color: '#aab', fontSize: '12px', lineHeight: '1.6', margin: '8px 2px 0', display: 'none' } as Partial<CSSStyleDeclaration>);
    about.innerHTML =
      'Scroll to zoom, drag or arrow-keys to pan, click anyone to inspect.<br>' +
      'Space pauses time; the slider sets its speed. Esc opens the menu — ' +
      '<b>Controls</b> there lists every key.<br>' +
      'Then just watch — folk work, wed, raise families, hunt, reflect, and pass on.';
    help.addEventListener('click', () => { about.style.display = about.style.display === 'none' ? 'block' : 'none'; });

    this.card.append(start, help, about);
    this.open();
  }

  showPause(a: PauseActions): void {
    this.card.innerHTML = '';
    this.card.appendChild(this.title('Paused', 'time is held'));
    const resume = styledButton('▶  Resume', true);
    const restart = styledButton('↻  Restart (same setup)');
    const save = styledButton('💾  Save game');
    const load = styledButton('📂  Load game');
    const settings = styledButton('⚙  Settings');
    const controls = styledButton('⌨  Controls');
    const quit = styledButton('⏏  Quit to menu');
    resume.addEventListener('click', () => { this.hide(); a.onResume(); });
    restart.addEventListener('click', () => { this.hide(); a.onRestart(); });
    save.addEventListener('click', () => {
      a.onSave();
      save.textContent = '✓  Saved';
      setTimeout(() => { save.textContent = '💾  Save game'; }, 1200);
    });
    if (!a.hasSave) { load.style.opacity = '0.45'; load.style.cursor = 'default'; }
    load.addEventListener('click', () => { if (a.hasSave) { this.hide(); a.onLoad(); } });
    settings.addEventListener('click', () => a.onSettings());
    controls.addEventListener('click', () => a.onControls());
    quit.addEventListener('click', () => a.onQuit());
    this.card.append(resume, restart, save, load, settings, controls, quit);
    this.open();
  }

  // The controls reference (Esc → Controls), replacing the old always-on HUD strip.
  showControls(onBack: () => void): void {
    this.card.innerHTML = '';
    this.card.appendChild(this.title('Controls', 'how to get around'));
    const rows = document.createElement('div');
    Object.assign(rows.style, { color: '#cdd', fontSize: '12.5px', lineHeight: '1.85', margin: '2px 0 14px' } as Partial<CSSStyleDeclaration>);
    rows.innerHTML = CONTROLS
      .map(([k, v]) => `<div style="display:flex;gap:10px"><span style="color:#ffd278;min-width:128px">${k}</span><span>${v}</span></div>`)
      .join('');
    const back = styledButton('←  Back');
    back.addEventListener('click', () => onBack());
    this.card.append(rows, back);
    this.open();
  }

  showSettings(currentSeed: number, currentSpeed: number, liveModel: boolean, a: SettingsActions): void {
    this.card.innerHTML = '';
    this.card.appendChild(this.title('Settings', 'tunables for a fresh run'));

    const seedRow = document.createElement('div');
    Object.assign(seedRow.style, { display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 12px' });
    const seedInput = document.createElement('input');
    seedInput.type = 'number'; seedInput.value = String(currentSeed);
    Object.assign(seedInput.style, {
      flex: '1', background: '#10101e', color: '#eee', border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: '6px', padding: '8px', font: '13px monospace',
    } as Partial<CSSStyleDeclaration>);
    const seedLabel = document.createElement('span');
    seedLabel.textContent = 'Seed'; seedLabel.style.color = '#99a';
    seedRow.append(seedLabel, seedInput);

    const aiToggle = styledButton(`🧠  AI soul: ${liveModel ? 'Live model (Ollama)' : 'Stub (default)'}`);
    aiToggle.addEventListener('click', () => { a.onToggleLive(); this.showSettings(currentSeed, currentSpeed, !liveModel, a); });

    const note = document.createElement('div');
    note.innerHTML = `Starting speed is the bottom slider (now ${currentSpeed}/s). A new seed or AI change needs a restart.` +
      (liveModel ? '<br><span style="color:#c9a">Live mode needs a local Ollama server running.</span>' : '');
    Object.assign(note.style, { color: '#9ab', fontSize: '12px', margin: '10px 2px 14px', lineHeight: '1.6' });

    const apply = styledButton('↻  Apply & restart', true);
    const back = styledButton('←  Back');
    apply.addEventListener('click', () => a.onApply(Math.floor(Number(seedInput.value)) || currentSeed));
    back.addEventListener('click', () => a.onBack());

    this.card.append(seedRow, aiToggle, note, apply, back);
    this.open();
  }
}

export interface SettingsActions {
  onApply: (seed: number) => void;
  onToggleLive: () => void;
  onBack: () => void;
}
