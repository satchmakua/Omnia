// Turning a dead agent into a tombstone (SIMULATION_MODEL Mechanism 5). The
// agent's heavy components are stripped and replaced by a single compact
// Tombstone, but the entity id is kept alive so existing lineage pointers keep
// resolving — the dead remain referenceable ("your grandmother who founded the
// guild") without keeping their whole self in memory.
import type { World, EntityId } from './ecs.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES, C_MAGIC, C_JOB,
  C_HEALTH, C_RELATIONSHIPS, C_LINEAGE, C_TOMBSTONE,
  C_BODY, C_ALIGNMENT, C_PERSONALITY, C_COMBAT, C_CRIME, C_WARD, C_ENCHANTMENT, C_AFFLICTIONS,
  C_MEMORY, C_INVENTORY, C_CRAFTING, C_QUEST, C_EQUIPMENT,
} from './components.ts';
import type { Agent, SpeciesComp, Job, Lineage, Tombstone, Alignment } from './components.ts';

const LIVING_COMPONENTS = [
  C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES, C_MAGIC, C_JOB,
  C_HEALTH, C_RELATIONSHIPS, C_LINEAGE,
  C_BODY, C_ALIGNMENT, C_PERSONALITY, C_COMBAT, C_CRIME,   // M13/M16 facets — strip on death too
  C_WARD, C_ENCHANTMENT,   // M26 magic: a corpse is neither warded nor wielding an enchanted blade
  C_AFFLICTIONS,           // M30: the dead carry no injuries
  // Deep-time hygiene (S139): the remaining living-only facets — the inner life (Memory: events/
  // utterances/summaries), carried goods (Inventory), the craft hand (Crafting), an unfinished Quest,
  // and worn gear (Equipment). Every system that reads these queries them paired with C_AGENT, so a
  // tombstone never exposes them — keeping them only let graves grow O(deaths) without bound (the
  // Memory arrays the heaviest). Stripping is byte-identical (nothing reads them on the dead). The
  // tombstone keeps the durable record (name, dates, lineage, cause); legends live on the Chronicle.
  C_MEMORY, C_INVENTORY, C_CRAFTING, C_QUEST, C_EQUIPMENT,
];

export function tombstoneFor(
  world: World, e: EntityId, diedTick: number, cause: string, ticksPerYearVal: number, slayer?: string,
): Tombstone {
  const agent = world.getComponent<Agent>(e, C_AGENT)!;
  const sp = world.getComponent<SpeciesComp>(e, C_SPECIES);
  const job = world.getComponent<Job>(e, C_JOB);
  const lin = world.getComponent<Lineage>(e, C_LINEAGE);
  const ageYears = Math.floor(agent.ticksAlive / ticksPerYearVal);
  const role = job?.professionName ?? null;
  const speciesName = sp?.name ?? 'folk';
  const end = slayer ? `${cause} — ${slayer}` : cause;
  return {
    name: agent.name,
    speciesName,
    sex: agent.sex,
    bornTick: diedTick - agent.ticksAlive,
    diedTick,
    ageYears,
    role,
    cause,
    slayer,
    legacy: `${agent.name}, ${speciesName.toLowerCase()} ${role ? role.toLowerCase() : 'townsfolk'}, lived ${ageYears} years (${end}).`,
    partner: lin?.partner ?? null,
    parents: lin?.parents ?? [],
    children: lin?.children ?? [],
  };
}

// Grief shakes faith (M18 s4): an UNTIMELY death plants doubt in the bereaved faithful — losing
// one's own child is the heaviest blow of all ("how could my god allow this?"). Doubt matures into
// apostasy in the ReligionSystem; a better day drains it, so only clustered griefs — or grief atop
// despair — break faith. A death of old age is the natural order and shakes no one. Hardcoded
// weights, like the MoodSystem's circumstance couplings (D26). Deterministic (no RNG — the death
// already happened); killAgent is the single choke point, so battle, murder, plague, starvation,
// beasts, and feuds all grieve alike.
const GRIEF_DOUBT = 2;        // losing a partner or a parent before their time
const CHILD_GRIEF_DOUBT = 3;  // outliving your own child — the heaviest grief (M10 s3)
// Grief also EMBITTERS (M13 s2): an untimely loss nudges the bereaved's `good` a shade darker —
// the sim's one steady downward flow on the moral axis. Without it the reflection drift (warm
// lives lean good) ratcheted whole towns into Neutral Good and the villainous wing died out;
// with it, tragedy keeps the full nine-cell grid alive. Small beside the reflection drift, and
// clamped — grief alone never makes a monster, but a life of graves leaves its mark.
const GRIEF_EMBITTER = 0.02;

// Kill an agent: free a widowed partner, strip living components, attach the
// tombstone. The entity stays in the world as a record.
export function killAgent(
  world: World, e: EntityId, diedTick: number, cause: string, ticksPerYearVal: number, slayer?: string,
): Tombstone {
  const tomb = tombstoneFor(world, e, diedTick, cause, ticksPerYearVal, slayer);

  // Widow the partner so they may re-partner.
  const lin = world.getComponent<Lineage>(e, C_LINEAGE);
  if (lin?.partner != null) {
    const partnerLin = world.getComponent<Lineage>(lin.partner, C_LINEAGE);
    if (partnerLin && partnerLin.partner === e) partnerLin.partner = null;
  }

  // An untimely end sows doubt among the faithful bereaved (M18 s4) — and embitters (M13 s2).
  if (cause !== 'old age' && lin) {
    const shake = (kin: EntityId | null, amount: number): void => {
      if (kin === null) return;
      const ka = world.getComponent<Agent>(kin, C_AGENT);
      if (!ka) return;
      if (ka.religionId) ka.doubt = (ka.doubt ?? 0) + amount;
      const al = world.getComponent<Alignment>(kin, C_ALIGNMENT);
      if (al) al.good = Math.max(-1, al.good - GRIEF_EMBITTER);
    };
    shake(lin.partner, GRIEF_DOUBT);
    for (const c of lin.children) shake(c, GRIEF_DOUBT);
    for (const p of lin.parents) shake(p, CHILD_GRIEF_DOUBT);
  }

  for (const c of LIVING_COMPONENTS) world.removeComponent(e, c);
  world.addComponent<Tombstone>(e, C_TOMBSTONE, tomb);
  return tomb;
}
