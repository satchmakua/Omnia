import type { World } from '../ecs.ts';
import { C_CLOCK } from '../components.ts';
import type { Clock } from '../components.ts';
import type { EntityId } from '../ecs.ts';
import type { SimConfig } from '../config.ts';

export function runClockSystem(world: World, cfg: SimConfig, clockEntity: EntityId): void {
  const clock = world.getComponent<Clock>(clockEntity, C_CLOCK)!;
  clock.tick += 1;

  const tickOfDay = clock.tick % cfg.ticksPerDay;
  clock.day = Math.floor(clock.tick / cfg.ticksPerDay);
  clock.hour = Math.floor((tickOfDay / cfg.ticksPerDay) * 24);
  clock.isDay = tickOfDay < cfg.ticksPerDay / 2;
}
