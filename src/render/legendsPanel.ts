// The Legends view (M6 item 3), toggled with the 'C' key. Two halves, per the
// design's "fidelity ∝ importance × recency": first the **Chronicle** read as a
// story (recent legends sharp, ancient ages compressed to one-liners), then the
// **statistical strata** — the forgotten in aggregate — as small lo-fi charts.
// Read-only: it only reads sim state (sim/render separation holds).
import type { World } from '../sim/ecs.ts';
import { C_CHRONICLE, C_WORLDSTATS, C_CLOCK, C_ACHIEVEMENTS, C_FIGURES, C_AGENT, C_TOMBSTONE } from '../sim/components.ts';
import type { Clock, AchievementsData, FiguresData, Agent, Tombstone } from '../sim/components.ts';
import { chronicleRecent } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';
import type { WorldStatsData, StatSample } from '../history/stats.ts';
import { defaultConfig, ticksPerYear } from '../sim/config.ts';
import { measureWorld } from '../analysis/metrics.ts';
import type { WorldMetrics } from '../analysis/metrics.ts';

const TPY = ticksPerYear(defaultConfig);
const yearOf = (tick: number) => Math.floor(tick / TPY);

const CAUSE_COLOR: Record<string, string> = {
  'old age': '#8fe0a0', illness: '#ff9a6a', 'an accident': '#c9a0ff', starvation: '#caa86a',
  murdered: '#ff5a5a', 'fell in battle': '#ff6a6a', 'struck down for their crimes': '#ff8a4a',
  'killed while attacking': '#ff8a4a',
};

// A tiny lo-fi sparkline over a series of numbers.
function sparkline(values: number[], color: string, w = 220, h = 34): string {
  if (values.length === 0) return '<div style="color:#667">— no data yet —</div>';
  let min = Infinity, max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  const range = (max - min) || 1;
  const n = values.length;
  const pts = values
    .map((v, i) => `${((i / Math.max(1, n - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ');
  return `<svg width="${w}" height="${h}" style="display:block">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"
      stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function chart(label: string, latest: string, values: number[], color: string): string {
  return `<div style="margin:8px 0">
    <div style="display:flex;justify-content:space-between;color:#aab">
      <span>${label}</span><span style="color:${color}">${latest}</span></div>
    ${sparkline(values, color)}</div>`;
}

export class LegendsPanel {
  private readonly contentEl = document.createElement('div');

  /** The content element, hosted as a tab by the master view (M10). */
  get content(): HTMLElement { return this.contentEl; }
  update(world: World): void { this.render(world); }

  private get<T>(world: World, comp: string): T | undefined {
    const ents = world.query(comp);
    return ents.length ? world.getComponent<T>(ents[0], comp) : undefined;
  }

  render(world: World): void {
    const chronicle = this.get<ChronicleData>(world, C_CHRONICLE);
    const stats = this.get<WorldStatsData>(world, C_WORLDSTATS);
    const clock = this.get<Clock>(world, C_CLOCK);
    const year = clock ? yearOf(clock.tick) : 0;

    this.contentEl.innerHTML =
      `<div style="color:#99a;margin-bottom:12px">the town's history, in year ${year}</div>
       ${this.figuresHtml(world)}
       ${this.dynastiesHtml(world)}
       ${this.achievementsHtml(world)}
       ${this.chronicleHtml(chronicle)}
       ${this.strataHtml(stats)}
       ${this.scienceHtml(world)}`;
  }

  // Historical figures (M20): the souls the world remembers, newest legend first. The living
  // are shown bright; the dead carry "(late)".
  private figuresHtml(world: World): string {
    const data = this.get<FiguresData>(world, C_FIGURES);
    if (!data || data.figures.length === 0) return '';
    const rows = [...data.figures].reverse().slice(0, 24).map(f => {
      const alive = world.hasComponent(f.id, C_AGENT);
      return `<div style="margin:2px 0">
        <span style="color:${alive ? '#ffe0a0' : '#bdb0c8'}">${f.name} <b>${f.epithet}</b></span>
        <span style="color:#9ab">— ${f.basis}</span>${alive ? '' : ' <span style="color:#778;font-size:11px">(late)</span>'}
        <span style="color:#677;font-size:11px">· yr ${yearOf(f.enshrinedTick)}</span></div>`;
    }).join('');
    return `<div style="color:#ffd08a;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:6px 0 4px">Figures of legend <span style="color:#789">(${data.figures.length})</span></div>${rows}<hr style="border-color:rgba(255,255,255,0.08);margin:12px 0">`;
  }

  // Dynasties (M20): the great surname-lines, by how many souls (living + buried) they've
  // numbered — the families the town is built from.
  private dynastiesHtml(world: World): string {
    const surnameOf = (name: string): string => name.trim().split(/\s+/).slice(-1)[0] ?? '';
    const living = new Map<string, number>();
    const total = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      const s = a.surname ?? surnameOf(a.name);
      if (!s) continue;
      living.set(s, (living.get(s) ?? 0) + 1);
      total.set(s, (total.get(s) ?? 0) + 1);
    }
    for (const e of world.query(C_TOMBSTONE)) {
      const s = surnameOf(world.getComponent<Tombstone>(e, C_TOMBSTONE)!.name);
      if (s) total.set(s, (total.get(s) ?? 0) + 1);
    }
    // Figures per surname (a dynasty that has bred legends).
    const figs = this.get<FiguresData>(world, C_FIGURES);
    const figBySurname = new Map<string, number>();
    if (figs) for (const f of figs.figures) { const s = surnameOf(f.name); if (s) figBySurname.set(s, (figBySurname.get(s) ?? 0) + 1); }

    const houses = [...total.entries()].filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (houses.length === 0) return '';
    const rows = houses.map(([s, n]) => {
      const liv = living.get(s) ?? 0;
      const nf = figBySurname.get(s) ?? 0;
      return `<div style="margin:2px 0">
        <span style="color:#cfe0ff">the ${s} clan</span>
        <span style="color:#9ab">— ${liv} living of ${n} all told</span>${nf ? ` <span style="color:#ffd08a;font-size:11px">· ${nf} ${nf === 1 ? 'legend' : 'legends'}</span>` : ''}</div>`;
    }).join('');
    return `<div style="color:#bcd4ff;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:6px 0 4px">Great clans <span style="color:#789">(by bloodline)</span></div>${rows}<hr style="border-color:rgba(255,255,255,0.08);margin:12px 0">`;
  }

  // Achievements (M17 s4): the milestones the town has reached, newest first.
  private achievementsHtml(world: World): string {
    const data = this.get<AchievementsData>(world, C_ACHIEVEMENTS);
    if (!data || data.unlocked.length === 0) return '';
    const rows = [...data.unlocked].reverse().map(a =>
      `<div style="margin:2px 0"><span style="color:#ffd66a">🏆 ${a.name}</span>${a.detail ? ` <span style="color:#9ab">— ${a.detail}</span>` : ''} <span style="color:#677;font-size:11px">· yr ${yearOf(a.tick)}</span></div>`).join('');
    return `<div style="color:#9a9ac0;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:6px 0 4px">Achievements <span style="color:#789">(${data.unlocked.length})</span></div>${rows}<hr style="border-color:rgba(255,255,255,0.08);margin:12px 0">`;
  }

  // Emergent structure (M7.7, D29): the same measurements `npm run soak` prints,
  // surfaced live so the player can *see* the patterns the world produces — not just
  // read history, but read its shape. A pure read of state (`measureWorld`).
  private scienceHtml(world: World): string {
    const m: WorldMetrics = measureWorld(world, defaultConfig);
    if (m.ages.count === 0) return '';

    // Each article carries a plain-language line: what it is and why it matters.
    const row = (label: string, value: string, desc: string, note = ''): string =>
      `<div style="margin:8px 0">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <span style="color:#aab">${label}</span>
          <span style="color:#cfe;text-align:right">${value}${note ? ` <span style="color:#778">${note}</span>` : ''}</span>
        </div>
        <div style="color:#7c7c90;font-size:11px;line-height:1.45;margin-top:2px">${desc}</div>
      </div>`;

    const sw = m.social.smallWorldSigma;
    const swNote = sw >= 1 ? 'small-world' : sw > 0 ? 'dense/clustered' : '';
    const surn = m.surnameZipf;
    const zipfNote = surn.exponent > 0.6 && surn.r2 > 0.6 ? "≈ Zipf's law" : '';
    const fam = m.family;

    // Life-orientation (vows): the most common aim + whether the town leans hopeful/weary.
    const vows = m.vows;
    const topVow = Object.entries(vows.counts).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/^to /, '');
    const mood = vows.meanDrive > 0.05 ? 'leans hopeful' : vows.meanDrive < -0.05 ? 'leans weary' : 'steady';

    // Cultural mixing: turn the homophily index into words.
    const mi = m.mating;
    const mixWord = mi.index > 0.15 ? 'cultures stay apart' : mi.index < -0.05 ? 'actively mixing' : 'blending freely';

    const oc = m.occupation;

    return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
      <div style="color:#9fd6ff;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin-bottom:4px">Emergent structure</div>
      ${row('Wealth inequality (Gini)', m.wealthGini.toFixed(2),
        'How evenly money is spread across everyone. 0 means everyone has the same amount; 1 means a single person has it all. Most real societies sit somewhere in between.')}
      ${row('Wealth — how top-heavy', m.wealthTail.alpha > 0 ? m.wealthTail.alpha.toFixed(2) : '—',
        'Looks only at the richest folk and how lopsided the very top is. A lower number means wealth is piled into a tiny handful; higher means even the rich are fairly close to one another.',
        m.wealthTail.alpha > 0 ? `r²=${m.wealthTail.r2.toFixed(2)}` : '')}
      ${row('Friendships per person', m.social.avgDegree.toFixed(1),
        "The average number of friends and partners each person has. “Clustering” is how often your friends are also friends with each other — higher means tight-knit circles.",
        `clustering ${m.social.clustering.toFixed(2)}`)}
      ${row('Small-world σ', sw > 0 ? sw.toFixed(2) : '—',
        "Whether everyone is linked through a short chain of friends — the “six degrees of separation” idea. Above 1 means people form close groups yet can still reach almost anyone in a few hops.",
        swNote)}
      ${row('Last-name spread', surn.exponent.toFixed(2),
        'Whether last names behave like real family names: a few are very common and most are rare. This pattern shows up on its own when names get handed down from parent to child over many generations.',
        `r²=${surn.r2.toFixed(2)} ${zipfNote}`)}
      ${row('First-name spread', m.givenZipf.exponent.toFixed(2),
        "First names are made up fresh for each baby instead of being inherited, so no single name ever takes over. It’s shown next to last names as a comparison — to reveal what passing names down actually does.",
        'flat')}
      ${fam ? row('Language family tree', `${fam.living} spoken / ${fam.extinct} lost`,
        'The family tree of the world’s languages: how many are still spoken versus died out, how many generations the oldest line runs, and how many new tongues ever split off from a single parent.',
        `depth ${fam.maxDepth}, breadth ${fam.maxBreadth}`) : ''}
      ${row('What people live for', vows.withVow > 0 && topVow ? `“${topVow}”` : '—',
        "Across the whole town, the guiding aim each adult has settled on from the life they’ve led — to provide for loved ones, to make something of themselves, to play it safe after hard loss, or to take each day as it comes. The mood shows whether the town leans hopeful or worn-down overall.",
        vows.withVow > 0 ? mood : 'no vows settled yet')}
      ${row('Family dynasties', `${Math.round(m.dynasty.largestShare * 100)}% in the biggest line`,
        'Whether a few big families have come to dominate the bloodline. It’s the share of living people who all trace back to the same family name. A high number means one or two lines dominate; low means many separate families coexist.',
        `${m.dynasty.lines} lines · Gini ${m.dynasty.gini.toFixed(2)}`)}
      ${row('Cultural mixing', mi.pairs > 0 ? `${mi.index >= 0 ? '+' : ''}${mi.index.toFixed(2)}` : '—',
        "Whether people tend to marry inside their own culture or across cultures. It compares who actually pairs up to what you’d see if matches were random. Higher means cultures stay separate; near zero means they’re freely blending.",
        mi.pairs > 0 ? `${Math.round(mi.sameCultureFraction * 100)}% marry within · ${mixWord}` : '')}
      ${row('Variety of work', oc.workers > 0 ? oc.evenness.toFixed(2) : '—',
        'How varied the town’s jobs are. Low means almost everyone does the same work; high means work is spread across many different trades. A quick read on how complex the local economy has grown.',
        oc.workers > 0 ? `${oc.professions} trades · top ${Math.round(oc.topShare * 100)}%` : '')}`;
  }

  private chronicleHtml(c: ChronicleData | undefined): string {
    if (!c) return '';
    const recent = chronicleRecent(c, 40).map(e => {
      const when = e.tick === 0 ? 'long ago' : `year ${yearOf(e.tick)}`;
      return `<div style="margin:5px 0;padding-left:10px;border-left:2px solid rgba(255,210,120,0.5)">
        <span style="color:#889">${when}</span> — ${e.text}</div>`;
    }).join('');

    // Ancient eras, most-recent age first; these read as faded one-line legends.
    const eras = [...c.eras].reverse().map(era => {
      const span = `years ${yearOf(era.fromTick)}–${yearOf(era.toTick)}`;
      return `<div style="margin:5px 0;padding-left:10px;border-left:2px solid rgba(150,150,200,0.35);color:#aab">
        <span style="color:#778">${span}</span> — ${era.text}</div>`;
    }).join('');

    const erasBlock = eras
      ? `<div style="color:#9a9ac0;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin:14px 0 4px">Ages past</div>${eras}`
      : '';

    return `<div style="color:#ffd278;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin-bottom:4px">The Chronicle</div>
      ${recent || '<div style="color:#778">No legends recorded yet.</div>'}
      ${erasBlock}`;
  }

  private strataHtml(s: WorldStatsData | undefined): string {
    if (!s || s.samples.length === 0) {
      return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
        <div style="color:#778">No town records yet — they accrue over the years.</div>`;
    }
    const v = (pick: (x: StatSample) => number) => s.samples.map(pick);
    const last = s.samples[s.samples.length - 1];

    const causeTotal = Object.values(s.causeOfDeath).reduce((a, b) => a + b, 0);
    const causeRows = Object.entries(s.causeOfDeath)
      .sort((a, b) => b[1] - a[1])
      .map(([cause, n]) => {
        const pct = causeTotal ? Math.round((n / causeTotal) * 100) : 0;
        const col = CAUSE_COLOR[cause] ?? '#99a';
        return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
          <span style="width:90px;color:#aab">${cause}</span>
          <span style="flex:1;background:rgba(255,255,255,0.06);border-radius:3px">
            <span style="display:block;width:${pct}%;height:10px;background:${col};border-radius:3px"></span></span>
          <span style="width:54px;text-align:right;color:#889">${n} · ${pct}%</span></div>`;
      }).join('');

    return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
      <div style="color:#ffd278;text-transform:uppercase;font-size:11px;letter-spacing:1px;margin-bottom:4px">The town in numbers</div>
      ${chart('Population', String(last.population), v(x => x.population), '#8fe88f')}
      ${chart('Median wealth', `${Math.round(last.medianWealth)}g`, v(x => x.medianWealth), '#ffd24a')}
      ${chart('Inequality (Gini)', last.gini.toFixed(2), v(x => x.gini), '#ff9ad0')}
      ${chart('Born / died (total)', `${last.births} / ${last.deaths}`, v(x => x.births), '#8fe0a0')}
      <div style="color:#aab;margin:10px 0 2px">Causes of death</div>
      ${causeRows || '<div style="color:#778">none yet</div>'}`;
  }
}
