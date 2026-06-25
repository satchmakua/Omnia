// Per-agent language fluency (M10 slice 4) — language made a real mechanic, not just
// flavour on names. An agent is natively fluent (1.0) in their culture's tongue and can
// LEARN others a little at a time through contact. Two speakers' *mutual intelligibility*
// — the best tongue they both command — causally gates how readily their company warms
// into friendship (D26), and rises as they pick up each other's language. Like the rest
// of the culture/language couplings these are pure, deterministic functions (no RNG, no
// LLM), so seed-replay holds and measuring/using them never perturbs the trajectory.

export type Fluency = Record<string, number>;  // languageId → 0..1 command of that tongue

// A founder/newborn starts natively fluent in one tongue (their culture's language).
export function nativeFluency(languageId: string | undefined): Fluency {
  return languageId ? { [languageId]: 1 } : {};
}

// How well two speakers understand each other: the strongest tongue they BOTH command
// (max over shared languages of the *weaker* speaker's fluency in it). 0 ⇒ no common
// tongue at all. When either side has no fluency recorded — an agent with no culture,
// as in some unit tests — we treat them as fully intelligible (1) so the coupling is a
// no-op there and old behaviour is preserved.
export function intelligibility(a: Fluency | undefined, b: Fluency | undefined): number {
  if (!a || !b) return 1;
  const ak = Object.keys(a);
  if (ak.length === 0 || Object.keys(b).length === 0) return 1;
  let best = 0;
  for (const lang of ak) {
    const fb = b[lang];
    if (fb !== undefined) best = Math.max(best, Math.min(a[lang], fb));
  }
  return best;
}

// The synergy multiplier on how fast company warms into friendship: speakers who fully
// share a tongue bond at the base rate (×1); strangers with no common tongue still bond,
// but slowly (floored at `floor`). Linear in intelligibility between `floor` and 1.
export function langSynergy(intel: number, floor: number): number {
  return floor + (1 - floor) * intel;
}

// Learn a little of another tongue through contact: bounded growth toward fluency 1
// (diminishing returns — never reaches or exceeds 1). Mutates the map in place; a no-op
// for an unknown tongue or one's own native tongue (already at 1).
export function learnTongue(f: Fluency, languageId: string | undefined, rate: number): void {
  if (!languageId) return;
  const cur = f[languageId] ?? 0;
  f[languageId] = cur + rate * (1 - cur);
}
