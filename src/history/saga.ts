// The world-history generator (M20 s2c): the "ages of civilization" saga. A pure read of the
// durable record — the ages climbed (achievements), the souls who passed into legend (figures),
// the wars fought (org war-log), the relics forged & lost (artifacts), the clans that died out
// (ruins), and the living present — woven into readable prose. No RNG, no mutation: the same
// state always tells the same story. Rendered in the Legends view.
import type { World } from '../sim/ecs.ts';
import {
  C_ACHIEVEMENTS, C_FIGURES, C_ARTIFACTS, C_CLOCK, C_AGENT, C_RUIN,
} from '../sim/components.ts';
import type {
  AchievementsData, FiguresData, ArtifactsData, Clock, Ruin,
} from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';
import { ticksPerYear } from '../sim/config.ts';
import { getOrgStore } from '../org/orgStore.ts';

const ERA_NAMES = ['Tribal Age', 'Tribal Age', 'Bronze Age', 'Iron Age', 'Medieval Age', 'Industrial Age', 'Modern Age', 'Sci-Fi Age'];

export interface SagaSection { heading: string; text: string; }

function get<T>(world: World, comp: string): T | undefined {
  const ents = world.query(comp);
  return ents.length ? world.getComponent<T>(ents[0], comp) : undefined;
}
const list = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

// Compose the saga from the current durable state. Sections with nothing to say are omitted.
export function worldHistory(world: World, cfg: SimConfig): SagaSection[] {
  const tpy = ticksPerYear(cfg);
  const yr = (tick: number): number => Math.floor(tick / tpy);
  const now = get<Clock>(world, C_CLOCK)?.tick ?? 0;
  const pop = world.query(C_AGENT).length;
  const store = getOrgStore(world);
  const clans = store ? Object.values(store.byId) : [];
  const living = clans.filter(c => !c.extinct);
  const sections: SagaSection[] = [];

  // ── Founding ──
  const founders = clans.filter(c => (c.founded ?? 0) === 0);
  if (founders.length > 0) {
    sections.push({ heading: 'The Founding', text:
      `In the ruins of the fallen world, the town began as ${founders.length} ${founders.length === 1 ? 'clan' : 'clans'} — ${list(founders.map(c => c.name))}. From these few lines all that followed descends.` });
  }

  // ── The ages climbed (from the age achievements) ──
  const ach = get<AchievementsData>(world, C_ACHIEVEMENTS)?.unlocked ?? [];
  const ages = ach.filter(a => a.id.startsWith('age_')).sort((x, y) => x.tick - y.tick);
  const curTier = living.reduce((m, c) => Math.max(m, c.tier ?? 1), 1);
  const curAge = ERA_NAMES[curTier] ?? 'Tribal Age';
  if (ages.length > 0) {
    const climbs = ages.map(a => `${a.name.replace(/^Reach the /, '')} (yr ${yr(a.tick)})`);
    sections.push({ heading: 'The Ages of Civilization', text:
      `From the Tribal Age the town climbed the ladder of lost arts — reaching ${list(climbs)}. It stands now in the ${curAge}.` });
  } else {
    sections.push({ heading: 'The Ages of Civilization', text: `The town endures in the ${curAge}, its arts still those of its founders.` });
  }

  // ── Heroes & tyrants (figures) ──
  const figs = get<FiguresData>(world, C_FIGURES)?.figures ?? [];
  if (figs.length > 0) {
    const named = [...figs].sort((a, b) => a.enshrinedTick - b.enshrinedTick).slice(0, 6)
      .map(f => `${f.name} ${f.epithet} (${f.basis})`);
    sections.push({ heading: 'Those Who Passed into Legend', text:
      `${figs.length} ${figs.length === 1 ? 'soul' : 'souls'} are remembered: ${list(named)}.` });
  }

  // ── Wars ──
  const warLog = store?.warLog ?? [];
  if (warLog.length > 0) {
    const name = (id: string): string => store!.byId[id]?.name ?? 'a lost clan';
    const decisive = warLog.filter(w => w.winner).slice(-3)
      .map(w => `${name(w.winner!)} broke ${name(w.winner === w.a ? w.b : w.a)} (yr ${yr(w.ended)})`);
    sections.push({ heading: 'Wars & Strife', text:
      `${warLog.length} ${warLog.length === 1 ? 'war has' : 'wars have'} been waged between the clans${decisive.length ? `. In the end, ${list(decisive)}` : ', each ending in an uneasy peace'}.` });
  }

  // ── Relics ──
  const arts = get<ArtifactsData>(world, C_ARTIFACTS)?.artifacts ?? [];
  if (arts.length > 0) {
    const lost = arts.filter(a => a.lost).length;
    const redisc = arts.filter(a => a.rediscoveredTick).length;
    const borne = arts.filter(a => !a.lost && !a.rediscoveredTick).slice(0, 4).map(a => a.name);
    sections.push({ heading: 'Relics of the Masters', text:
      `Its master smiths forged ${arts.length} ${arts.length === 1 ? 'work' : 'works'} of legend${borne.length ? ` — among them ${list(borne)}` : ''}.` +
      (lost > 0 ? ` ${lost} ${lost === 1 ? 'lies' : 'lie'} lost to history${redisc > 0 ? `, though ${redisc} ${redisc === 1 ? 'has' : 'have'} since been unearthed` : ''}.` : '') });
  }

  // ── Fallen clans & ruins ──
  const fallen = clans.filter(c => c.extinct);
  const discovered = world.query(C_RUIN).filter(e => world.getComponent<Ruin>(e, C_RUIN)!.discovered).length;
  if (fallen.length > 0) {
    sections.push({ heading: 'The Fallen', text:
      `${fallen.length} ${fallen.length === 1 ? 'clan has' : 'clans have'} died out — ${list(fallen.slice(-4).map(c => c.name))} among them${discovered > 0 ? `, their ruins (${discovered} now uncovered) dotting the land` : ''}.` });
  }

  // ── The present ──
  sections.push({ heading: 'The Present Day', text:
    `Today, in year ${yr(now)}, ${pop} ${pop === 1 ? 'soul' : 'souls'} of ${living.length} living ${living.length === 1 ? 'clan' : 'clans'} carry the story on, in the ${curAge}.` });

  return sections;
}
