// The one Heredity system (M13): how a `Body` (six ability scores + physical traits) is
// rolled for a founder and passed down to a child — the parental mean plus a little
// variation, so stats and looks visibly run in families (light-eyed parents → light-eyed
// children). Pure + deterministic via the seeded RNG. Ability scores feed later combat &
// skills (M16); CHA already warms friendship (`charismaWarmth`, D26).
import type { RNG } from './rng.ts';
import { rngInt, rngFloat } from './rng.ts';
import type { Species } from '../content/schema.ts';
import type { Body, Alignment, Personality } from './components.ts';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type Ability = typeof ABILITIES[number];
const clampScore = (x: number): number => Math.max(3, Math.min(18, Math.round(x)));
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const SIZE_HEIGHT: Record<string, number> = { small: 135, medium: 172, large: 230 };

const roll3d6 = (rng: RNG): number => rngInt(rng, 1, 6) + rngInt(rng, 1, 6) + rngInt(rng, 1, 6);

// A founder's body: 3d6 ability scores + species modifiers, height from size, random looks.
export function rollBody(rng: RNG, species: Species): Body {
  const mods = species.abilityMods as Partial<Record<Ability, number>>;
  const b = {} as Body;
  for (const a of ABILITIES) b[a] = clampScore(roll3d6(rng) + (mods[a] ?? 0));
  const h = SIZE_HEIGHT[species.size] ?? 172;
  b.heightCm = Math.round(rngFloat(rng, h * 0.9, h * 1.1));
  b.build = clamp01(rngFloat(rng, 0.2, 0.8));
  b.eye = rng();
  b.hair = rng();
  return b;
}

// A child's body: each trait is the parents' mean plus a little variation (regression to the
// pair, not a fresh roll), so children resemble their parents while still varying.
export function inheritBody(rng: RNG, a: Body, b: Body): Body {
  const child = {} as Body;
  for (const k of ABILITIES) child[k] = clampScore((a[k] + b[k]) / 2 + (rng() * 2 - 1) * 2.5);
  child.heightCm = Math.round((a.heightCm + b.heightCm) / 2 + (rng() * 2 - 1) * 8);
  child.build = clamp01((a.build + b.build) / 2 + (rng() * 2 - 1) * 0.12);
  child.eye = clamp01((a.eye + b.eye) / 2 + (rng() * 2 - 1) * 0.12);
  child.hair = clamp01((a.hair + b.hair) / 2 + (rng() * 2 - 1) * 0.12);
  return child;
}

// ── Display + one causal coupling ─────────────────────────────────────────────────
const EYE_NAMES = ['dark brown', 'brown', 'amber', 'hazel', 'grey', 'green', 'blue', 'pale blue'];
const HAIR_NAMES = ['black', 'dark brown', 'brown', 'auburn', 'red', 'blonde', 'ash', 'white'];
const pick = (names: string[], shade: number): string =>
  names[Math.min(names.length - 1, Math.floor(clamp01(shade) * names.length))];
export const eyeColour = (b: Body): string => pick(EYE_NAMES, b.eye);
export const hairColour = (b: Body): string => pick(HAIR_NAMES, b.hair);
export const buildWord = (b: Body): string => (b.build < 0.35 ? 'slight' : b.build > 0.65 ? 'stocky' : 'average');

// Charisma warms friendship (D26): the magnetic befriend a little faster, the charmless a
// little slower. Centred on the average score (~10.5) so a typical pair is unchanged; bounded.
export function charismaWarmth(chaA: number, chaB: number): number {
  return Math.max(0.7, Math.min(1.3, 1 + 0.02 * ((chaA + chaB) / 2 - 10.5)));
}

// ── Alignment (M13) ───────────────────────────────────────────────────────────────
const clampPN = (x: number): number => Math.max(-1, Math.min(1, x));

// A founder's alignment. The spread must be wide enough to actually populate the 9-grid:
// the old ±0.3 roll never crossed the ±0.33 naming threshold on `law` (so everyone read
// "True Neutral") and almost never reached Evil. This gives a benevolent lean on good —
// more saints than villains, but real villains exist — and a FULL lawful↔chaotic spread,
// so towns show the whole alignment chart (~1/3 True Neutral, the rest a real mix).
export function rollAlignment(rng: RNG): Alignment {
  return { good: clampPN(0.08 + (rng() * 2 - 1) * 0.55), law: clampPN((rng() * 2 - 1) * 0.6) };
}

// A child inherits the parental lean (+ variation) on both axes — enough variation that a
// lineage still spreads across the grid rather than collapsing to one cell.
export function inheritAlignment(rng: RNG, a: Alignment, b: Alignment): Alignment {
  return {
    good: clampPN((a.good + b.good) / 2 + (rng() * 2 - 1) * 0.25),
    law: clampPN((a.law + b.law) / 2 + (rng() * 2 - 1) * 0.3),
  };
}

// The classic 3×3 grid name (Lawful Good … Chaotic Evil; True Neutral at the centre).
export function alignmentName(al: Alignment): string {
  const g = al.good > 0.33 ? 'Good' : al.good < -0.33 ? 'Evil' : 'Neutral';
  const l = al.law > 0.33 ? 'Lawful' : al.law < -0.33 ? 'Chaotic' : 'Neutral';
  return g === 'Neutral' && l === 'Neutral' ? 'True Neutral' : `${l} ${g}`;
}

// Good folk cooperate — they warm to others faster; the wicked, slower (D26). Centred on
// neutral (0) so it's a no-op for the average soul; bounded.
export function alignmentWarmth(goodA: number, goodB: number): number {
  return Math.max(0.7, Math.min(1.3, 1 + 0.2 * ((goodA + goodB) / 2)));
}

// The law axis finally earns a behavioural home (D26): the chaotic offend on impulse more
// readily, the lawful restrain themselves — so a Chaotic Evil and a Lawful Evil behave
// differently, not just read differently. Centred on neutral (×1), bounded. (Lawful Evil
// still offends — just less impulsively.) Used by CrimeSystem to scale offend chance.
export function lawCrimeFactor(law: number): number {
  return Math.max(0.4, Math.min(1.6, 1 - law * 0.6));
}

// ── Personality (M13; multi-trait M28 s3) ────────────────────────────────────────────
// A weighted palette of archetypes. Each agent carries a small SET of traits (M28 s3): a
// `trait` (the dominant one — drives the established wealth-goal & crime couplings) plus
// secondary `traits` that shape the newer reactions (who they befriend, what lifts/sours
// their mood, how they bear hardship). Heritable; children draw from their parents' pool.
const TRAITS: readonly (readonly [string, number])[] = [
  ['ambitious', 2], ['content', 2], ['curious', 2], ['loyal', 2], ['gentle', 2], ['gregarious', 2],
  ['cheerful', 2], ['solitary', 1], ['brave', 1], ['hot-headed', 1], ['greedy', 1], ['generous', 1], ['nervous', 1],
];
const ALL_TRAITS: string[] = TRAITS.map(([t]) => t);

// Each trait's behavioural pulls (M28 s3). All optional → a trait with no entry is pure flavour.
// `goal`/`aggressive` are read off the DOMINANT trait (unchanged couplings); the rest aggregate
// over the whole set and feed the low-cost hooks (mood / breaks / friendship) so multi-trait folk
// never perturb the RNG-sensitive ecology (D32) — see MentalStateSystem's note.
const TRAIT_FX: Record<string, { moodBase?: number; breakFactor?: number; bond?: number; aggressive?: boolean; poorSensitive?: boolean; lonelySensitive?: boolean }> = {
  ambitious:   { aggressive: true, poorSensitive: true },
  greedy:      { poorSensitive: true },
  content:     { moodBase: 0.06, breakFactor: 0.6 },
  cheerful:    { moodBase: 0.10, breakFactor: 0.6 },      // a sunny disposition — happier & hard to break
  generous:    { moodBase: 0.03, bond: 0.08 },
  curious:     {},
  loyal:       { bond: 0.15 },                            // bonds deeply
  gentle:      { bond: 0.05 },
  gregarious:  { bond: 0.18, lonelySensitive: true },     // warms to all; wilts without kin
  solitary:    { bond: -0.18 },                           // slow to bond, content alone
  brave:       { breakFactor: 0.6, aggressive: true },    // steels against despair (but may rage)
  'hot-headed': { breakFactor: 1.4, aggressive: true },   // volatile — cracks & rages easily
  nervous:     { moodBase: -0.08, breakFactor: 1.7, lonelySensitive: true }, // anxious & fragile
};

// The agent's trait set — the full list, or just the dominant for pre-M28 fixtures/saves.
export function traitsOf(p: Personality | undefined): string[] {
  if (!p) return [];
  return p.traits && p.traits.length ? p.traits : [p.trait];
}
export function hasTrait(p: Personality | undefined, t: string): boolean {
  return traitsOf(p).includes(t);
}

// A deterministic float in [0,1) from (id, salt) — used to expand a primary trait into a SET
// without drawing from the sim RNG, so multi-trait folk add zero new draws to the shared stream.
function hashId(id: number, salt: number): number {
  let h = (Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt ^ 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

export function rollPersonality(rng: RNG): Personality {
  const total = TRAITS.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [t, w] of TRAITS) { r -= w; if (r < 0) return { trait: t }; }
  return { trait: TRAITS[0][0] };
}

// A child usually takes after one parent for its dominant trait, but may strike out fresh.
export function inheritPersonality(rng: RNG, a: Personality, b: Personality): Personality {
  const r = rng();
  if (r < 0.33) return { trait: a.trait };
  if (r < 0.66) return { trait: b.trait };
  return rollPersonality(rng);
}

// Expand a dominant trait into a 2–3 trait SET, deterministically by entity id (no RNG draw).
// Founders draw extras from the whole palette; children inherit from their parents' pooled traits.
export function expandPersonality(id: number, primary: string, pool?: string[]): Personality {
  const source = (pool && pool.length ? pool : ALL_TRAITS).filter((t, i, arr) => arr.indexOf(t) === i);
  const traits = [primary];
  const want = hashId(id, 1) < 0.45 ? 2 : 3;
  const candidates = source.filter(t => t !== primary);
  let k = 0;
  while (traits.length < want && candidates.length > 0) {
    const idx = Math.floor(hashId(id, 2 + k) * candidates.length) % candidates.length;
    traits.push(candidates.splice(idx, 1)[0]);
    k++;
  }
  return { trait: primary, traits };
}

// Personality bends the wealth goal (D26): the ambitious/greedy strive past where others rest;
// the content/generous want less. Read off the DOMINANT trait (unchanged from M13).
export function traitGoalFactor(trait: string): number {
  if (trait === 'ambitious' || trait === 'greedy') return 1.3;
  if (trait === 'content' || trait === 'generous') return 0.78;
  return 1;
}

// ── The new multi-trait hooks (M28 s3): friendship, mood, hardship ───────────────────
// Friendship warmth from a pair's traits: gregarious/loyal warm, solitary cools, and like
// minds (shared traits) click. Centred on 1 (neutral), bounded. Used by SocialSystem.
export function traitBondFactor(pa: Personality | undefined, pb: Personality | undefined): number {
  const ta = traitsOf(pa), tb = traitsOf(pb);
  let f = 1;
  for (const t of ta) f += TRAIT_FX[t]?.bond ?? 0;
  for (const t of tb) f += TRAIT_FX[t]?.bond ?? 0;
  f += ta.filter(t => tb.includes(t)).length * 0.10;   // shared traits → faster rapport
  return Math.max(0.6, Math.min(1.5, f));
}

// Mood-target delta from traits: a flat baseline pull (cheerful/content lift, nervous lowers)
// plus circumstance sensitivities (the ambitious chafe at debt; the gregarious wilt without kin).
export function traitMoodBias(p: Personality | undefined, ctx: { inDebt: boolean; noFamily: boolean }): number {
  let d = 0;
  for (const t of traitsOf(p)) {
    const fx = TRAIT_FX[t]; if (!fx) continue;
    d += fx.moodBase ?? 0;
    if (fx.poorSensitive && ctx.inDebt) d -= 0.08;
    if (fx.lonelySensitive && ctx.noFamily) d -= 0.08;
  }
  return d;
}

// Break-susceptibility multiplier from traits: the content/cheerful/brave resist, the
// hot-headed/nervous crack easily. Centred on 1, bounded. Used by MentalStateSystem.
export function traitBreakFactor(p: Personality | undefined): number {
  let f = 1;
  for (const t of traitsOf(p)) f *= TRAIT_FX[t]?.breakFactor ?? 1;
  return Math.max(0.3, Math.min(2.5, f));
}

// Disposed to rage rather than mope? Any aggressive trait in the set. Used by MentalStateSystem.
export function traitAggressive(p: Personality | undefined): boolean {
  return traitsOf(p).some(t => TRAIT_FX[t]?.aggressive);
}
