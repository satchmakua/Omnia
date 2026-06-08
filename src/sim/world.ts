import { World } from './ecs.ts';
import { createRNG, rngInt, rngFloat } from './rng.ts';
import {
  C_POSITION, C_NEEDS, C_WALLET, C_AGENT, C_FOOD, C_CLOCK,
} from './components.ts';
import type { Position, Needs, Wallet, Agent, Food, Clock } from './components.ts';
import type { SimConfig } from './config.ts';
import type { EntityId } from './ecs.ts';
import type { RNG } from './rng.ts';

// Hardcoded name pool for M0; content-driven names arrive in M1.
const NAME_POOL = [
  'Aldric', 'Bera', 'Cael', 'Duna', 'Erol', 'Faye', 'Gort', 'Hala',
  'Ivar', 'Jess', 'Kell', 'Lyra', 'Mord', 'Nira', 'Oswin', 'Petra',
  'Quen', 'Roan', 'Sera', 'Tor', 'Ula', 'Vex', 'Wren', 'Xara', 'Yoss', 'Zara',
] as const;

export interface Simulation {
  world: World;
  rng: RNG;
  clockEntity: EntityId;
}

export function createSimulation(cfg: SimConfig): Simulation {
  const world = new World();
  const rng = createRNG(cfg.seed);

  // Singleton clock entity
  const clockEntity = world.createEntity();
  const clock: Clock = { tick: 0, day: 0, hour: 0, isDay: true };
  world.addComponent(clockEntity, C_CLOCK, clock);

  // Scatter food sources
  for (let i = 0; i < cfg.foodSourceCount; i++) {
    const e = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, {
      x: rngInt(rng, 0, cfg.gridWidth - 1),
      y: rngInt(rng, 0, cfg.gridHeight - 1),
    });
    world.addComponent<Food>(e, C_FOOD, {
      amount: rngFloat(rng, 0.5, 1.0),
      regenPerTick: cfg.foodRegenPerTick,
    });
  }

  // Spawn agents
  const usedNames = new Set<string>();
  for (let i = 0; i < cfg.initialPopulation; i++) {
    let name: string;
    let attempts = 0;
    do {
      name = NAME_POOL[rngInt(rng, 0, NAME_POOL.length - 1)];
      attempts++;
    } while (usedNames.has(name) && attempts < NAME_POOL.length * 2);
    usedNames.add(name);

    const e = world.createEntity();
    world.addComponent<Position>(e, C_POSITION, {
      x: rngInt(rng, 0, cfg.gridWidth - 1),
      y: rngInt(rng, 0, cfg.gridHeight - 1),
    });
    world.addComponent<Needs>(e, C_NEEDS, {
      hunger: rngFloat(rng, 0.5, 1.0),
      energy: rngFloat(rng, 0.5, 1.0),
    });
    world.addComponent<Wallet>(e, C_WALLET, {
      gold: rngFloat(rng, 10, 50),
    });
    world.addComponent<Agent>(e, C_AGENT, {
      name,
      action: 'wander',
      ticksAlive: 0,
    });
  }

  return { world, rng, clockEntity };
}
