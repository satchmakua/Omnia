// Drives the capability layer for the rare aptitude-gifted agents: regenerates
// their mana, and lets them cast to meet their own needs (conjure a meal when
// hungry, mend their vigour when tired) instead of foraging or sleeping. Casting
// is naturally throttled by slow mana regen, so magic stays occasional.
import type { World } from '../ecs.ts';
import { C_MAGIC, C_NEEDS, C_AGENT } from '../components.ts';
import type { Magic, Needs, Agent } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import { invokeCapability } from '../../capability/invoke.ts';
import { emitEvent } from '../../history/eventlog.ts';

export function runCapabilitySystem(world: World, cfg: SimConfig, content: Content): void {
  const conjureMeal = content.capabilities.get('conjure_meal');
  const mendVigor   = content.capabilities.get('mend_vigor');

  for (const e of world.query(C_MAGIC, C_NEEDS)) {
    const magic = world.getComponent<Magic>(e, C_MAGIC)!;
    const needs = world.getComponent<Needs>(e, C_NEEDS)!;

    // Regenerate mana.
    if (magic.mana < magic.maxMana) {
      magic.mana = Math.min(magic.maxMana, magic.mana + magic.manaRegenPerTick);
    }

    // Cast to cover an urgent need if affordable (one cast per tick at most).
    const ctx = { needs, magic };
    const name = () => world.getComponent<Agent>(e, C_AGENT)?.name ?? 'A mage';
    if (conjureMeal && needs.hunger < cfg.actionThreshold) {
      if (invokeCapability(conjureMeal, ctx)) { emitEvent(world, 'magic', `${name()} conjured a meal.`); continue; }
    }
    if (mendVigor && needs.energy < cfg.actionThreshold) {
      if (invokeCapability(mendVigor, ctx)) emitEvent(world, 'magic', `${name()} mended their vigour.`);
    }
  }
}
