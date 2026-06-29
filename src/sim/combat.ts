// Ability-score-driven combat (M16). A pure, deterministic exchange computed from the
// combatants' bodies (STR → damage, DEX → hit/dodge, CON → toughness), plus cultural
// martiality and a fighter's hardened prowess (scars/kills). Damage is in Health (0..1)
// units, so a blow simply lowers the target's health — wounds, and death at zero — reusing
// the existing health/mortality machinery. Used by hunting, crime (M16 s2), and war (M16 s3).
import type { RNG } from './rng.ts';
import type { World, EntityId } from './ecs.ts';
import { C_BODY, C_COMBAT, C_AGENT, C_EQUIPMENT, C_QUEST, C_WARD, C_ENCHANTMENT, C_AFFLICTIONS } from './components.ts';
import type { Body, Combat, Agent, Equipment, Quest, Ward, Enchantment, Afflictions } from './components.ts';
import { getCultureStore, getCulture } from '../culture/cultureStore.ts';
import { getOrgStore } from '../org/orgStore.ts';
import { abilityMod } from './afflictions.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export interface Combatant {
  str: number;
  dex: number;
  con: number;
  martial: number;   // 0..1 cultural martiality (a warlike people fight better)
  ferocity: number;  // personality lean: brave/hot-headed press the attack, timid/gentle hold back
  prowess: number;   // hardened by survived violence (scars + kills)
  arms?: number;     // the tribe's military tech level (bronze/iron/engineering/machining) — better weapons & armour (M17 s2)
  weapon?: number;   // a carried/crafted weapon's power (M23 s3) — keener blows
  armour?: number;   // carried/crafted armour's power (M23 s3) — turns blows aside
}

// Probability the attacker lands a blow: an even chance, nudged by the DEX gap, martial
// skill, battle-hardened prowess, and the edge of better arms.
export function hitChance(atk: Combatant, def: Combatant): number {
  return clamp(
    0.55 + (atk.dex - def.dex) * 0.05 + (atk.martial - 0.5) * 0.2 + atk.prowess * 0.02
      + ((atk.arms ?? 0) - (def.arms ?? 0)) * 0.03,   // armed advantage (and the defender's armour resists)
    0.1, 0.95,
  );
}

// Damage a landed blow deals (Health units): a base scaled by STR and martiality (and the
// keenness of the attacker's weapons + a crafted blade), softened by the defender's CON and
// their armour, pressed by ferocity.
export function hitDamage(atk: Combatant, def: Combatant): number {
  const power = 1 + (atk.str - 10) * 0.06 + (atk.martial - 0.5) * 0.3 + (atk.arms ?? 0) * 0.1 + (atk.weapon ?? 0) * 0.06;
  const soak = clamp(1 - (def.con - 10) * 0.03 - (def.armour ?? 0) * 0.06, 0.35, 1.3);
  return clamp(0.18 * power * soak * atk.ferocity, 0.03, 0.7);
}

// One exchange: the damage dealt to the defender, or 0 on a miss.
export function rollAttack(atk: Combatant, def: Combatant, rng: RNG): number {
  if (rng() > hitChance(atk, def)) return 0;
  return hitDamage(atk, def);
}

function ferocityOf(trait: string | undefined): number {
  if (trait === 'brave' || trait === 'hot-headed' || trait === 'ambitious') return 1.25;
  if (trait === 'timid' || trait === 'gentle' || trait === 'content') return 0.75;
  return 1;
}

// Build a combatant from an agent's Body, culture (martiality) and personality (ferocity),
// plus any hardened prowess from its combat record. Falls back to average stats if unbodied.
export function combatantOf(world: World, e: EntityId): Combatant {
  const body = world.getComponent<Body>(e, C_BODY);
  const combat = world.getComponent<Combat>(e, C_COMBAT);
  const agent = world.getComponent<Agent>(e, C_AGENT);
  let martial = 0.5;
  const store = getCultureStore(world);
  if (store && agent?.cultureId) {
    const c = getCulture(store, agent.cultureId);
    if (c) martial = c.values.martial;
  }
  const trait = world.getComponent<{ trait: string }>(e, 'Personality')?.trait;
  // A folk on a hunt/avenge quest fights with purpose — they press harder (M20 s3 — pursuit).
  const quest = world.getComponent<Quest>(e, C_QUEST);
  const questZeal = quest && (quest.kind === 'hunt' || quest.kind === 'avenge') ? 1.2 : 1;
  let arms = 0;
  const ostore = getOrgStore(world);
  if (ostore && agent?.orgId) arms = ostore.byId[agent.orgId]?.effects?.arms ?? 0;
  const eq = world.getComponent<Equipment>(e, C_EQUIPMENT);
  // A ward (M26 s2) lends temporary armour-soak; expiry is swept by the MagicSystem, so a present
  // ward is live (at worst one tick stale, harmlessly — combat runs just before that sweep).
  const ward = world.getComponent<Ward>(e, C_WARD);
  // A magic item (M26 s3): an enchantment boosts the equipped weapon/armour it imbues — but only
  // while that item is actually borne (so a traded-away blade lends no phantom keenness).
  const ench = world.getComponent<Enchantment>(e, C_ENCHANTMENT);
  const weapon = eq?.weapon ?? 0;
  const armour = eq?.armour ?? 0;
  // Old wounds tell (M30): a crippled arm saps STR, a lost eye DEX — a battered veteran fights worse.
  const af = world.getComponent<Afflictions>(e, C_AFFLICTIONS);
  return {
    str: Math.max(1, (body?.str ?? 10) + abilityMod(af, 'str')),
    dex: Math.max(1, (body?.dex ?? 10) + abilityMod(af, 'dex')),
    con: body?.con ?? 10,
    martial,
    ferocity: ferocityOf(trait) * questZeal,
    prowess: combat ? combat.scars + combat.kills * 2 : 0,
    arms,
    weapon: weapon + (ench?.kind === 'weapon' && weapon > 0 ? ench.bonus : 0),
    armour: armour + (ward?.soak ?? 0) + (ench?.kind === 'armour' && armour > 0 ? ench.bonus : 0),
  };
}

// A wild beast's fighting stats, scaled by its size (a bigger beast hits harder and shrugs
// off more). Predators are quick and savage.
export function beastCombatant(size: 'small' | 'medium' | 'large', predator: boolean): Combatant {
  const s = size === 'large' ? 1.5 : size === 'medium' ? 1 : 0.5;
  return {
    str: 8 + s * 5,
    dex: predator ? 12 : 9,
    con: 8 + s * 4,
    martial: predator ? 0.7 : 0.4,
    ferocity: predator ? 1.2 : 0.8,
    prowess: 0,
  };
}

// Record a fight on an agent: lazily attach a Combat component, add scars/kills.
export function markCombat(world: World, e: EntityId, scars: number, kills: number): void {
  let c = world.getComponent<Combat>(e, C_COMBAT);
  if (!c) { c = { scars: 0, kills: 0 }; world.addComponent<Combat>(e, C_COMBAT, c); }
  c.scars += scars;
  c.kills += kills;
}
