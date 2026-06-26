// Historical figures (M20): the world remembers its notable people. A soul that crosses a
// threshold of deed or renown is enshrined once — with an epithet and the basis for it — and
// kept after death, so legends are referenced for generations. The store is bounded (the
// oldest dead figures prune when it overgrows). The epithet logic is a pure function of an
// agent's durable record, so it's deterministic and testable.
import type { FiguresData, HistoricalFigure } from '../sim/components.ts';

export function createFigures(): FiguresData {
  return { figures: [] };
}

// The facts an agent's epithet is read from (gathered by LegendSystem from its components).
export interface FigureStats {
  murders: number;       // Crime rap sheet
  kills: number;         // foes slain (Combat)
  mastery: number;       // magic mastery (Magic)
  school?: string;       // magic school name (for the basis)
  isLeader: boolean;     // heads a tribe
  tribeName?: string;
  ageYears: number;
  lifespanYears: number;
  children: number;      // living + dead offspring (Lineage)
  standing: number;      // social standing (0..1)
}

// The epithet a soul has earned, or null if they're not (yet) the stuff of legend. Checked in
// priority order — the most striking deed wins. Thresholds keep figures a meaningful minority.
export function epithetFor(s: FigureStats): { epithet: string; basis: string } | null {
  if (s.murders >= 3) return { epithet: 'the Cruel', basis: `${s.murders} murders` };
  if (s.kills >= 8) return { epithet: 'the Slayer', basis: `slew ${s.kills} foes` };
  if (s.mastery >= 4) return { epithet: 'the Archmage', basis: s.school ? `a master of ${s.school.toLowerCase()}` : 'a master of magic' };
  if (s.isLeader && s.ageYears >= 55) return { epithet: 'the Wise', basis: s.tribeName ? `led the ${s.tribeName}` : 'a venerable chief' };
  if (s.lifespanYears > 0 && s.ageYears >= s.lifespanYears * 0.92) return { epithet: 'the Elder', basis: `lived ${Math.floor(s.ageYears)} years` };
  if (s.children >= 5) return { epithet: 'the Progenitor', basis: `${s.children} children` };
  if (s.standing >= 0.85) return { epithet: 'the Renowned', basis: 'a soul of great standing' };
  return null;
}

// Bound the store: once over `cap`, drop the oldest figures whose subject is dead (passed in
// as a predicate). The living and the recently-enshrined are kept.
export function pruneFigures(data: FiguresData, cap: number, isDead: (id: number) => boolean): void {
  if (data.figures.length <= cap) return;
  const dead = data.figures
    .filter(f => isDead(f.id))
    .sort((a, b) => a.enshrinedTick - b.enshrinedTick);
  for (const f of dead) {
    if (data.figures.length <= cap) break;
    const i = data.figures.indexOf(f);
    if (i >= 0) data.figures.splice(i, 1);
  }
}

export function isEnshrined(data: FiguresData, id: number): boolean {
  for (const f of data.figures) if (f.id === id) return true;
  return false;
}

export function enshrine(data: FiguresData, fig: HistoricalFigure): void {
  data.figures.push(fig);
}
