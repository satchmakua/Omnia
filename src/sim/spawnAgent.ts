// Shared sapient-agent spawning, used both at world generation (founders) and by
// the ReproductionSystem (newborns). One path keeps founders and children built
// the same way; only age, position, parentage, and aptitude odds differ.
import type { World, EntityId } from './ecs.ts';
import {
  C_POSITION, C_NEEDS, C_WALLET, C_AGENT, C_SPECIES, C_MAGIC, C_HEALTH,
  C_RELATIONSHIPS, C_LINEAGE, C_MEMORY, C_BODY, C_ALIGNMENT, C_PERSONALITY,
} from './components.ts';
import type {
  Position, Needs, Wallet, Agent, SpeciesComp, Magic, Health, Relationships, Lineage, Memory, Sex,
  Body, Alignment, Personality,
} from './components.ts';
import {
  rollBody, inheritBody, rollAlignment, inheritAlignment, rollPersonality, inheritPersonality, expandPersonality, traitsOf,
} from './heredity.ts';
import type { SimConfig } from './config.ts';
import { ticksPerYear } from './config.ts';
import { rngFloat } from './rng.ts';
import type { RNG } from './rng.ts';
import type { Species } from '../content/schema.ts';
import type { Content } from '../content/loader.ts';
import { personalName, familyName } from '../lang/language.ts';
import { getLanguageStore, getLanguage } from '../lang/languageStore.ts';
import { getCultureStore, getCulture, cultureForLanguage, wealthGoalFactor } from '../culture/cultureStore.ts';
import { nativeFluency } from '../lang/fluency.ts';
import { MOOD_BASELINE } from './systems/MoodSystem.ts';
import { schoolIds } from '../magic/schools.ts';

// Re-surname a living agent to their clan (M20): their family name IS the clan's word, so a
// clan reassignment (world-gen founding, or a schism) renames them. Keeps the given name.
export function renameToClan(agent: Agent, clanWord: string): void {
  if (!clanWord) return;   // defensive (e.g. a pre-M20 save whose clan has no `surname`)
  const given = agent.name.split(' ').slice(0, -1).join(' ');
  agent.name = given ? `${given} ${clanWord}` : `${agent.name} ${clanWord}`;
  agent.surname = clanWord;
}

export interface SpawnOpts {
  x: number;
  y: number;
  ageTicks: number;
  parents?: EntityId[];        // empty/undefined for founders
  aptitudeChance?: number;     // overrides the species default (lineage boost for children of mages)
  surname?: string;            // inherited family name (children); founders coin a new one
  cultureId?: string;          // inherited culture (children); founders take their species' culture
  orgId?: string;              // inherited tribe (children); founders are assigned one at world-gen (M14)
  religionId?: string;         // inherited faith (children); founders are assigned one at world-gen (M18)
}

export function spawnAgent(
  world: World, cfg: SimConfig, rng: RNG, species: Species, content: Content, opts: SpawnOpts,
): EntityId {
  const tpy = ticksPerYear(cfg);
  const isChild = (opts.parents?.length ?? 0) > 0;
  const sex: Sex = rng() < 0.5 ? 'male' : 'female';
  const lifespanTicks = Math.floor(rngFloat(rng, species.lifespanYears.min, species.lifespanYears.max) * tpy);
  const wealthGoalBase = rngFloat(rng, cfg.wealthGoalMin, cfg.wealthGoalMax);

  // Culture: founders take their species' culture; children inherit a parent's.
  // The culture's values causally bias behaviour — communal folk aim for less wealth (D26).
  const store = getCultureStore(world);
  const cultureId = opts.cultureId ?? (store ? cultureForLanguage(store, species.language) : undefined);
  const culture = cultureId && store ? getCulture(store, cultureId) : undefined;
  const wealthGoal = culture ? wealthGoalBase * wealthGoalFactor(culture.values) : wealthGoalBase;

  const e = world.createEntity();
  // Language-derived naming (M7): given name from this agent's tongue + a surname
  // inherited down the lineage (founders coin their own). Keyed by entity id, so it
  // regenerates identically and consumes no simulation RNG. Resolved from the runtime
  // store so a drifted tongue names its later-born children differently (slice 3).
  const langStore = getLanguageStore(world);
  const lang = (langStore && getLanguage(langStore, species.language)) ?? content.languages.require(species.language);
  const given = personalName(lang, String(e));
  const surname = opts.surname ?? familyName(lang, String(e));
  const name = `${given} ${surname}`;
  world.addComponent<Position>(e, C_POSITION, { x: opts.x, y: opts.y });
  world.addComponent<Needs>(e, C_NEEDS, {
    hunger: rngFloat(rng, 0.6, 1.0),
    energy: rngFloat(rng, 0.6, 1.0),
    social: rngFloat(rng, 0.6, 1.0),
    fun: 0.85,   // mildly entertained at birth; a constant (no RNG draw) keeps the spawn stream identical
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
    name, surname, cultureId, orgId: opts.orgId, religionId: opts.religionId, action: 'wander',
    ticksAlive: opts.ageTicks, wealthGoal, sex, lifespanTicks,
    // Natively fluent in their culture's tongue; they learn others through contact (M10 s4).
    fluency: nativeFluency(culture?.language),
    mood: MOOD_BASELINE,   // mildly content at birth; circumstance moves it (M11 s2)
  });
  world.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
  world.addComponent<Relationships>(e, C_RELATIONSHIPS, { edges: {} });
  world.addComponent<Lineage>(e, C_LINEAGE, {
    partner: null, parents: opts.parents ?? [], children: [], reproCooldownTicks: 0,
  });
  world.addComponent<Memory>(e, C_MEMORY, {
    events: [], summaries: [], beliefs: [], lastReflectTick: -1e9, lastRollupTick: -1e9,
    utterances: [], lastSpokeTick: -1e9, lastDreamTick: -1e9, purpose: 0,
  });

  // Body & heredity (M13): a child inherits the parental mean (+ variation) of both
  // parents' bodies; a founder rolls fresh. Traits thus visibly run in families.
  const parents = opts.parents ?? [];
  const pa = parents[0] !== undefined ? world.getComponent<Body>(parents[0], C_BODY) : undefined;
  const pb = parents[1] !== undefined ? world.getComponent<Body>(parents[1], C_BODY) : undefined;
  world.addComponent<Body>(e, C_BODY, pa && pb ? inheritBody(rng, pa, pb) : rollBody(rng, species));
  const aa = parents[0] !== undefined ? world.getComponent<Alignment>(parents[0], C_ALIGNMENT) : undefined;
  const ab = parents[1] !== undefined ? world.getComponent<Alignment>(parents[1], C_ALIGNMENT) : undefined;
  world.addComponent<Alignment>(e, C_ALIGNMENT, aa && ab ? inheritAlignment(rng, aa, ab) : rollAlignment(rng));
  const ma = parents[0] !== undefined ? world.getComponent<Personality>(parents[0], C_PERSONALITY) : undefined;
  const mb = parents[1] !== undefined ? world.getComponent<Personality>(parents[1], C_PERSONALITY) : undefined;
  // The dominant trait rolls/inherits as before (one RNG draw); the secondary traits are then
  // filled in deterministically by entity id (no extra RNG draw) — children draw from their
  // parents' pooled traits, founders from the whole palette (M28 s3).
  const base = ma && mb ? inheritPersonality(rng, ma, mb) : rollPersonality(rng);
  const pool = ma && mb ? [...traitsOf(ma), ...traitsOf(mb)] : undefined;
  world.addComponent<Personality>(e, C_PERSONALITY, expandPersonality(e, base.trait, pool));

  // Rare innate magic aptitude — scarce by construction, but heritable: children
  // of a mage get a much higher chance (lineage weighting from the design docs).
  const aptChance = opts.aptitudeChance ?? species.magicAptitudeChance;
  if (rng() < aptChance) {
    // A mage practises one of the four schools; mastery starts scaled by age (a seasoned
    // founder is already adept) and grows over a life (MagicSystem).
    const ids = schoolIds();
    const school = ids[Math.floor(rng() * ids.length)];
    const mastery = 1 + Math.floor((opts.ageTicks / ticksPerYear(cfg)) / 10);
    world.addComponent<Magic>(e, C_MAGIC, {
      mana: cfg.magicManaMax,
      maxMana: cfg.magicManaMax,
      manaRegenPerTick: cfg.manaRegenPerDay / cfg.ticksPerDay,
      school,
      mastery,
    });
  }
  return e;
}
