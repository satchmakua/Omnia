// Homes & property (M11 slice 1): settled adults build & own homes from their savings,
// the town visibly grows, the wealthy become landlords, and a home outliving its owner
// falls to ruin. BuildSystem runs once a day and places deterministically.
import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig, ticksPerYear } from '../src/sim/config.ts';
import { C_AGENT, C_WALLET, C_POSITION, C_HOME, C_CLOCK, C_TILEMAP, C_TOMBSTONE } from '../src/sim/components.ts';
import type { Agent, Wallet, Home, Position, Clock, Tombstone } from '../src/sim/components.ts';
import type { TileMapData } from '../src/world/tilemap.ts';
import { runBuildSystem } from '../src/sim/systems/BuildSystem.ts';

const cfg = defaultConfig;

function passableMap(w: number, h: number): TileMapData {
  return {
    width: w, height: h, biomeIndex: new Uint16Array(w * h),
    biomeIds: ['plain'], biomeNames: ['Plain'], colors: ['#000000'], passableByBiome: [true],
  };
}

function town(tick = cfg.ticksPerDay): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  w.addComponent<TileMapData>(w.createEntity(), C_TILEMAP, passableMap(cfg.gridWidth, cfg.gridHeight));
  return w;
}

function addAdult(w: World, gold: number, ageYears = 30): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, {
    name: 'A', action: 'wander', ticksAlive: Math.floor(ageYears * ticksPerYear(cfg)),
    wealthGoal: 200, sex: 'female', lifespanTicks: 1e9,
  });
  w.addComponent<Wallet>(e, C_WALLET, { gold, debt: 0 });
  w.addComponent<Position>(e, C_POSITION, { x: 10, y: 10 });
  return e;
}

const homesOf = (w: World, e: EntityId) =>
  w.query(C_HOME).filter(h => w.getComponent<Home>(h, C_HOME)!.owner === e);

describe('BuildSystem — folk build & own homes (M11)', () => {
  it('a settled adult with the means builds a home (gold spent, home owned & placed)', () => {
    const w = town();
    const a = addAdult(w, cfg.homeCost + 5);
    runBuildSystem(w, cfg);
    const homes = homesOf(w, a);
    expect(homes.length).toBe(1);
    expect(w.getComponent<Wallet>(a, C_WALLET)!.gold).toBe(5);            // paid homeCost
    expect(w.getComponent<Home>(homes[0], C_HOME)!.owner).toBe(a);
    const p = w.getComponent<Position>(homes[0], C_POSITION)!;
    expect(p.x).toBeGreaterThanOrEqual(0);                                // placed on the (passable) map
  });

  it('an adult who cannot afford it does not build', () => {
    const w = town();
    const a = addAdult(w, cfg.homeCost - 1);
    runBuildSystem(w, cfg);
    expect(homesOf(w, a).length).toBe(0);
    expect(w.getComponent<Wallet>(a, C_WALLET)!.gold).toBe(cfg.homeCost - 1);
  });

  it('children do not build homes', () => {
    const w = town();
    const kid = addAdult(w, 1000, 8);   // age 8 → a child
    runBuildSystem(w, cfg);
    expect(homesOf(w, kid).length).toBe(0);
  });

  it('only builds on a day boundary', () => {
    const w = town(cfg.ticksPerDay + 1);   // not a boundary
    const a = addAdult(w, cfg.homeCost + 5);
    runBuildSystem(w, cfg);
    expect(homesOf(w, a).length).toBe(0);
  });

  it('cost escalates: enough for one but not a second → owns just one', () => {
    const w = town();
    const a = addAdult(w, cfg.homeCost * 2 - 1);   // affords the 1st (×1) but not the 2nd (×2)
    runBuildSystem(w, cfg);
    expect(homesOf(w, a).length).toBe(1);
    runBuildSystem(w, cfg);                         // still short for a second
    expect(homesOf(w, a).length).toBe(1);
  });

  it('a wealthy adult becomes a landlord (owns several over time)', () => {
    const w = town();
    const a = addAdult(w, cfg.homeCost * 5);
    runBuildSystem(w, cfg);                         // 1st (needs ×1)
    runBuildSystem(w, cfg);                         // 2nd (needs ×2; still affordable)
    expect(homesOf(w, a).length).toBe(2);
  });

  it('a home whose owner is gone, with no heir, falls to ruin (pruned)', () => {
    const w = town();
    const a = addAdult(w, cfg.homeCost + 5);
    runBuildSystem(w, cfg);
    expect(w.query(C_HOME).length).toBe(1);
    w.removeComponent(a, C_AGENT);                  // owner dies/leaves, leaving no tombstone/heir
    runBuildSystem(w, cfg);
    expect(w.query(C_HOME).length).toBe(0);
  });

  // ── Inheritance (M11 slice 2): the family seat passes down ──────────────────────
  const tomb = (children: EntityId[]): Tombstone => ({
    name: 'X', speciesName: 'Human', sex: 'female', bornTick: 0, diedTick: 100,
    ageYears: 40, role: null, cause: 'old age', legacy: '', partner: null, parents: [], children,
  });
  function die(w: World, e: EntityId, children: EntityId[]): void {
    w.removeComponent(e, C_AGENT);
    w.addComponent<Tombstone>(e, C_TOMBSTONE, tomb(children));
  }

  it('a home passes to a living, home-less child when its owner dies', () => {
    const w = town();
    const parent = addAdult(w, cfg.homeCost + 5);
    const heir = addAdult(w, 0);                    // a living adult who owns no home
    runBuildSystem(w, cfg);                         // parent builds a home
    const home = homesOf(w, parent)[0];
    die(w, parent, [heir]);
    runBuildSystem(w, cfg);
    expect(w.query(C_HOME).length).toBe(1);                          // not ruined
    expect(w.getComponent<Home>(home, C_HOME)!.owner).toBe(heir);    // inherited
  });

  it('an heir who already owns a home does not inherit a second (it ruins)', () => {
    const w = town();
    const parent = addAdult(w, cfg.homeCost + 5);
    const heir = addAdult(w, cfg.homeCost + 5);     // builds their own home
    runBuildSystem(w, cfg);
    expect(homesOf(w, heir).length).toBe(1);
    die(w, parent, [heir]);
    runBuildSystem(w, cfg);
    expect(homesOf(w, heir).length).toBe(1);        // kept their own; didn't accumulate the parent's
    expect(w.query(C_HOME).length).toBe(1);         // the parent's home ruined
  });

  it('placement is deterministic', () => {
    const place = () => {
      const w = town();
      const a = addAdult(w, cfg.homeCost + 5);
      runBuildSystem(w, cfg);
      return w.getComponent<Position>(homesOf(w, a)[0], C_POSITION)!;
    };
    expect(place()).toEqual(place());
  });
});
