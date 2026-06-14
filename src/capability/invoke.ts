import { EFFECT_TAGS } from './effects.ts';
import type { Capability } from '../content/schema.ts';
import type { Needs, Magic } from '../sim/components.ts';

// The unified capability engine: invoke → prerequisites → cost → effect
// (MAGIC_AND_TECHNOLOGY.md). One code path serves both traditions — technology
// and magic differ only in their data (aptitude gate, mana vs energy cost).
export interface InvokeContext {
  needs?: Needs;   // the acting agent's needs (effects/energy cost read this)
  magic?: Magic;   // present iff the agent has magic aptitude (mana cost reads this)
}

// Can this agent satisfy the capability's prerequisites and pay its cost right now?
export function canInvoke(cap: Capability, ctx: InvokeContext): boolean {
  if (cap.prerequisites.aptitude && !ctx.magic) return false;            // gate: aptitude
  if (cap.cost.mana > 0 && (!ctx.magic || ctx.magic.mana < cap.cost.mana)) return false;
  if (cap.cost.energy > 0 && (!ctx.needs || ctx.needs.energy < cap.cost.energy)) return false;
  return true;
}

/**
 * Attempt to invoke a capability: checks prerequisites + cost, pays the cost,
 * then applies every effect tag. Returns false (changing nothing) if the agent
 * can't meet the prerequisites or afford it. `powerOverride` lets a caller scale
 * the effect (e.g. a forage bite limited by available flora).
 */
export function invokeCapability(
  cap: Capability,
  ctx: InvokeContext,
  powerOverride?: number,
): boolean {
  if (!canInvoke(cap, ctx)) return false;

  if (cap.cost.mana > 0 && ctx.magic) ctx.magic.mana -= cap.cost.mana;
  if (cap.cost.energy > 0 && ctx.needs) ctx.needs.energy = Math.max(0, ctx.needs.energy - cap.cost.energy);

  const power = powerOverride ?? cap.power;
  for (const tag of cap.effects) {
    const fn = EFFECT_TAGS[tag];
    // Should never happen: the loader validates tags at startup. Defensive only.
    if (!fn) throw new Error(`Capability '${cap.id}' references unknown effect tag '${tag}'`);
    if (!ctx.needs) throw new Error(`Capability '${cap.id}' needs an agent context to apply '${tag}'`);
    fn({ needs: ctx.needs, power });
  }
  return true;
}
