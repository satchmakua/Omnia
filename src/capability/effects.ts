// The CODE side of the data/behaviour boundary (CONTENT_AND_DATA Rule 2).
// Content declares which effect *tags* a capability produces; this file
// implements what each tag actually does. Adding a new tag in YAML without a
// matching implementation here is a load-time error (see loader.ts).
import type { Needs } from '../sim/components.ts';

export interface EffectContext {
  needs: Needs;   // the acting agent's needs
  power: number;  // magnitude supplied by the capability (and clamped by the caller)
}

export type EffectFn = (ctx: EffectContext) => void;

export const EFFECT_TAGS: Record<string, EffectFn> = {
  // Restore hunger by `power`, clamped to the [0,1] need range.
  restore_hunger: (ctx) => {
    ctx.needs.hunger = Math.min(1, ctx.needs.hunger + ctx.power);
  },
  // Restore energy/vigour by `power`, clamped to [0,1].
  restore_energy: (ctx) => {
    ctx.needs.energy = Math.min(1, ctx.needs.energy + ctx.power);
  },
};

export function isKnownEffectTag(tag: string): boolean {
  return Object.prototype.hasOwnProperty.call(EFFECT_TAGS, tag);
}
