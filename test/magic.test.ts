import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/ecs.ts';
import type { EntityId } from '../src/sim/ecs.ts';
import { defaultConfig } from '../src/sim/config.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_MAGIC, C_JOB, C_BUSINESS, C_POSITION, C_FAUNA, C_HEALTH, C_CLOCK, C_COMBAT, C_WARD, C_CURSE, C_SPECIAL, C_FLORA, C_EQUIPMENT, C_ENCHANTMENT, C_TOMBSTONE,
} from '../src/sim/components.ts';
import type { Needs, Magic, Agent, Wallet, Business, Job, Fauna, Health, Clock, Combat, Ward, Curse, Special, Flora, Equipment, Enchantment } from '../src/sim/components.ts';
import { killAgent } from '../src/sim/death.ts';
import { runCapabilitySystem } from '../src/sim/systems/CapabilitySystem.ts';
import { runEconomySystem } from '../src/sim/systems/EconomySystem.ts';
import { runMagicSystem } from '../src/sim/systems/MagicSystem.ts';
import { runCombatSystem } from '../src/sim/systems/CombatSystem.ts';
import { runSpecialAgentSystem } from '../src/sim/systems/SpecialAgentSystem.ts';
import { combatantOf } from '../src/sim/combat.ts';
import { schoolOf, knownSpells, topSpell, schoolIds } from '../src/magic/schools.ts';
import { createSimulation } from '../src/sim/world.ts';
import { testContent } from './helpers.ts';

const cfg = defaultConfig;
const content = testContent();

function addMage(w: World, needs: Needs, mana: number): { e: number; magic: Magic; needs: Needs } {
  const e = w.createEntity();
  const magic: Magic = { mana, maxMana: 100, manaRegenPerTick: 0.5 };
  w.addComponent<Magic>(e, C_MAGIC, magic);
  w.addComponent<Needs>(e, C_NEEDS, needs);
  return { e, magic, needs };
}

// ── CapabilitySystem ──────────────────────────────────────────────────────────

describe('CapabilitySystem', () => {
  it('regenerates mana toward the cap', () => {
    const w = new World();
    const { magic } = addMage(w, { hunger: 0.9, energy: 0.9, social: 1 }, 50); // comfortable → no cast
    runCapabilitySystem(w, cfg, content);
    expect(magic.mana).toBeCloseTo(50.5);
  });

  it('does not overfill mana past the cap', () => {
    const w = new World();
    const { magic } = addMage(w, { hunger: 0.9, energy: 0.9, social: 1 }, 100);
    runCapabilitySystem(w, cfg, content);
    expect(magic.mana).toBe(100);
  });

  it('a hungry mage conjures a meal — hunger up, mana spent', () => {
    const w = new World();
    const { magic, needs } = addMage(w, { hunger: 0.1, energy: 0.9, social: 1 }, 100);
    runCapabilitySystem(w, cfg, content);
    expect(needs.hunger).toBeGreaterThan(0.1);   // conjured food
    expect(magic.mana).toBeLessThan(100);        // paid mana
  });

  it('a tired mage mends its vigour when not hungry', () => {
    const w = new World();
    const { magic, needs } = addMage(w, { hunger: 0.9, energy: 0.1, social: 1 }, 100);
    runCapabilitySystem(w, cfg, content);
    expect(needs.energy).toBeGreaterThan(0.1);
    expect(magic.mana).toBeLessThan(100);
  });

  it('a mage out of mana cannot cast (falls back to mundane survival)', () => {
    const w = new World();
    const { needs, magic } = addMage(w, { hunger: 0.1, energy: 0.9, social: 1 }, 1);
    runCapabilitySystem(w, cfg, content);
    // 1 + 0.5 regen = 1.5 mana, far below conjure cost → no cast, hunger unchanged.
    expect(needs.hunger).toBe(0.1);
    expect(magic.mana).toBeCloseTo(1.5);
  });
});

// ── Aptitude: rare but present, deterministic ─────────────────────────────────

describe('magic aptitude', () => {
  it('is rare across the population (well under 10%) yet appears', () => {
    // Aggregate over several seeds so the assertion rides on the *rate*, not one lucky species roll.
    let folk = 0, mages = 0;
    for (const seed of [3, 7, 11, 19]) {
      const { world } = createSimulation({ ...defaultConfig, seed, initialPopulation: 300 }, content);
      folk += world.query(C_AGENT).length;
      mages += world.query(C_AGENT, C_MAGIC).length;
    }
    expect(mages).toBeGreaterThan(0);          // magic does appear…
    expect(mages / folk).toBeLessThan(0.1);    // …but stays rare (well under 10%)
  });

  it('is deterministic: same seed → same number of mages', () => {
    const make = () => {
      const { world } = createSimulation({ ...defaultConfig, seed: 7, initialPopulation: 300 }, content);
      return world.query(C_AGENT, C_MAGIC).length;
    };
    expect(make()).toBe(make());
  });
});

// ── Magical professions hire only the gifted ──────────────────────────────────

describe('magical-profession hiring', () => {
  function biz(w: World, requiresAptitude: boolean) {
    const e = w.createEntity();
    w.addComponent<Business>(e, C_BUSINESS, {
      professionId: requiresAptitude ? 'hedge_witch' : 'laborer',
      professionName: requiresAptitude ? 'Hedge-Witch' : 'Laborer',
      color: '#fff', balance: 100, maxEmployees: 2, wagePerTick: 0.5,
      revenuePerWorkerPerTick: 0.6, requiresAptitude, gathers: null,
    });
    w.addComponent(e, C_POSITION, { x: 0, y: 0 });
    return e;
  }
  function person(w: World, apt: boolean) {
    const e = w.createEntity();
    w.addComponent<Agent>(e, C_AGENT, { name: 'A', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'female', lifespanTicks: 1_000_000_000 });
    w.addComponent<Wallet>(e, C_WALLET, { gold: 0, debt: 0 });
    w.addComponent(e, C_POSITION, { x: 1, y: 1 });
    if (apt) w.addComponent<Magic>(e, C_MAGIC, { mana: 100, maxMana: 100, manaRegenPerTick: 0.04 });
    return e;
  }

  it('only aptitude-gifted agents are hired into magical businesses', () => {
    const w = new World();
    const witchHouse = biz(w, true);
    const plainAgent = person(w, false);
    runEconomySystem(w, cfg);
    // The non-apt agent must NOT have taken the magical job (no other business exists).
    expect(w.hasComponent(plainAgent, C_JOB)).toBe(false);
  });

  it('a gifted agent prefers the magical employer over a plain one', () => {
    const w = new World();
    const witchHouse = biz(w, true);   // created first
    biz(w, false);
    const mageAgent = person(w, true);
    runEconomySystem(w, cfg);
    const job = w.getComponent<Job>(mageAgent, C_JOB);
    expect(job?.employer).toBe(witchHouse);
  });
});

// ── The magic tree + MagicSystem (M17 slice 3) ────────────────────────────────────────
describe('magic schools (M17 s3)', () => {
  it('the schools are content and mastery gates spells', () => {
    expect(schoolIds()).toContain('elementalism');
    expect(schoolIds().length).toBe(9);   // four founding + ward/curse (s2) + summon/weather (s2b) + enchant (s3)
    expect(knownSpells('elementalism', 1).length).toBe(1);   // only Spark at mastery 1
    expect(knownSpells('elementalism', 5).length).toBe(3);   // all three by mastery 5
    expect(topSpell('elementalism', 5)!.name).toBe('Storm Wrath');
    expect(schoolOf('restoration')!.signature).toBe('heal');
    expect(schoolOf('abjuration')!.signature).toBe('ward');
    expect(schoolOf('maleficence')!.signature).toBe('curse');
    expect(schoolOf('summoning')!.signature).toBe('summon');
    expect(schoolOf('druidry')!.signature).toBe('weather');
    expect(schoolOf('artifice')!.signature).toBe('enchant');
  });
});

const noRng = () => 0;
function mageWorld(tick = 100): World {
  const w = new World();
  w.addComponent<Clock>(w.createEntity(), C_CLOCK, { tick, day: 1, hour: 0, isDay: true });
  return w;
}
function castMage(w: World, x: number, y: number, school: string, mastery: number, mana = 80): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: 'Mage', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'female', lifespanTicks: 1e9 });
  w.addComponent<Magic>(e, C_MAGIC, { mana, maxMana: 100, manaRegenPerTick: 0, school, mastery });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}
function predator(w: World, x: number, y: number): EntityId {
  const e = w.createEntity();
  w.addComponent<Fauna>(e, C_FAUNA, { speciesId: 's', name: 'Stalker', color: '#a00', size: 'medium', diet: 'predator', hunger: 1, hungerDecayPerTick: 0, breedThreshold: 1, breedCooldownTicks: 0, ticksAlive: 0 });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}

describe('MagicSystem (M17 s3)', () => {
  it('an elementalist blasts an adjacent beast and earns the kill', () => {
    const w = mageWorld();
    const m = castMage(w, 5, 5, 'elementalism', 3);
    const b = predator(w, 6, 5);
    runMagicSystem(w, cfg, noRng);
    expect(w.isAlive(b)).toBe(false);
    expect(w.getComponent<Combat>(m, C_COMBAT)!.kills).toBe(1);
    expect(w.getComponent<Magic>(m, C_MAGIC)!.mana).toBeLessThan(80);
  });

  it('a restorer mends a wounded neighbour', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'restoration', 2);
    const hurt = w.createEntity();
    w.addComponent<Agent>(hurt, C_AGENT, { name: 'Hurt', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
    w.addComponent<Health>(hurt, C_HEALTH, { value: 0.4, ill: false });
    w.addComponent(hurt, C_POSITION, { x: 6, y: 5 });
    runMagicSystem(w, cfg, noRng);
    expect(w.getComponent<Health>(hurt, C_HEALTH)!.value).toBeGreaterThan(0.4);
  });

  it('a mage with too little mana cannot cast', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'elementalism', 3, 5);
    const b = predator(w, 6, 5);
    runMagicSystem(w, cfg, noRng);
    expect(w.isAlive(b)).toBe(true);
  });

  it('mastery grows on a day boundary', () => {
    const w = mageWorld(cfg.ticksPerDay);
    const m = castMage(w, 5, 5, 'divination', 2);
    runMagicSystem(w, cfg, noRng);
    expect(w.getComponent<Magic>(m, C_MAGIC)!.mastery!).toBeGreaterThan(2);
  });

  it('aptitude-gifted folk are given a school and mastery at world-gen', () => {
    // Scan seeds for a founding town that rolled at least one mage (aptitude is rare & species-
    // dependent, so no single seed is guaranteed), then validate every mage's school & mastery.
    for (let seed = 1; seed <= 12; seed++) {
      const { world } = createSimulation({ ...defaultConfig, seed, initialPopulation: 120 }, content);
      const mages = world.query(C_MAGIC, C_AGENT);
      if (mages.length === 0) continue;
      for (const e of mages) {
        const magic = world.getComponent<Magic>(e, C_MAGIC)!;
        expect(schoolIds()).toContain(magic.school);
        expect(magic.mastery).toBeGreaterThanOrEqual(1);
      }
      return;   // validated a town that has mages
    }
    throw new Error('no mage appeared across seeds 1–12 at pop 120');
  });
});

// ── Battle magic: wards & curses (M26 s2) ─────────────────────────────────────────────
function plainFolk(w: World, x: number, y: number, hp = 1): EntityId {
  const e = w.createEntity();
  w.addComponent<Agent>(e, C_AGENT, { name: 'Folk', action: 'wander', ticksAlive: 20000, wealthGoal: 50, sex: 'male', lifespanTicks: 1e9 });
  w.addComponent<Health>(e, C_HEALTH, { value: hp, ill: false });
  w.addComponent(e, C_POSITION, { x, y });
  return e;
}

describe('battle magic — wards (M26 s2)', () => {
  it('an abjurer shields the neighbour in danger (a folk beside a predator)', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'abjuration', 3);
    const ally = plainFolk(w, 6, 5);     // beside the mage…
    predator(w, 7, 5);                   // …and beside a predator → endangered
    runMagicSystem(w, cfg, noRng);
    const ward = w.getComponent<Ward>(ally, C_WARD);
    expect(ward).toBeDefined();
    expect(ward!.soak).toBeGreaterThan(0);
    expect(ward!.expiresTick).toBeGreaterThan(100);
  });

  it('a ward adds armour-soak to the bearer in combat', () => {
    const w = mageWorld();
    const f = plainFolk(w, 5, 5);
    const before = combatantOf(w, f).armour ?? 0;
    w.addComponent<Ward>(f, C_WARD, { soak: 5, expiresTick: 200 });
    expect(combatantOf(w, f).armour ?? 0).toBe(before + 5);
  });

  it('an expired ward is swept even with no mages present', () => {
    const w = mageWorld(100);
    const stale = plainFolk(w, 1, 1); w.addComponent<Ward>(stale, C_WARD, { soak: 5, expiresTick: 50 });
    const fresh = plainFolk(w, 2, 2); w.addComponent<Ward>(fresh, C_WARD, { soak: 5, expiresTick: 200 });
    runMagicSystem(w, cfg, noRng);    // no mages in this world
    expect(w.hasComponent(stale, C_WARD)).toBe(false);
    expect(w.hasComponent(fresh, C_WARD)).toBe(true);
  });

  it('proactively shields a nearby fighter in peacetime — within reach, no danger (S140 visibility)', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'abjuration', 3);
    const fighter = plainFolk(w, 7, 5);                       // two tiles off — beyond touch, within WARD_RADIUS
    w.addComponent<Equipment>(fighter, C_EQUIPMENT, { weapon: 2, armour: 0 });   // armed → worth warding
    runMagicSystem(w, cfg, noRng);                            // no predator, no wounds anywhere
    expect(w.getComponent<Ward>(fighter, C_WARD)).toBeDefined();   // the abjurer's magic actually fires
  });

  it('does not waste a ward on an unarmed, unhurt, safe bystander', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'abjuration', 3);
    const bystander = plainFolk(w, 7, 5);                     // in reach but no danger, no wound, no arms
    runMagicSystem(w, cfg, noRng);
    expect(w.hasComponent(bystander, C_WARD)).toBe(false);
  });
});

describe('battle magic — curses (M26 s2)', () => {
  it('a maleficent mage hexes an adjacent beast', () => {
    const w = mageWorld();
    const m = castMage(w, 5, 5, 'maleficence', 3);
    const b = predator(w, 6, 5);
    runMagicSystem(w, cfg, noRng);
    const curse = w.getComponent<Curse>(b, C_CURSE);
    expect(curse).toBeDefined();
    expect(curse!.weaken).toBeGreaterThan(0);
    expect(w.isAlive(b)).toBe(true);                       // hexed, not slain (unlike a bolt)
    expect(w.getComponent<Magic>(m, C_MAGIC)!.mana).toBeLessThan(80);
  });

  it('hexes a beast two tiles off, not only one underfoot (S140 visibility)', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'maleficence', 3);
    const b = predator(w, 7, 5);                           // distance 2 — beyond touch, within CURSE_RADIUS
    runMagicSystem(w, cfg, noRng);
    expect(w.getComponent<Curse>(b, C_CURSE)).toBeDefined();
  });

  it('does not reach a beast beyond the curse radius (predation balance protected)', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'maleficence', 3);
    const far = predator(w, 9, 5);                         // distance 4 — out of reach
    runMagicSystem(w, cfg, noRng);
    expect(w.hasComponent(far, C_CURSE)).toBe(false);
  });

  it("a cursed beast's blows land softer — the folk it mauls keeps more health", () => {
    const setup = (cursed: boolean): number => {
      const w = mageWorld();
      const f = plainFolk(w, 5, 5);
      const b = predator(w, 6, 5);
      if (cursed) w.addComponent<Curse>(b, C_CURSE, { weaken: 0.5, expiresTick: 999 });
      runCombatSystem(w, cfg, () => 0);   // rng 0 → the beast always strikes and lands
      return w.getComponent<Health>(f, C_HEALTH)!.value;
    };
    const plain = setup(false);
    const hexed = setup(true);
    expect(plain).toBeLessThan(1);          // the beast did wound the folk
    expect(hexed).toBeGreaterThan(plain);   // …but a cursed beast wounds less
  });
});

// ── Summoning & weather (M26 s2b) ─────────────────────────────────────────────────────
function guardian(w: World, x: number, y: number, owner: number): EntityId {
  const e = w.createEntity();
  w.addComponent(e, C_POSITION, { x, y });
  w.addComponent<Health>(e, C_HEALTH, { value: 1, ill: false });
  w.addComponent<Special>(e, C_SPECIAL, {
    kind: 'guardian', name: 'a guardian', icon: 'guardian', behavior: 'guardian', owner,
    str: 12, dex: 12, con: 12, ferocity: 1.2, spawnTick: 0, despawnTick: 1e9,
  });
  return e;
}

describe('battle magic — summoning (M26 s2b)', () => {
  it('a summoning mage conjures one guardian, owned by the mage, for mana', () => {
    const w = mageWorld();
    const m = castMage(w, 5, 5, 'summoning', 3);
    runMagicSystem(w, cfg, noRng);
    const owned = () => w.query(C_SPECIAL).filter(g => w.getComponent<Special>(g, C_SPECIAL)!.owner === m);
    expect(owned().length).toBe(1);
    expect(w.getComponent<Special>(owned()[0], C_SPECIAL)!.behavior).toBe('guardian');
    expect(w.getComponent<Magic>(m, C_MAGIC)!.mana).toBeLessThan(80);
    // Casting again does not raise a second — one guardian per summoner at a time.
    w.getComponent<Magic>(m, C_MAGIC)!.mana = 80;
    runMagicSystem(w, cfg, noRng);
    expect(owned().length).toBe(1);
  });

  it('a summoned guardian smites an adjacent beast', () => {
    const w = mageWorld();
    guardian(w, 5, 5, 999);
    const b = predator(w, 6, 5);
    runSpecialAgentSystem(w, cfg, () => 0, content);
    expect(w.isAlive(b)).toBe(false);
  });

  it('a guardian fades when its time is up', () => {
    const w = mageWorld(500);
    const g = guardian(w, 5, 5, 999);
    w.getComponent<Special>(g, C_SPECIAL)!.despawnTick = 400;   // already past
    runSpecialAgentSystem(w, cfg, () => 0, content);
    expect(w.isAlive(g)).toBe(false);
  });
});

describe('battle magic — weather (M26 s2b)', () => {
  it('a druid calls weather that ripens nearby flora', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'druidry', 3);
    const fe = w.createEntity();
    w.addComponent<Flora>(fe, C_FLORA, { speciesId: 'g', name: 'Grass', color: '#0a0', maturity: 0.1, growthPerTick: 0, edibleAt: 0.5, foodYield: 1, spreadChancePerTick: 0 });
    w.addComponent(fe, C_POSITION, { x: 6, y: 5 });    // within the druid's reach
    runMagicSystem(w, cfg, noRng);
    expect(w.getComponent<Flora>(fe, C_FLORA)!.maturity).toBeGreaterThan(0.1);
  });

  it('weather does not reach distant flora', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'druidry', 3);
    const fe = w.createEntity();
    w.addComponent<Flora>(fe, C_FLORA, { speciesId: 'g', name: 'Grass', color: '#0a0', maturity: 0.1, growthPerTick: 0, edibleAt: 0.5, foodYield: 1, spreadChancePerTick: 0 });
    w.addComponent(fe, C_POSITION, { x: 15, y: 15 });  // far out of reach
    runMagicSystem(w, cfg, noRng);
    expect(w.getComponent<Flora>(fe, C_FLORA)!.maturity).toBe(0.1);
  });
});

// ── Magic items: enchanting (M26 s3) ──────────────────────────────────────────────────
describe('magic items — enchanting (M26 s3)', () => {
  it("an artificer imbues a neighbour's equipped weapon with a lasting enchantment", () => {
    const w = mageWorld();
    const m = castMage(w, 5, 5, 'artifice', 3);
    const f = plainFolk(w, 6, 5);
    w.addComponent<Equipment>(f, C_EQUIPMENT, { weapon: 3, armour: 0 });
    runMagicSystem(w, cfg, noRng);
    const ench = w.getComponent<Enchantment>(f, C_ENCHANTMENT);
    expect(ench).toBeDefined();
    expect(ench!.kind).toBe('weapon');
    expect(ench!.bonus).toBeGreaterThan(0);
    expect(ench!.by).toBe('Mage');
    expect(w.getComponent<Magic>(m, C_MAGIC)!.mana).toBeLessThan(80);
  });

  it('an artificer leaves an unarmed neighbour be (nothing to enchant)', () => {
    const w = mageWorld();
    castMage(w, 5, 5, 'artifice', 3);
    const f = plainFolk(w, 6, 5);            // no Equipment
    runMagicSystem(w, cfg, noRng);
    expect(w.hasComponent(f, C_ENCHANTMENT)).toBe(false);
  });

  it('an enchantment boosts the borne weapon in combat — but lends nothing if the item is gone', () => {
    const w = mageWorld();
    const armed = plainFolk(w, 5, 5);
    w.addComponent<Equipment>(armed, C_EQUIPMENT, { weapon: 3, armour: 0 });
    const before = combatantOf(w, armed).weapon ?? 0;
    w.addComponent<Enchantment>(armed, C_ENCHANTMENT, { kind: 'weapon', bonus: 4, school: 'Artifice', by: 'X' });
    expect(combatantOf(w, armed).weapon ?? 0).toBe(before + 4);
    // a bearer who carries no weapon gains no phantom keenness from the same enchantment
    const bare = plainFolk(w, 7, 7);
    w.addComponent<Enchantment>(bare, C_ENCHANTMENT, { kind: 'weapon', bonus: 4, school: 'Artifice', by: 'X' });
    expect(combatantOf(w, bare).weapon ?? 0).toBe(0);
  });

  it('death strips a folk\'s ward & enchantment (no magic lingers on a tombstone)', () => {
    const w = mageWorld();
    const f = plainFolk(w, 5, 5);
    w.addComponent<Ward>(f, C_WARD, { soak: 5, expiresTick: 9999 });
    w.addComponent<Enchantment>(f, C_ENCHANTMENT, { kind: 'weapon', bonus: 4, school: 'Artifice', by: 'X' });
    killAgent(w, f, 1000, 'old age', 1000);
    expect(w.hasComponent(f, C_WARD)).toBe(false);
    expect(w.hasComponent(f, C_ENCHANTMENT)).toBe(false);
    expect(w.hasComponent(f, C_TOMBSTONE)).toBe(true);
  });
});
