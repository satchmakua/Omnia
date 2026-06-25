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

// A founder's alignment: baseline neutral-leaning-good with a small innate lean on each axis.
export function rollAlignment(rng: RNG): Alignment {
  return { good: clampPN(0.1 + (rng() * 2 - 1) * 0.3), law: clampPN((rng() * 2 - 1) * 0.3) };
}

// A child inherits the parental lean (+ variation) on both axes.
export function inheritAlignment(rng: RNG, a: Alignment, b: Alignment): Alignment {
  return {
    good: clampPN((a.good + b.good) / 2 + (rng() * 2 - 1) * 0.2),
    law: clampPN((a.law + b.law) / 2 + (rng() * 2 - 1) * 0.2),
  };
}

// The classic 3×3 grid name (Lawful Good … Chaotic Evil; True Neutral at the centre).
export function alignmentName(al: Alignment): string {
  const g = al.good > 0.33 ? 'Good' : al.good < -0.33 ? 'Evil' : 'Neutral';
  const l = al.law > 0.33 ? 'Lawful' : al.law < -0.33 ? 'Chaotic' : 'Neutral';
  return g === 'Neutral' && l === 'Neutral' ? 'True Neutral' : `${l} ${g}`;
}

// Good folk cooperate — they warm to others faster; the wicked, slower (D26). Centred on
// neutral (0) so it's a no-op for the average soul; bounded. (Crime/violence come with M16.)
export function alignmentWarmth(goodA: number, goodB: number): number {
  return Math.max(0.7, Math.min(1.3, 1 + 0.2 * ((goodA + goodB) / 2)));
}

// ── Personality (M13) ──────────────────────────────────────────────────────────────
// A weighted palette of archetypes. A few have behavioural homes today (the goal factor
// below); the rest are flavour with homes in later milestones (combat/crime, M16).
const TRAITS: readonly (readonly [string, number])[] = [
  ['ambitious', 2], ['content', 2], ['curious', 2], ['loyal', 2], ['gentle', 2], ['gregarious', 2],
  ['solitary', 1], ['brave', 1], ['hot-headed', 1], ['greedy', 1], ['generous', 1],
];

export function rollPersonality(rng: RNG): Personality {
  const total = TRAITS.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [t, w] of TRAITS) { r -= w; if (r < 0) return { trait: t }; }
  return { trait: TRAITS[0][0] };
}

// A child usually takes after one parent, but may strike out with a fresh trait.
export function inheritPersonality(rng: RNG, a: Personality, b: Personality): Personality {
  const r = rng();
  if (r < 0.33) return { trait: a.trait };
  if (r < 0.66) return { trait: b.trait };
  return rollPersonality(rng);
}

// Personality bends the wealth goal (D26): the ambitious/greedy strive past where others
// rest; the content/generous want less. (Extends the purpose-driven goal bend in ActionSystem.)
export function traitGoalFactor(trait: string): number {
  if (trait === 'ambitious' || trait === 'greedy') return 1.3;
  if (trait === 'content' || trait === 'generous') return 0.78;
  return 1;
}
