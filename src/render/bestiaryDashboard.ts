// The Bestiary / Wildlife lens (M22, hotkey B): a catalogue of every living thing the world can
// hold — the sapient races, the wild animals, and the rare monsters & uncanny visitors — each with
// its icon, its live count, and **when it was last witnessed**. The point is the rare ones: a
// dragon or vampire may roam for only a few days every many sim-years, so you'd miss it live — the
// bestiary remembers that it came, and when. A pure read of sim state (sim/render separation holds);
// `observe()` is called every frame from the loop so "last seen" stays current even while the tab
// is closed (and even at fast-forward — monsters persist for days, far longer than a frame).
import type { World } from '../sim/ecs.ts';
import { C_AGENT, C_SPECIES, C_FAUNA, C_FISH, C_SPECIAL, C_CLOCK } from '../sim/components.ts';
import type { SpeciesComp, Fauna, Special, Clock } from '../sim/components.ts';
import type { Content } from '../content/loader.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';
import { CATEGORY_COLOR } from './icons.ts';
import type { Category } from './icons.ts';
import { glyphHtml } from './skin.ts';
import { defaultConfig } from '../sim/config.ts';

type Cat = 'race' | 'animal' | 'monster';
interface Entry { cat: Cat; key: string; name: string; iconKey: Category; color: string; desc?: string; emojiKey?: string; }

export class BestiaryDashboard extends ModalPanel {
  private readonly catalog: Entry[] = [];
  private readonly seen = new Map<string, number>();   // entry key → tick it was last present
  private readonly peak = new Map<string, number>();   // entry key → largest count ever observed
  private live = new Map<string, number>();            // entry key → current count

  constructor(content: Content) {
    super('Bestiary', '600px');
    for (const s of content.species.all()) {
      this.catalog.push({ cat: 'race', key: 'r:' + s.id, name: s.name, iconKey: 'folk', color: s.color, desc: `${s.size} folk` });
    }
    for (const f of content.fauna.all()) {
      this.catalog.push({ cat: 'animal', key: 'a:' + f.id, name: f.name, iconKey: 'animal', color: f.color, desc: f.diet === 'predator' ? 'a predator' : 'a grazer', emojiKey: f.id });
    }
    this.catalog.push({ cat: 'animal', key: 'fish', name: 'Fish', iconKey: 'fish', color: CATEGORY_COLOR.fish, desc: 'aquatic — netted for food' });
    for (const m of content.monsters.all()) {
      const col = (CATEGORY_COLOR as Record<string, string>)[m.icon] ?? CATEGORY_COLOR.monster;
      this.catalog.push({ cat: 'monster', key: 'm:' + m.id, name: m.name, iconKey: m.icon as Category, color: col, desc: m.behavior === 'haunt' ? 'a haunt — draws no blood' : m.aquatic ? 'a sea-beast' : 'a predator' });
    }
  }

  /** Tally what's abroad and stamp "last seen" — call every frame, regardless of tab visibility. */
  observe(world: World): void {
    const tick = this.tickOf(world);
    this.live = this.tally(world);
    for (const [k, c] of this.live) if (c > 0) {
      this.seen.set(k, tick);
      this.peak.set(k, Math.max(this.peak.get(k) ?? 0, c));
    }
  }

  update(world: World): void { this.observe(world); this.render(world); }

  private tickOf(world: World): number {
    const ce = world.query(C_CLOCK);
    return ce.length ? world.getComponent<Clock>(ce[0], C_CLOCK)!.tick : 0;
  }

  private tally(world: World): Map<string, number> {
    const m = new Map<string, number>();
    const bump = (k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    for (const e of world.query(C_AGENT, C_SPECIES)) bump('r:' + world.getComponent<SpeciesComp>(e, C_SPECIES)!.id);
    for (const e of world.query(C_FAUNA)) bump('a:' + world.getComponent<Fauna>(e, C_FAUNA)!.speciesId);
    for (const e of world.query(C_FISH)) bump('fish');
    for (const e of world.query(C_SPECIAL)) {
      const s = world.getComponent<Special>(e, C_SPECIAL)!;
      if (s.behavior !== 'guardian') bump('m:' + s.kind);   // conjured guardians aren't wild creatures
    }
    return m;
  }

  private yearOf(tick: number): number {
    return Math.floor(tick / (defaultConfig.ticksPerDay * defaultConfig.daysPerYear));
  }

  private iconSvg(key: Category, color: string, emojiKey?: string): string {
    return `<span style="display:inline-block;vertical-align:middle">${glyphHtml(key, color, 24, 1, emojiKey)}</span>`;
  }

  // present (by count) → witnessed (by recency) → never seen.
  private rank(e: Entry): [number, number] {
    const live = this.live.get(e.key) ?? 0;
    if (live > 0) return [2, live];
    const last = this.seen.get(e.key);
    return last !== undefined ? [1, last] : [0, 0];
  }

  private rowHtml(e: Entry): string {
    const live = this.live.get(e.key) ?? 0;
    const last = this.seen.get(e.key);
    const peak = this.peak.get(e.key) ?? 0;
    let status: string;
    if (live > 0) status = `<span style="color:#8fe88f">×${live} abroad now</span>`;
    else if (last !== undefined) status = `<span style="color:#c9b27a">last seen yr ${this.yearOf(last)}</span>${peak > 1 ? `<span style="color:#778"> · peak ×${peak}</span>` : ''}`;
    else status = `<span style="color:#667">not yet witnessed</span>`;
    return `<div style="display:flex;align-items:center;gap:9px;margin:2px 0;padding:1px 0">
      <span style="width:24px;height:24px;flex:0 0 auto">${this.iconSvg(e.iconKey, e.color, e.emojiKey)}</span>
      <span style="flex:1;color:${live > 0 ? '#cdd' : '#99a'}">${e.name}${e.desc ? ` <span style="color:#778;font-size:10.5px">— ${e.desc}</span>` : ''}</span>
      <span style="text-align:right;white-space:nowrap">${status}</span></div>`;
  }

  private sectionHtml(title: string, intro: string, cat: Cat): string {
    const rows = this.catalog.filter(e => e.cat === cat)
      .sort((a, b) => { const ra = this.rank(a), rb = this.rank(b); return rb[0] - ra[0] || rb[1] - ra[1]; })
      .map(e => this.rowHtml(e)).join('');
    return `<div style="${SECTION}">${title}</div>
      <div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:6px">${intro}</div>${rows}`;
  }

  private render(world: World): void {
    const tally = (cat: Cat) => {
      const es = this.catalog.filter(e => e.cat === cat);
      const present = es.filter(e => (this.live.get(e.key) ?? 0) > 0).length;
      const witnessed = es.filter(e => this.seen.has(e.key)).length;
      return { total: es.length, present, witnessed };
    };
    const r = tally('race'), a = tally('animal'), m = tally('monster');
    const summary = `<div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px;color:#aab">
      <span><b style="color:#e6d29a">${r.present}</b>/${r.total} races abroad</span>
      <span><b style="color:#dd8f54">${a.present}</b>/${a.total} animals abroad</span>
      <span><b style="color:#d06b6b">${m.witnessed}</b>/${m.total} monster kinds witnessed</span></div>`;

    this.body.innerHTML = summary +
      this.sectionHtml('Folk — the sapient races', 'The peoples of the world. Count is how many live right now; a race can dwindle to nothing and be remembered here.', 'race') +
      `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">` +
      this.sectionHtml('Beasts — the wild animals', 'The fauna of the food web (grazers and the predators that hunt them) and the fish of the waters.', 'animal') +
      `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">` +
      this.sectionHtml('Monsters & visitors — the rare & uncanny', 'These roam only briefly, once in a long while — if you never caught one live, the bestiary still records that it came, and the year it was last seen.', 'monster');
  }
}
