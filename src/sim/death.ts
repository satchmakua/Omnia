// Turning a dead agent into a tombstone (SIMULATION_MODEL Mechanism 5). The
// agent's heavy components are stripped and replaced by a single compact
// Tombstone, but the entity id is kept alive so existing lineage pointers keep
// resolving — the dead remain referenceable ("your grandmother who founded the
// guild") without keeping their whole self in memory.
import type { World, EntityId } from './ecs.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES, C_MAGIC, C_JOB,
  C_HEALTH, C_RELATIONSHIPS, C_LINEAGE, C_TOMBSTONE,
} from './components.ts';
import type { Agent, SpeciesComp, Job, Lineage, Tombstone } from './components.ts';

const LIVING_COMPONENTS = [
  C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES, C_MAGIC, C_JOB,
  C_HEALTH, C_RELATIONSHIPS, C_LINEAGE,
];

export function tombstoneFor(
  world: World, e: EntityId, diedTick: number, cause: string, ticksPerYearVal: number,
): Tombstone {
  const agent = world.getComponent<Agent>(e, C_AGENT)!;
  const sp = world.getComponent<SpeciesComp>(e, C_SPECIES);
  const job = world.getComponent<Job>(e, C_JOB);
  const lin = world.getComponent<Lineage>(e, C_LINEAGE);
  const ageYears = Math.floor(agent.ticksAlive / ticksPerYearVal);
  const role = job?.professionName ?? null;
  const speciesName = sp?.name ?? 'folk';
  return {
    name: agent.name,
    speciesName,
    sex: agent.sex,
    bornTick: diedTick - agent.ticksAlive,
    diedTick,
    ageYears,
    role,
    cause,
    legacy: `${agent.name}, ${speciesName.toLowerCase()} ${role ? role.toLowerCase() : 'townsfolk'}, lived ${ageYears} years (${cause}).`,
    partner: lin?.partner ?? null,
    parents: lin?.parents ?? [],
    children: lin?.children ?? [],
  };
}

// Kill an agent: free a widowed partner, strip living components, attach the
// tombstone. The entity stays in the world as a record.
export function killAgent(
  world: World, e: EntityId, diedTick: number, cause: string, ticksPerYearVal: number,
): Tombstone {
  const tomb = tombstoneFor(world, e, diedTick, cause, ticksPerYearVal);

  // Widow the partner so they may re-partner.
  const lin = world.getComponent<Lineage>(e, C_LINEAGE);
  if (lin?.partner != null) {
    const partnerLin = world.getComponent<Lineage>(lin.partner, C_LINEAGE);
    if (partnerLin && partnerLin.partner === e) partnerLin.partner = null;
  }

  for (const c of LIVING_COMPONENTS) world.removeComponent(e, c);
  world.addComponent<Tombstone>(e, C_TOMBSTONE, tomb);
  return tomb;
}
