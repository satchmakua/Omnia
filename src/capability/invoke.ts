import { EFFECT_TAGS } from './effects.ts';
import type { EffectContext } from './effects.ts';
import type { Capability } from '../content/schema.ts';

// Run every effect tag a capability declares. `power` defaults to the
// capability's declared power but the caller may override it (e.g. a forage
// bite limited by how much food is actually present).
export function invokeCapability(
  cap: Capability,
  ctx: Omit<EffectContext, 'power'>,
  power: number = cap.power,
): void {
  for (const tag of cap.effects) {
    const fn = EFFECT_TAGS[tag];
    // Should never happen: the loader validates tags at startup. Defensive only.
    if (!fn) throw new Error(`Capability '${cap.id}' references unknown effect tag '${tag}'`);
    fn({ ...ctx, power });
  }
}
