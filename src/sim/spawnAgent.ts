// Shared sapient-agent spawning, used both at world generation (founders) and by
// the ReproductionSystem (newborns). One path keeps founders and children built
// the same way; only age, position, parentage, and aptitude odds differ.
import type { World, EntityId } from './ecs.ts';
import {
  C_POSITION, C_NEEDS, C_WALLET, C_AGENT, C_SPECIES, C_MAGIC, C_HEALTH,
  C_RELATIONSHIPS, C_LINEAGE, C_MEMORY,
} from './components.ts';
import type {
  Position, Needs, Wallet, Agent, SpeciesComp, Magic, Health, Relationships, Lineage, Memory, Sex,
} from './components.ts';
import type { SimConfig } from './config.ts';
import { ticksPerYear } from './config.ts';
import { rngFloat } from './rng.ts';
import type { RNG } from './rng.ts';
import type { Species } from '../content/schema.ts';
import type { Content } from '../content/loader.ts';
import { personalName, familyName } from '../lang/language.ts';

export interface SpawnOpts {
  x: number;
  y: number;
  ageTicks: number;
  parents?: EntityId[];        // empty/undefined for founders
  aptitudeChance?: number;     // overrides the species default (lineage boost for children of mages)
  surname?: string;            // inherited family name (children); founders coin a new one
}

export function spawnAgent(
  world: World, cfg: SimConfig, rng: RNG, species: Species, content: Content, opts: SpawnOpts,
): EntityId {
  const tpy = ticksPerYear(cfg);
  const isChild = (opts.parents?.length ?? 0) > 0;
  const sex: Sex = rng() < 0.5 ? 'male' : 'female';
  const lifespanTicks = Math.floor(rngFloat(rng, species.lifespanYears.min, species.lifespanYears.max) * tpy);
  const wealthGoal = rngFloat(rng, cfg.wealthGoalMin, cfg.wealthGoalMax);

  const e = world.createEntity();
  // Language-derived naming (M7): given name from this agent's tongue + a surname
  // inherited down the lineage (founders coin their own). Keyed by entity id, so it
  // regenerates identically and consumes no simulation RNG.
  const lang = content.languages.require(species.language);
  const given = personalName(lang, String(e));
  const surname = opts.surname ?? familyName(lang, String(e));
  const name = `${given} ${surname}`;
  world.addComponent<Position>(e, C_POSITION, { x: opts.x, y: opts.y });
  world.addComponent<Needs>(e, C_NEEDS, {
    hunger: rngFloat(rng, 0.6, 1.0),
    energy: rngFloat(rng, 0.6, 1.0),
    social: rngFloat(rng, 0.6, 1.0),
  });
  world.addComponent<Wallet>(e, C_WALLET, { gold: isChild ? 0 : rngFloat(rng, 10, 50), debt: 0 });
  world.addComponent<SpeciesComp>(e, C_SPECIES, {
    id: species.id,
    name: species.name,
    color: species.color,
    size: species.size,
    hungerMult: species.needs.hunger,
    energyMult: species.needs.energy,
  });
  world.addComponent<Agent>(e, C_AGENT, {
    name, surname, tongue: lang.name, action: 'wander', ticksAlive: opts.ageTicks, wealthGoal, sex, lifespanTicks,
  });
  world.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
  world.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  world.addComponent<Lineage>(e, C_LINEAGE, {
    partner: null, parents: opts.parents ?? [], children: [], reproCooldownTicks: 0,
  });
  world.addComponent<Memory>(e, C_MEMORY, {
    events: [], summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
    utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9,
  });

  // Rare innate magic aptitude — scarce by construction, but heritable: children
  // of a mage get a much higher chance (lineage weighting from the design docs).
  const aptChance = opts.aptitudeChance ?? species.magicAptitudeChance;
  if (rng() < aptChance) {
    world.addComponent<Magic>(e, C_MAGIC, {
      mana: cfg.magicManaMax,
      maxMana: cfg.magicManaMax,
      manaRegenPerTick: cfg.manaRegenPerDay / cfg.ticksPerDay,
    });
  }
  return e;
}
