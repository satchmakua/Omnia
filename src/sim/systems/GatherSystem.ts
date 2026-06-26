// Resource gathering. A working agent whose job harvests a resource (e.g. a
// miner on an ore node) depletes whatever node it's standing on. Finite nodes
// that run dry are removed from the world — an exhausted ore vein is a small
// drama, logged to the event feed. Renewable nodes (timber) regrow via the
// ResourceSystem, so gathering them is sustainable.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_JOB, C_POSITION, C_RESOURCE } from '../components.ts';
import type { Agent, Job, Position, Resource } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ensureInventory, addItem } from '../inventory.ts';
import { emitEvent } from '../../history/eventlog.ts';

export function runGatherSystem(world: World, cfg: SimConfig): void {
  const gatherPerTick = cfg.gatherPerDay / cfg.ticksPerDay;

  // Index resource nodes by tile for O(1) lookup under an agent.
  const nodeAt = new Map<number, EntityId>();
  for (const e of world.query(C_RESOURCE, C_POSITION)) {
    const p = world.getComponent<Position>(e, C_POSITION)!;
    nodeAt.set(p.y * cfg.gridWidth + p.x, e);
  }

  const exhausted: { e: EntityId; res: Resource; x: number; y: number }[] = [];

  for (const e of world.query(C_AGENT, C_JOB, C_POSITION)) {
    if (world.getComponent<Agent>(e, C_AGENT)!.action !== 'work') continue;
    const job = world.getComponent<Job>(e, C_JOB)!;
    if (!job.gathers) continue;
    const pos = world.getComponent<Position>(e, C_POSITION)!;
    const nodeE = nodeAt.get(pos.y * cfg.gridWidth + pos.x);
    if (nodeE === undefined) continue;
    const res = world.getComponent<Resource>(nodeE, C_RESOURCE)!;
    if (res.typeId !== job.gathers || res.amount <= 0) continue;

    const before = res.amount;
    res.amount = Math.max(0, res.amount - gatherPerTick);
    // The worker keeps what they extracted (M23): the raw material goes into their bag,
    // bounded by the carrying cap. Crafting consumes it into goods (slice 2).
    addItem(ensureInventory(world, e), res.typeId, before - res.amount, cfg.inventoryMaxPerItem);
    if (res.amount <= 0 && !res.renewable) exhausted.push({ e: nodeE, res, x: pos.x, y: pos.y });
  }

  for (const x of exhausted) {
    world.destroyEntity(x.e);
    emitEvent(world, 'resource', `The ${x.res.name.toLowerCase()} vein at (${x.x}, ${x.y}) ran dry.`);
  }
}
