// The legibility lens (M7 slice 5, hotkey G): the player *sees* how language and
// culture have evolved — the family trees of tongues and cultures, living vs lost,
// member counts, and a **sample name in each tongue from the same key** so the sound
// drift is audible down the tree (D27 — the verisimilitude machinery, made visible).
import type { World } from '../sim/ecs.ts';
import { C_AGENT } from '../sim/components.ts';
import type { Agent } from '../sim/components.ts';
import { getLanguageStore } from '../lang/languageStore.ts';
import type { RuntimeLanguage } from '../lang/languageStore.ts';
import { getCultureStore } from '../culture/cultureStore.ts';
import type { RuntimeCulture } from '../culture/cultureStore.ts';
import { personalName } from '../lang/language.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

const SAMPLE_KEY = 'avatar';  // a fixed key — every tongue names "the same person", so drift shows

export class LineagesDashboard extends ModalPanel {
  constructor() { super('Lineages of tongues & cultures', '600px'); }

  toggle(world: World): void { if (this.visible) this.hide(); else { this.reveal(); this.render(world); } }
  refresh(world: World): void { if (this.visible) this.render(world); }
  update(world: World): void { this.render(world); }

  private render(world: World): void {
    const lstore = getLanguageStore(world);
    const cstore = getCultureStore(world);
    if (!lstore || !cstore) { this.body.innerHTML = '<div style="color:#778">no lineages yet</div>'; return; }

    const members = new Map<string, number>();
    for (const e of world.query(C_AGENT)) {
      const cid = world.getComponent<Agent>(e, C_AGENT)!.cultureId;
      if (cid) members.set(cid, (members.get(cid) ?? 0) + 1);
    }
    const speakers = new Map<string, number>();
    for (const c of Object.values(cstore.byId)) {
      speakers.set(c.language, (speakers.get(c.language) ?? 0) + (members.get(c.id) ?? 0));
    }

    const langRow = (l: RuntimeLanguage, depth: number): string => {
      const sp = speakers.get(l.id) ?? 0;
      const lost = l.extinct ? ' <span style="color:#c98">· lost</span>' : '';
      return `<div style="padding:3px 0 3px ${12 + depth * 18}px;color:${l.extinct ? '#889' : '#dde'}">
        <span style="color:#e6b0ff">◆</span> <b>${l.name}</b>${lost}
        <span style="color:#889"> · ${sp} speak it · “${personalName(l, SAMPLE_KEY)}”</span></div>`;
    };
    const cultRow = (c: RuntimeCulture, depth: number): string => {
      const m = members.get(c.id) ?? 0;
      const lost = c.extinct ? ' <span style="color:#c98">· lost</span>' : '';
      return `<div style="padding:3px 0 3px ${12 + depth * 18}px;color:${c.extinct ? '#889' : '#dde'}">
        <span style="color:#9fd0a0">❧</span> <b>${c.name}</b>${lost}
        <span style="color:#889"> · ${m} folk · communal ${Math.round(c.values.communal * 100)}% · martial ${Math.round(c.values.martial * 100)}%</span></div>`;
    };

    const tree = <T extends { id: string; parent?: string }>(
      all: T[], row: (n: T, d: number) => string,
    ): string => {
      const byParent = new Map<string | null, T[]>();
      for (const n of all) {
        const p = n.parent && all.some(x => x.id === n.parent) ? n.parent : null;
        (byParent.get(p) ?? byParent.set(p, []).get(p)!).push(n);
      }
      for (const list of byParent.values()) list.sort((a, b) => a.id.localeCompare(b.id));
      const walk = (n: T, d: number): string =>
        row(n, d) + (byParent.get(n.id) ?? []).map(c => walk(c, d + 1)).join('');
      return (byParent.get(null) ?? []).map(r => walk(r, 0)).join('');
    };

    this.body.innerHTML =
      `<div style="${SECTION}">Tongues — the language family tree</div>
       <div style="color:#778;margin:-2px 0 4px 12px">the same name in each, so you can hear the drift</div>
       ${tree(Object.values(lstore.byId), langRow)}
       <div style="${SECTION}">Cultures — who descends from whom</div>
       ${tree(Object.values(cstore.byId), cultRow)}`;
  }
}
