// Craft quality (M33 slice 1, D-DF). A crafted good is only as fine as the hand that made it: a
// novice turns out shoddy work, a master a masterwork. Quality is fixed at the moment of crafting
// (from the crafter's skill) — it doesn't improve as the smith later grows — and it scales the good's
// trade **value** and, for arms, its **combat power**. Six tiers, plain (the mid-skill norm) at ×1 so
// only the unusually poor or fine gear shifts the balance. Deterministic — derived purely from skill.
export const QUALITY_NAMES = ['shoddy', 'poor', 'plain', 'fine', 'superior', 'masterwork'] as const;
export const MASTERWORK = QUALITY_NAMES.length - 1;   // the top tier (5) — a thing worth remembering (M33 s2/s3)

// Two factors per tier, both **bonus-only**: a fine/superior/masterwork good is worth more and (for
// arms) hits/turns harder, while shoddy/poor/plain work is the journeyman baseline — no worse than the
// good's listed stats. Quality thus *enriches the skilled* without quietly cutting the common crafter's
// income or weakening the town's arms — which (a soak + predation finding) shifts the economy and the
// predator-prey balance off their tuned equilibria. Mastery is the reward; mediocrity isn't a penalty.
const VALUE_MULT = [1.0, 1.0, 1.0, 1.2, 1.45, 1.8];
const POWER_MULT = [1.0, 1.0, 1.0, 1.1, 1.25, 1.45];

// A crafter's skill (0..10) → the quality tier (0..5) of what they make right now. Calibrated to the
// skill the town actually reaches: most hands make plain work, the practised turn out fine/superior,
// and only a true master (skill ≥ 8, the rare deep-time grandmaster) leaves a masterwork.
export function qualityFromSkill(skill: number): number {
  if (skill < 1.5) return 0;   // shoddy
  if (skill < 3) return 1;     // poor
  if (skill < 4.5) return 2;   // plain
  if (skill < 6) return 3;     // fine
  if (skill < 8) return 4;     // superior
  return 5;                    // masterwork
}

export const qualityValueMultiplier = (tier: number): number => VALUE_MULT[clampTier(tier)];   // trade worth
export const qualityPowerMultiplier = (tier: number): number => POWER_MULT[clampTier(tier)];   // combat power (bonus-only)
export const qualityName = (tier: number): string => QUALITY_NAMES[clampTier(tier)];
export const isMasterwork = (tier: number): boolean => tier >= MASTERWORK;

function clampTier(t: number): number { return Math.max(0, Math.min(MASTERWORK, Math.round(t))); }
