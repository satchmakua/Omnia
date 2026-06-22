// Births. A married, opposite-sex couple — both fed, healthy, of fertile age, and
// off cooldown — may conceive a child, who inherits a parent's species and joins
// both parents' lineage. Births pause at a population cap so the town grows to a
// carrying capacity and then holds, balancing the deaths from the HealthSystem.
import type { World, EntityId } from '../ecs.ts';
import {
  C_AGENT, C_NEEDS, C_HEALTH, C_LINEAGE, C_POSITION, C_SPECIES, C_MAGIC, C_CLOCK, C_CHRONICLE,
} from '../components.ts';
import type { Agent, Needs, Health, Lineage, Position, SpeciesComp, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears, scaledMaxPopulation } from '../config.ts';
import type { RNG } from '../rng.ts';
import type { Content } from '../../content/loader.ts';
import { spawnAgent } from '../spawnAgent.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { remember } from '../../ai/memory.ts';

export function runReproductionSystem(world: World, cfg: SimConfig, rng: RNG, content: Content): void {
  const birthChance = cfg.birthChancePerDay / cfg.ticksPerDay;

  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  const chronEnts = world.query(C_CHRONICLE);
  const chronicle = chronEnts.length ? world.getComponent<ChronicleData>(chronEnts[0], C_CHRONICLE) : undefined;

  let population = world.query(C_AGENT).length;
  const maxPopulation = scaledMaxPopulation(cfg);   // land-area carrying capacity (M8)
  const births: { mother: EntityId; father: EntityId; x: number; y: number; speciesId: string }[] = [];

  for (const e of world.query(C_AGENT, C_LINEAGE)) {
    const lin = world.getComponent<Lineage>(e, C_LINEAGE)!;
    if (lin.reproCooldownTicks > 0) lin.reproCooldownTicks -= 1;

    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    if (agent.sex !== 'female') continue;            // process each couple once, via the mother
    if (lin.partner === null || !world.hasComponent(lin.partner, C_AGENT)) continue;
    if (lin.reproCooldownTicks > 0) continue;
    if (population + births.length >= maxPopulation) continue;

    const father = world.getComponent<Agent>(lin.partner, C_AGENT)!;
    if (father.sex !== 'male') continue;

    // Both must be fertile adults, fed, and healthy.
    const motherAge = ageInYears(agent.ticksAlive, cfg);
    const fatherAge = ageInYears(father.ticksAlive, cfg);
    if (motherAge < cfg.adultAgeYears || motherAge > cfg.fertilityMaxAgeYears) continue;
    if (fatherAge < cfg.adultAgeYears) continue;
    const mn = world.getComponent<Needs>(e, C_NEEDS)!;
    const mh = world.getComponent<Health>(e, C_HEALTH)!;
    const fn = world.getComponent<Needs>(lin.partner, C_NEEDS)!;
    if (mn.hunger < cfg.reproMinHunger || fn.hunger < cfg.reproMinHunger || mh.value < cfg.reproMinHealth) continue;

    if (rng() < birthChance) {
      const pos = world.getComponent<Position>(e, C_POSITION)!;
      const sp = world.getComponent<SpeciesComp>(e, C_SPECIES)!;
      births.push({ mother: e, father: lin.partner, x: pos.x, y: pos.y, speciesId: sp.id });
    }
  }

  for (const b of births) {
    const species = content.species.get(b.speciesId);
    if (!species) continue;
    // Heritable aptitude: a child with a mage parent is far likelier to be gifted.
    const parentMage = world.hasComponent(b.mother, C_MAGIC) || world.hasComponent(b.father, C_MAGIC);
    const aptitudeChance = parentMage ? cfg.childMageAptitudeChance : species.magicAptitudeChance;

    // Patrilineal surname from the father; culture (upbringing) from the mother.
    const surname = world.getComponent<Agent>(b.father, C_AGENT)!.surname;
    const cultureId = world.getComponent<Agent>(b.mother, C_AGENT)!.cultureId;
    const child = spawnAgent(world, cfg, rng, species, content, {
      x: b.x, y: b.y, ageTicks: 0, parents: [b.mother, b.father], aptitudeChance, surname, cultureId,
    });

    world.getComponent<Lineage>(b.mother, C_LINEAGE)!.children.push(child);
    world.getComponent<Lineage>(b.father, C_LINEAGE)!.children.push(child);
    world.getComponent<Lineage>(b.mother, C_LINEAGE)!.reproCooldownTicks =
      Math.floor(cfg.reproCooldownDays * cfg.ticksPerDay);

    const childName = world.getComponent<Agent>(child, C_AGENT)!.name;
    const motherName = world.getComponent<Agent>(b.mother, C_AGENT)!.name;
    emitEvent(world, 'birth', `${childName} was born to ${motherName}.`);
    remember(world, b.mother, tick, `their child ${childName} was born`, 0.85);
    remember(world, b.father, tick, `their child ${childName} was born`, 0.85);
    remember(world, child, tick, `was born to ${motherName}`, 0.8);
    if (chronicle) {
      chronicleAdd(chronicle, { tick, importance: 0.65, kind: 'birth', text: `${childName} was born to ${motherName}.` }, cfg.chronicleImportanceThreshold);
    }
  }
}
