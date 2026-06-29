// Clan = kin-line + faction (M20 merge): a clan's word IS its members' surname, so "House X"
// and "X clan" are one thing. The invariant — every clan member carries their clan's word as a
// surname — holds across world-gen, birth (maternal), and schism.
import { describe, it, expect } from 'vitest';
import { defaultConfig } from '../src/sim/config.ts';
import { C_AGENT } from '../src/sim/components.ts';
import type { Agent } from '../src/sim/components.ts';
import { createSimulation } from '../src/sim/world.ts';
import { runTicks } from '../src/sim/loop.ts';
import { getOrgStore, clanWordOf } from '../src/org/orgStore.ts';
import { testContent } from './helpers.ts';

describe('clanWordOf (M20)', () => {
  it('strips the " clan" suffix to the bare family word', () => {
    expect(clanWordOf('Rkkharur clan')).toBe('Rkkharur');
    expect(clanWordOf('Korvu')).toBe('Korvu');   // already bare (test fixtures)
  });
});

describe('clan = surname (M20 merge)', () => {
  function assertInvariant(world: ReturnType<typeof createSimulation>['world']): number {
    const store = getOrgStore(world)!;
    let checked = 0;
    for (const e of world.query(C_AGENT)) {
      const a = world.getComponent<Agent>(e, C_AGENT)!;
      if (!a.orgId) continue;
      const clan = store.byId[a.orgId];
      expect(a.surname).toBe(clan.surname);              // surname IS the clan word
      expect(a.name.endsWith(clan.surname)).toBe(true);  // and the display name ends with it
      checked++;
    }
    return checked;
  }

  it('every founder carries their clan word as a surname', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 8 }, testContent());
    expect(assertInvariant(sim.world)).toBeGreaterThan(0);
  });

  it('holds across generations & schism (births take the mother\'s clan)', () => {
    const sim = createSimulation({ ...defaultConfig, seed: 8 }, testContent());
    runTicks(sim.world, sim.rng, defaultConfig, sim.clockEntity, sim.content, 12000);   // breed several generations
    const checked = assertInvariant(sim.world);
    expect(checked).toBeGreaterThan(12);   // a living, multi-generation town — all clan-named (floor kept loose: the exact pop shifts with the event director's drama, M32)
  }, 20_000);
});
