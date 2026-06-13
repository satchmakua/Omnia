// The Chronicle: an append-only log of notable, above-threshold events — the
// seed of the eventual "Legends" view (SIMULATION_MODEL Mechanism 3). In M2 it
// holds the world's invented backstory; later milestones append births, deaths,
// foundings, feuds. Stored as a singleton component so the sim owns it.

export interface ChronicleEntry {
  tick: number;        // sim tick the event was recorded (0 = pre-history/backstory)
  importance: number;  // 0..1; only notable events belong here
  text: string;
}

export interface ChronicleData {
  entries: ChronicleEntry[];
}

export function createChronicle(): ChronicleData {
  return { entries: [] };
}

export function chronicleAdd(c: ChronicleData, entry: ChronicleEntry): void {
  c.entries.push(entry);
}

// Most recent first.
export function chronicleRecent(c: ChronicleData, n: number): ChronicleEntry[] {
  return c.entries.slice(-n).reverse();
}
