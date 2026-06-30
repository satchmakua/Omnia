// God-mode soak (S139). The normal soak runs godless; the intervention seam (M27) is unit-tested for
// correctness & replay, but never exercised CONTINUOUSLY under a long run. This soaks god mode: a divine
// hand reaches in every ~50 ticks (smite/bless/bestow/curse + a summon) over a multi-thousand-tick run,
// and asserts the world holds all its invariants and survives — the gap the start-menu god toggle opened.
import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/sim/config.ts';
import { createSimulation } from '../src/sim/world.ts';
import { tick } from '../src/sim/loop.ts';
import { enqueueIntervention } from '../src/sim/interventions.ts';
import {
  C_AGENT, C_NEEDS, C_POSITION, C_HEALTH, C_WALLET, C_CLOCK,
} from '../src/sim/components.ts';
import type { Needs, Position, Health, Wallet, Clock } from '../src/sim/components.ts';
import { isPassable } from '../src/world/tilemap.ts';
import { C_TILEMAP } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { getOrgStore } from '../src/org/orgStore.ts';
import { testContent } from './helpers.ts';

const content = testContent();
// Mostly non-lethal hands (bless/bestow/curse) so the town survives a god who meddles constantly;
// smite is reached for only rarely (below) — a god who culled everyone proves nothing about survival.
const SOFT_POWERS = ['bless', 'bestow', 'curse'] as const;

describe('god-mode soak (S139)', () => {
  it('holds every invariant under a continuous divine hand over 4,000 ticks', () => {
    const cfg = { ...defaultConfig, seed: 8, initialPopulation: 40 };
    const { world, rng, clockEntity } = createSimulation(cfg, content);
    const map = world.getComponent<TileMapData>(world.query(C_TILEMAP)[0], C_TILEMAP)!;
    let violations = 0;
    let acts = 0;

    for (let t = 0; t < 4000; t++) {
      // A god reaches in often: a (non-lethal) power every 50 ticks, a rare smite every 1000, a
      // summoned festival every 700 — heavy, varied divine pressure the town has to weather.
      if (t % 50 === 0) {
        const agents = world.query(C_AGENT);
        if (agents.length) {
          const a = agents[(t * 2654435761) % agents.length];
          const kind = SOFT_POWERS[(t / 50) % SOFT_POWERS.length];
          enqueueIntervention(world, kind, a, kind === 'bestow' ? 40 : undefined);
          acts++;
        }
      }
      if (t % 1000 === 0) {
        const agents = world.query(C_AGENT);
        if (agents.length) { enqueueIntervention(world, 'smite', agents[(t * 40503) % agents.length]); acts++; }
      }
      if (t % 700 === 0) { enqueueIntervention(world, 'summon_festival', null); acts++; }

      tick(world, rng, cfg, clockEntity, content);

      // Invariants every 200 ticks — the same the headless soak guards.
      if (t % 200 === 0) {
        const orgStore = getOrgStore(world);
        for (const e of world.query(C_AGENT, C_NEEDS, C_POSITION)) {
          const n = world.getComponent<Needs>(e, C_NEEDS)!;
          const p = world.getComponent<Position>(e, C_POSITION)!;
          const h = world.getComponent<Health>(e, C_HEALTH);
          const w = world.getComponent<Wallet>(e, C_WALLET);
          const orgId = world.getComponent(e, C_AGENT) as { orgId?: string } | undefined;
          const seafarer = !!(orgId?.orgId && orgStore && (orgStore.byId[orgId.orgId]?.effects?.seafaring ?? 0) > 0);
          if (n.hunger < 0 || n.hunger > 1 || n.energy < 0 || n.energy > 1 || n.social < 0 || n.social > 1) violations++;
          if (p.x < 0 || p.x >= cfg.gridWidth || p.y < 0 || p.y >= cfg.gridHeight) violations++;
          if (!isPassable(map, p.x, p.y) && !seafarer) violations++;
          if (h && (h.value < 0 || h.value > 1)) violations++;
          if (w && (w.gold < 0 || w.debt < 0)) violations++;
        }
      }
    }

    expect(acts).toBeGreaterThan(70);            // the divine hand really did reach in, many times
    expect(violations).toBe(0);                  // …and never pushed the world into an impossible state
    expect(world.query(C_AGENT).length).toBeGreaterThan(0);   // smites and all, the town survives
  });

  it('a recorded god-soak replays byte-identically (determinism under interventions)', () => {
    const cfg = { ...defaultConfig, seed: 8 };
    const logOf = (w: ReturnType<typeof createSimulation>['world']) =>
      w.getComponent<{ log: unknown[] }>(w.query('Interventions')[0], 'Interventions')!.log;
    const fingerprint = (w: ReturnType<typeof createSimulation>['world']) => {
      let s = '';
      for (const e of w.query(C_AGENT)) {
        const p = w.getComponent<Position>(e, C_POSITION);
        const h = w.getComponent<Health>(e, C_HEALTH);
        s += `${e}:${p?.x},${p?.y};${h?.value.toFixed(3)}|`;
      }
      return `${s}pop${w.query(C_AGENT).length}`;
    };

    // Live: enqueue a handful of acts across 600 ticks, capture the log.
    const A = createSimulation(cfg, content);
    for (let t = 0; t < 600; t++) {
      if (t % 120 === 0) {
        const agents = A.world.query(C_AGENT);
        if (agents.length) enqueueIntervention(A.world, t % 240 === 0 ? 'smite' : 'bless', agents[t % agents.length]);
      }
      tick(A.world, A.rng, cfg, A.clockEntity, content);
    }
    const recorded = (logOf(A.world) as { tick: number; kind: string; target: number | null; amount?: number }[]).map(iv => ({ ...iv }));

    // Replay: a fresh same-seed world given only the recorded log → identical world.
    const B = createSimulation(cfg, content);
    (logOf(B.world) as unknown[]).push(...recorded.map(iv => ({ ...iv, applied: false })));
    for (let t = 0; t < 600; t++) tick(B.world, B.rng, cfg, B.clockEntity, content);

    expect(recorded.length).toBeGreaterThan(3);
    expect(fingerprint(B.world)).toBe(fingerprint(A.world));
  });
});
