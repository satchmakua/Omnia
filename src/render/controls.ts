// A small playback bar: a play/pause button and a speed slider (ticks per second).
// Purely presentational — it changes how often the loop advances the sim in real
// time, never the simulation logic. 0 ticks/s = paused.
export class SpeedControl {
  private readonly bar: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private readonly readout: HTMLSpanElement;
  private speed: number;
  private lastNonZero: number;

  constructor(initial: number, private readonly onChange: (speed: number) => void) {
    this.speed = initial;
    this.lastNonZero = initial > 0 ? initial : 6;

    this.bar = document.createElement('div');
    Object.assign(this.bar.style, {
      position: 'fixed', bottom: '14px', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: '12px',
      background: 'rgba(10,10,26,0.9)', color: '#dde',
      font: '12px monospace', padding: '8px 14px', borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.12)', zIndex: '5', userSelect: 'none',
    });

    this.button = document.createElement('button');
    Object.assign(this.button.style, {
      background: '#2a2a44', color: '#eee', border: 'none', cursor: 'pointer',
      width: '30px', height: '26px', borderRadius: '5px', fontSize: '13px',
    });
    this.button.addEventListener('click', () => this.togglePause());

    const label = document.createElement('span');
    label.textContent = 'Speed';
    label.style.color = '#99a';

    // The slider position is 0..100; speed maps EXPONENTIALLY to 1..1000 ticks/s, so
    // there's fine control when watching closely AND ~1 sim-year/second at the top.
    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.step = '1';
    this.slider.style.width = '200px';
    this.slider.style.cursor = 'pointer';
    this.slider.addEventListener('input', () => this.setSpeed(speedFromPos(Number(this.slider.value))));

    this.readout = document.createElement('span');
    this.readout.style.minWidth = '70px';

    this.bar.append(this.button, label, this.slider, this.readout);
    document.body.appendChild(this.bar);

    this.refresh();
  }

  /** Current playback speed in ticks per second (0 = paused). */
  get value(): number { return this.speed; }

  setSpeed(v: number): void {
    this.speed = Math.max(0, v);
    if (this.speed > 0) this.lastNonZero = this.speed;
    this.refresh();
    this.onChange(this.speed);
  }

  togglePause(): void {
    this.setSpeed(this.speed > 0 ? 0 : this.lastNonZero);
  }

  private refresh(): void {
    this.slider.value = String(posFromSpeed(this.speed));
    this.button.textContent = this.speed > 0 ? '⏸' : '▶';
    this.readout.textContent = this.speed > 0 ? `${this.speed} ticks/s` : 'Paused';
    this.readout.style.color = this.speed > 0 ? '#dde' : '#f9a';
  }
}

// Exponential map between the 0..100 slider position and 1..1000 ticks/s.
const MAX_SPEED = 1000;
function speedFromPos(pos: number): number {
  if (pos <= 0) return 0;
  return Math.round(Math.pow(MAX_SPEED, (pos - 1) / 99));
}
function posFromSpeed(speed: number): number {
  if (speed <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round(1 + 99 * Math.log(speed) / Math.log(MAX_SPEED))));
}
