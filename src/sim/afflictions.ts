// Specific afflictions (M30 slice 1) — the *effects* side of the affliction model. Each kind carries
// a real mechanical consequence: a maimed leg slows movement; a lost eye / crippled arm sap DEX / STR
// (so a battered veteran fights worse); the frailty of age slows & weakens the old; a chronic illness
// lingers and halves recovery. Code-defined (the modifiers are mechanical, not flavour); herbal
// remedies + treatment are content/code in M30 s2. Helpers are pure reads + a lazy attach — no RNG,
// so wounds & ageing are deterministic and replay-safe.
import type { World, EntityId } from './ecs.ts';
import { C_AFFLICTIONS } from './components.ts';
import type { Afflictions, AfflictionKind } from './components.ts';

interface Fx { str?: number; dex?: number; slow?: boolean; recovery?: number; label: string; }
const FX: Record<AfflictionKind, Fx> = {
  maimed_leg:      { slow: true, label: 'a maimed leg' },
  lost_eye:        { dex: -3, label: 'a lost eye' },
  maimed_arm:      { str: -3, label: 'a crippled arm' },
  infirmity:       { slow: true, str: -2, dex: -2, label: 'the frailty of age' },
  chronic_illness: { recovery: 0.5, label: 'a chronic illness' },
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
