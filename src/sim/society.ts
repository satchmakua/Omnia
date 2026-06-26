// Social standing & class (M14's deferred class/reputation thread). "Standing" is a 0..1
// reputation derived from a soul's deeds and means — leadership, landholding, valour, and
// wealth lift it; infamy (crime) and ruin (debt) sink it. It is the simple, durable-state
// reading the M14 note called for (a fuller pairwise reputation *graph* remains a later
// refinement). Class is a label read off standing + role; standing also warms how readily
// others seek one's company (D26). Pure functions — no RNG, no state.

export interface StandingInputs {
  gold: number;
  debt: number;
  kills: number;       // foes slain (Combat) — valour
  homesOwned: number;  // ≥2 ⇒ a landlord
  crimes: number;      // weighted rap sheet (theft 1, assault 2, murder 5) — infamy
  isLeader: boolean;   // heads a tribe
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

// Esteem in the community, centred on 0.5 for an ordinary soul. Bounded [0,1].
export function computeStanding(o: StandingInputs): number {
  let s = 0.5;
  if (o.isLeader) s += 0.25;                            // a chief is looked up to
  if (o.homesOwned >= 2) s += 0.15;                     // landed — a man of property
  s += Math.min(0.2, o.kills * 0.03);                  // valour (capped)
  s += Math.min(0.2, Math.max(0, o.gold) / 1000);      // means (gold 200 ⇒ +0.2)
  s -= Math.min(0.45, o.crimes * 0.09);                // infamy
  if (o.debt > 0) s -= 0.15;                            // ruin
  return clamp01(s);
}

// A weighted rap-sheet score for the infamy term (a murderer is far more notorious than a thief).
export function crimeWeight(thefts: number, assaults: number, murders: number): number {
  return thefts + assaults * 2 + murders * 5;
}

// The social class label: a tier read off standing, plus a role tag. Outlaws are outcasts
// regardless of means; a chief or landlord wears the role.
export function socialClassOf(standing: number, isOutlaw: boolean, isLeader: boolean, isLandlord: boolean): string {
  if (isOutlaw) return 'outcast';
  const role = isLeader ? ' · chief' : isLandlord ? ' · landlord' : '';
  const tier = standing >= 0.75 ? 'notable'
    : standing >= 0.6 ? 'respected'
    : standing >= 0.4 ? 'commoner'
    : 'lowly';
  return tier + role;
}

// Esteem warms company (D26): folk are drawn to the well-regarded, cooler toward the disgraced.
// Centred so an average pair (~0.5) is unchanged; bounded [0.8, 1.2].
export function standingWarmth(sa: number, sb: number): number {
  return Math.max(0.8, Math.min(1.2, 0.8 + 0.4 * ((sa + sb) / 2)));
}
