// The Chronicle: the town's tiered legend log (SIMULATION_MODEL Mechanism 3).
// Only above-threshold (notable) events are recorded, and like agent memory it is
// itself tiered: recent legends are kept sharp (`entries`); ancient ones compress
// into one-line **eras** (`eras`), where the truly significant events stay named
// and the ordinary ones dissolve into a tally. Bounded by construction. Stored as
// a singleton component so the sim owns it.

export interface ChronicleEntry {
  tick: number;        // sim tick the event was recorded (0 = pre-history/backstory)
  importance: number;  // 0..1; only notable events belong here
  text: string;
  kind?: string;       // 'founding' | 'birth' | 'death' | 'marriage' | … (for era tallies)
}

// A compressed age: many old entries downsampled to one legend line.
export interface ChronicleEra {
  fromTick: number;
  toTick: number;
  text: string;
  importance: number;  // max importance folded in (keeps notable ages sharp through merges)
}

export interface ChronicleData {
  entries: ChronicleEntry[];
  eras: ChronicleEra[];
}

export function createChronicle(): ChronicleData {
  return { entries: [], eras: [] };
}

// Record a notable event. Below-threshold events are dropped (the Chronicle is for
// legends, not the daily ticker — that's the EventLog). Default keeps everything,
// so unit tests and callers that pre-filter are unaffected.
export function chronicleAdd(c: ChronicleData, entry: ChronicleEntry, minImportance = -Infinity): void {
  if (entry.importance < minImportance) return;
  c.entries.push(entry);
}

// Most recent first.
export function chronicleRecent(c: ChronicleData, n: number): ChronicleEntry[] {
  return c.entries.slice(-n).reverse();
}

function pluralKind(kind: string, n: number): string {
  const word = kind === 'birth' ? 'birth' : kind === 'death' ? 'death'
    : kind === 'marriage' ? 'wedding' : 'event';
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// Compress a block of old entries into one era: the most significant events keep
// their words; the ordinary ones dissolve into a tally by kind.
export function summarizeEra(block: ChronicleEntry[], legendImportance: number): ChronicleEra {
  const legends = block.filter(e => e.importance >= legendImportance).map(e => e.text);
  const ordinary = block.filter(e => e.importance < legendImportance);

  const byKind = new Map<string, number>();
  for (const e of ordinary) {
    const k = e.kind ?? 'event';
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  const tally = [...byKind.entries()].map(([k, n]) => pluralKind(k, n)).join(', ');

  const parts = [...legends];
  if (tally) parts.push(`and ${tally} besides`);
  const text = parts.join('; ') || `${block.length} faded moments`;

  return {
    fromTick: block[0].tick,
    toTick: block[block.length - 1].tick,
    text,
    importance: block.reduce((m, e) => Math.max(m, e.importance), 0),
  };
}

// Merge two adjacent eras (a older than b) into a coarser one — the more notable
// age keeps its words; the lesser blurs to its span (the downsampling of deep time).
function mergeEras(a: ChronicleEra, b: ChronicleEra): ChronicleEra {
  return {
    fromTick: Math.min(a.fromTick, b.fromTick),
    toTick: Math.max(a.toTick, b.toTick),
    text: a.importance >= b.importance ? a.text : b.text,
    importance: Math.max(a.importance, b.importance),
  };
}

// One tiering pass: if the detailed log has overgrown, roll its oldest entries down
// into an era and bound the era list by merging the oldest. Pure; returns whether
// anything changed. Mirrors agent-memory consolidation.
export function consolidateChronicle(
  c: ChronicleData, recentCap: number, retain: number, legendImportance: number, maxEras: number,
): boolean {
  if (c.entries.length <= recentCap) return false;
  const block = c.entries.splice(0, c.entries.length - retain);
  c.eras.push(summarizeEra(block, legendImportance));
  while (c.eras.length > maxEras) {
    const merged = mergeEras(c.eras[0], c.eras[1]);
    c.eras.splice(0, 2, merged);
  }
  return true;
}
