// Specific afflictions (M30 slice 1) — the *effects* side of the affliction model. Each kind carries
// a real mechanical consequence: a maimed leg slows movement; a lost eye / crippled arm sap DEX / STR
// (so a battered veteran fights worse); the frailty of age slows & weakens the old; a chronic illness
// lingers and halves recovery. Code-defined (the modifiers are mechanical, not flavour); herbal
// remedies + treatment are content/code in M30 s2. Helpers are pure reads + a lazy attach — no RNG,
// so wounds & ageing are deterministic and replay-safe.
import type { World, EntityId } from './ecs.ts';
import { C_AFFLICTIONS } from './components.ts';
import type { Afflictions, AfflictionKind } from './components.ts';

interface Fx { str?: number; dex?: number; slow?: boolean; recovery?: number; permanent?: boolean; mortality?: number; label: string; }
const FX: Record<AfflictionKind, Fx> = {
  // A lost eye, a crippled arm, a maimed leg and the frailty of age are *permanent* — disabilities
  // borne for life. A chronic illness is the one affliction a healer can draw out and cure (M30 s2).
  // `mortality` is an extra per-day death risk the affliction carries (M30 s3): a chronic illness can
  // prove fatal if never treated; old wounds make a body a little frailer. (Infirmity adds none — the
  // age-mortality ramp already kills the old, so loading it here would double-count.)
  maimed_leg:      { slow: true, permanent: true, mortality: 0.001, label: 'a maimed leg' },
  lost_eye:        { dex: -3, permanent: true, mortality: 0.001, label: 'a lost eye' },
  maimed_arm:      { str: -3, permanent: true, mortality: 0.001, label: 'a crippled arm' },
  infirmity:       { slow: true, str: -2, dex: -2, permanent: true, label: 'the frailty of age' },
  chronic_illness: { recovery: 0.5, mortality: 0.012, label: 'a chronic illness' },
};

const INJURIES: readonly AfflictionKind[] = ['maimed_leg', 'lost_eye', 'maimed_arm'];   // wounds combat can leave
const MAX_AFFLICTIONS = 4;   // a body can only bear so much before it simply fails

function hash(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}

// ── Reads (all take the component, or undefined = unafflicted) ──
export function abilityMod(af: Afflictions | undefined, ability: 'str' | 'dex'): number {
  if (!af) return 0;
  let m = 0;
  for (const a of af.list) m += FX[a.kind][ability] ?? 0;
  return m;
}
export const isSlowed = (af: Afflictions | undefined): boolean => !!af && af.list.some(a => FX[a.kind].slow);
export function recoveryFactor(af: Afflictions | undefined): number {
  let f = 1;
  if (af) for (const a of af.list) f *= FX[a.kind].recovery ?? 1;
  return f;
}
export const hasAffliction = (af: Afflictions | undefined, kind: AfflictionKind): boolean =>
  !!af && af.list.some(a => a.kind === kind);
export const afflictionLabels = (af: Afflictions | undefined): string[] =>
  af ? af.list.map(a => FX[a.kind].label) : [];
export const labelOf = (kind: AfflictionKind): string => FX[kind].label;
// Permanence (M30 s2): a disability is carried for life; a treatable affliction can be cured by care.
export const isPermanent = (kind: AfflictionKind): boolean => !!FX[kind].permanent;
export const isTreatableKind = (kind: AfflictionKind): boolean => !FX[kind].permanent;
export const isAfflictionKind = (s: string): s is AfflictionKind => s in FX;

// ── Writes ──
// Attach an affliction (lazily creating the component). Returns true if it's newly carried (so callers
// can announce it once); false if already present, or the body is already as broken as it can bear.
export function addAffliction(world: World, e: EntityId, kind: AfflictionKind, tick: number): boolean {
  let af = world.getComponent<Afflictions>(e, C_AFFLICTIONS);
  if (!af) { af = { list: [] }; world.addComponent<Afflictions>(e, C_AFFLICTIONS, af); }
  if (af.list.some(a => a.kind === kind) || af.list.length >= MAX_AFFLICTIONS) return false;
  af.list.push({ kind, sinceTick: tick });
  return true;
}

// Cure (remove) an affliction — a healer drew it out (M30 s2). Returns true if it was carried and
// is now gone; sheds the component once the body bears nothing more.
export function cureAffliction(world: World, e: EntityId, kind: AfflictionKind): boolean {
  const af = world.getComponent<Afflictions>(e, C_AFFLICTIONS);
  if (!af) return false;
  const i = af.list.findIndex(a => a.kind === kind);
  if (i < 0) return false;
  af.list.splice(i, 1);
  if (af.list.length === 0) world.removeComponent(e, C_AFFLICTIONS);
  return true;
}

// Deterministic recovery roll (no sim RNG → replay-safe): under a healer's care, a treatable
// affliction is cured on a given day with probability `chance`. Salted by kind so a soul's several
// afflictions don't all resolve on the very same day.
export function recoversUnderCare(e: EntityId, kind: AfflictionKind, day: number, chance: number): boolean {
  const salt = kind.length * 131 + kind.charCodeAt(0);
  return (hash(e, day * 257 + salt) % 100000) / 100000 < chance;
}

// Deterministic onset roll (no sim RNG): whether a sickness takes hold as a chronic condition. Used
// in the HealthSystem's illness branch, where the RNG draw for *falling ill* has already happened —
// this only decides whether that illness lingers, so the stream is untouched and replay holds.
export function chronicOnset(e: EntityId, tick: number, chance: number): boolean {
  return (hash(e, tick ^ 0x5bd1e995) % 100000) / 100000 < chance;
}

// ── Death on-ramps (M30 s3) ──
// The extra per-day death risk a body's afflictions carry — a chronic illness can kill if never
// treated; old wounds leave a body a little frailer. The HealthSystem folds this into mortality.
export function afflictionMortality(af: Afflictions | undefined): number {
  let m = 0;
  if (af) for (const a of af.list) m += FX[a.kind].mortality ?? 0;
  return m;
}
// When an affliction is what carried a soul off, the (fixed-keyset) cause to record. Chronic illness
// before old wounds before nothing (infirmity deaths stay "old age", handled by the age ramp).
export function afflictionDeathCause(af: Afflictions | undefined): string | null {
  if (!af) return null;
  if (af.list.some(a => a.kind === 'chronic_illness')) return 'a long illness';
  if (af.list.some(a => INJURIES.includes(a.kind))) return 'old wounds';
  return null;
}

// Scars become real disabilities (M30 s3): old wounds catch up with the battle-scarred. A heavily-
// scarred veteran may, on a given day, find an old wound left a lasting disability (deterministic,
// rare — `scars` salts & raises the odds via the caller). Returns the new injury's kind, or null.
export function oldWoundDisables(world: World, e: EntityId, tick: number, scars: number, chance: number): AfflictionKind | null {
  if ((hash(e, tick * 31 + scars) % 100000) / 100000 >= chance) return null;
  const kind = INJURIES[hash(e, tick + 0x51ed) % INJURIES.length];
  return addAffliction(world, e, kind, tick) ? kind : null;
}

// Surviving a *grievous* wound can cripple you. A maiming isn't a function of one big number — a
// beast simply can't hit hard enough to take a leg in a single swipe — it's what befalls a body
// beaten to the brink and left alive: a folk worn down then mauled below `grievousHealth` may rise
// from it permanently injured. Only a `chance` fraction do (the rest just bear the scar), rolled by a
// deterministic hash (no sim RNG) so the predator-prey equilibrium stays replay-identical. `tick`
// salts the roll and picks which limb; returns the new injury's kind (to announce), or null.
export function inflictWound(
  world: World, e: EntityId, tick: number, healthAfter: number, grievousHealth: number, chance: number,
): AfflictionKind | null {
  if (healthAfter <= 0 || healthAfter > grievousHealth) return null;   // unhurt, or slain outright — no maiming
  if ((hash(e, tick) % 100000) / 100000 >= chance) return null;        // most survive a grievous wound whole
  const kind = INJURIES[hash(e, tick + 0x9e37) % INJURIES.length];
  return addAffliction(world, e, kind, tick) ? kind : null;
}
