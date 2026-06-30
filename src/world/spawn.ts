// Instantiate flora / fauna / resource entities from their content archetypes,
// baking per-tick rates (content authors per-day values) and rolling initial
// state through the seeded RNG. Used at world generation; the Flora/Fauna
// systems spawn offspring by copying an existing entity (no content needed).
import type { World, EntityId } from '../sim/ecs.ts';
import {
  C_POSITION, C_FLORA, C_FAUNA, C_RESOURCE, C_BUSINESS,
} from '../sim/components.ts';
import type { Position, Flora, Fauna, Resource, Business } from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';
import { rngFloat } from '../sim/rng.ts';
import type { RNG } from '../sim/rng.ts';
import type {
  Flora as FloraDef, Fauna as FaunaDef, Resource as ResourceDef, Profession as ProfessionDef,
} from '../content/schema.ts';

export function spawnFlora(
  world: World, x: number, y: number, def: FloraDef, cfg: SimConfig, rng: RNG,
): EntityId {
  const e = world.createEntity();
  world.addComponent<Position>(e, C_POSITION, { x, y });
  world.addComponent<Flora>(e, C_FLORA, {
    speciesId: def.id,
    name: def.name,
    color: def.color,
    maturity: rngFloat(rng, 0.1, 1.0),
    growthPerTick: def.growthPerDay / cfg.ticksPerDay,
    edibleAt: def.edibleAt,
    foodYield: def.foodYield,
    spreadChancePerTick: def.spreadChancePerDay / cfg.ticksPerDay,
  });
  return e;
}

export function spawnFauna(
  world: World, x: number, y: number, def: FaunaDef, cfg: SimConfig, rng: RNG,
): EntityId {
  const e = world.createEntity();
  world.addComponent<Position>(e, C_POSITION, { x, y });
  world.addComponent<Fauna>(e, C_FAUNA, {
    speciesId: def.id,
    name: def.name,
    color: def.color,
    size: def.size,
    diet: def.diet,
    hunger: rngFloat(rng, 0.5, 1.0),
    hungerDecayPerTick: def.hungerDecayPerDay / cfg.ticksPerDay,
    breedThreshold: def.breedThreshold,
    breedCooldownTicks: Math.floor(def.breedCooldownDays * cfg.ticksPerDay),
    ticksAlive: 0,
  });
  return e;
}

export function spawnResource(
  world: World, x: number, y: number, def: ResourceDef, cfg: SimConfig, rng: RNG,
): EntityId {
  const e = world.createEntity();
  world.addComponent<Position>(e, C_POSITION, { x, y });
  world.addComponent<Resource>(e, C_RESOURCE, {
    typeId: def.id,
    name: def.name,
    color: def.color,
    amount: rngFloat(rng, 0.6, 1.0),
    renewable: def.renewable,
    regenPerTick: def.regenPerDay / cfg.ticksPerDay,
  });
  return e;
}

export function spawnBusiness(
  world: World, x: number, y: number, def: ProfessionDef, cfg: SimConfig,
): EntityId {
  const wagePerTick = def.dailyWage / cfg.ticksPerDay;
  const e = world.createEntity();
  world.addComponent<Position>(e, C_POSITION, { x, y });
  world.addComponent<Business>(e, C_BUSINESS, {
    professionId: def.id,
    professionName: def.name,
    color: def.color,
    balance: cfg.businessStartBalance,
    maxEmployees: def.maxEmployeesPerBusiness,
    wagePerTick,
    revenuePerWorkerPerTick: wagePerTick * (1 + cfg.businessRevenueMargin),
    requiresAptitude: def.requiresAptitude,
    gathers: def.gathers ?? null,
    producesFood: def.producesFood,
    fishery: def.fishery,
    tends: def.tends,
  });
  return e;
}
