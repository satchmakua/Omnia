// The Language lens (M10 slice 4.5, hotkey N): the tongues themselves, made legible.
// The Lineages tab (G) shows the family *tree* of tongues & cultures; this one shows what
// each living tongue actually *sounds* like — its phoneme inventory, syllable structure,
// and freshly-coined sample names so you can hear the drift — plus who speaks it and how
// far slice-4 bilingualism has spread. A pure read of the language/culture stores + agents.
import type { World } from '../sim/ecs.ts';
import { C_AGENT } from '../sim/components.ts';
import type { Agent } from '../sim/components.ts';
import { getLanguageStore } from '../lang/languageStore.ts';
import type { RuntimeLanguage } from '../lang/languageStore.ts';
import { getCultureStore } from '../culture/cultureStore.ts';
import type { CultureStoreData } from '../culture/cultureStore.ts';
import { personalName, word } from '../lang/language.ts';
import { linguisticDiversity } from '../analysis/metrics.ts';
import { ModalPanel, SECTION } from './modalPanel.ts';

interface Speakers { native: number; learned: number; }

export class LanguageDashboard extends ModalPanel {
  constructor() { super('Language', '620px'); }

  update(world: World): void {
    const lstore = getLanguageStore(world);
    if (!lstore) { this.body.innerHTML = `<div style="color:#778">No tongues loaded.</div>`; return; }
    const cstore = getCultureStore(world);
    const speakers = this.countSpeakers(world, cstore);
    const nameOf = (id: string) => lstore.byId[id]?.name ?? id;   // descent shown by pretty name

    const langs = Object.values(lstore.byId);
    const living = langs.filter(l => !l.extinct)
      .sort((a, b) => this.total(speakers, b.id) - this.total(speakers, a.id));
    const lost = langs.filter(l => l.extinct);

    this.body.innerHTML =
      this.summaryHtml(world) +
      living.map(l => this.tongueHtml(l, cstore, speakers, nameOf)).join('') +
      this.lostHtml(lost, nameOf);
  }

  private total(s: Map<string, Speakers>, id: string): number {
    const t = s.get(id); return t ? t.native + t.learned : 0;
  }

  // Per-tongue speaker counts: native (their culture's tongue) vs learned-to-fluency.
  private countSpeakers(world: World, cstore: CultureStoreData | undefined): Map<string, Speakers> {
    const by = new Map<string, Speakers>();
    const get = (id: string) => { let t = by.get(id); if (!t) { t = { native: 0, learned: 0 }; by.set(id, t); } return t; };
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      if (!a.fluency) continue;
      const nativeLang = a.cultureId && cstore ? cstore.byId[a.cultureId]?.language : undefined;
      for (const [lang, f] of Object.entries(a.fluency)) {
        if (lang === nativeLang) get(lang).native++;
        else if (f >= 0.5) get(lang).learned++;   // conversational in a non-native tongue
      }
    }
    return by;
  }

  private summaryHtml(world: World): string {
    const l = linguisticDiversity(world);
    const intro =
      `<div style="color:#8b8b9e;font-size:11px;line-height:1.5;margin-bottom:8px">
        Each tongue's sounds and structure, with sample names coined from it — as a tongue drifts,
        its names drift too. Folk learn the tongues of those they live beside, so a common tongue
        (the “lingua franca”) tends to emerge over the generations.</div>`;
    const summary =
      `<div style="display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px">
        <span style="color:#bcd">${l.tongues} living tongue${l.tongues === 1 ? '' : 's'}</span>
        <span style="color:#9fd0c0">${Math.round(l.bilingualFraction * 100)}% bilingual</span>
        <span style="color:#aab">${l.meanTongues.toFixed(2)} tongues/head</span>
        <span style="color:#ffd27a">lingua franca: ${l.linguaFranca ?? '—'} (${Math.round(l.francaShare * 100)}% command)</span>
      </div>`;
    return intro + summary;
  }

  private tongueHtml(
    l: RuntimeLanguage, cstore: CultureStoreData | undefined,
    speakers: Map<string, Speakers>, nameOf: (id: string) => string,
  ): string {
    const sp = speakers.get(l.id) ?? { native: 0, learned: 0 };
    const parent = l.parent ? `<span style="color:#889"> ⟵ ${nameOf(l.parent)}</span>` : '';
    const cultures = cstore
      ? Object.values(cstore.byId).filter(c => c.language === l.id && !c.extinct).map(c => c.name)
      : [];
    const speakerLine =
      `<span style="color:#bcd">${sp.native} native</span>` +
      (sp.learned ? ` · <span style="color:#9fd0c0">${sp.learned} learned</span>` : '');
    // Sample names + words coined deterministically from this (possibly drifted) tongue.
    const samples = [personalName(l, 'sample-1'), personalName(l, 'sample-2'), personalName(l, 'sample-3')];
    const words = [word(l, 'lex-1'), word(l, 'lex-2')];
    return `<hr style="border-color:rgba(255,255,255,0.1);margin:12px 0">
      <div style="font-weight:bold;color:#fff">${l.name}${parent}</div>
      <div style="margin:2px 0">${speakerLine}${cultures.length ? ` <span style="color:#889">· ${cultures.join(', ')}</span>` : ''}</div>
      <div style="color:#9ab;margin-top:4px">Consonants <span style="color:#cdd">${l.phonemes.consonants.join(' ')}</span></div>
      <div style="color:#9ab">Vowels <span style="color:#cdd">${l.phonemes.vowels.join(' ')}</span></div>
      <div style="color:#9ab">Syllables <span style="color:#cdd">${l.syllableShapes.join(', ')}</span></div>
      <div style="color:#9ab;margin-top:4px">Sounds like <span style="color:#dde">${samples.join(', ')}</span> <span style="color:#889">(${words.join(', ')})</span></div>`;
  }

  private lostHtml(lost: RuntimeLanguage[], nameOf: (id: string) => string): string {
    if (lost.length === 0) return '';
    const body = lost.map(l =>
      `<div style="color:#889;margin:2px 0">† ${l.name}${l.parent ? ` <span style="color:#677">⟵ ${nameOf(l.parent)}</span>` : ''}</div>`).join('');
    return `<hr style="border-color:rgba(255,255,255,0.1);margin:14px 0">
      <div style="${SECTION}">Lost tongues <span style="color:#677">(no living speakers)</span></div>${body}`;
  }
}
