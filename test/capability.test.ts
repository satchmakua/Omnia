import { describe, it, expect } from 'vitest';
import { EFFECT_TAGS, isKnownEffectTag } from '../src/capability/effects.ts';
import { invokeCapability, canInvoke } from '../src/capability/invoke.ts';
import type { Capability } from '../src/content/schema.ts';
import type { Needs, Magic } from '../src/sim/components.ts';

// Helpers to build capabilities with the full (defaulted) shape.
const techForage: Capability = {
  id: 'forage', name: 'Forage', tradition: 'technology',
  prerequisites: { aptitude: false }, cost: { mana: 0, energy: 0 },
  effects: ['restore_hunger'], power: 0.4,
};
const magicMeal: Capability = {
  id: 'conjure_meal', name: 'Conjure Meal', tradition: 'magic',
  prerequisites: { aptitude: true }, cost: { mana: 18, energy: 0 },
  effects: ['restore_hunger'], power: 0.6,
};
const magicWithEnergyCost: Capability = {
  id: 'ritual', name: 'Ritual', tradition: 'magic',
  prerequisites: { aptitude: true }, cost: { mana: 5, energy: 0.2 },
  effects: ['restore_hunger'], power: 0.3,
};

function mage(mana = 100): Magic { return { mana, maxMana: 100, manaRegenPerTick: 0.04 }; }

describe('effect tags', () => {
  it('restore_hunger raises hunger by power, clamped to 1', () => {
    const needs: Needs = { hunger: 0.5, energy: 1, social: 1 };
    EFFECT_TAGS.restore_hunger({ needs, power: 0.3 });
    expect(needs.hunger).toBeCloseTo(0.8);
    EFFECT_TAGS.restore_hunger({ needs, power: 0.5 });
    expect(needs.hunger).toBe(1); // clamped
  });

  it('restore_energy raises energy by power, clamped to 1', () => {
    const needs: Needs = { hunger: 1, energy: 0.4, social: 1 };
    EFFECT_TAGS.restore_energy({ needs, power: 0.5 });
    expect(needs.energy).toBeCloseTo(0.9);
  });

  it('isKnownEffectTag reports known vs unknown', () => {
    expect(isKnownEffectTag('restore_hunger')).toBe(true);
    expect(isKnownEffectTag('restore_energy')).toBe(true);
    expect(isKnownEffectTag('teleport')).toBe(false);
  });
});

describe('canInvoke — prerequisites & cost', () => {
  it('technology has no aptitude gate', () => {
    expect(canInvoke(techForage, { needs: { hunger: 0.5, energy: 1, social: 1 } })).toBe(true);
  });

  it('magic requires aptitude (a Magic component)', () => {
    const needs: Needs = { hunger: 0.5, energy: 1, social: 1 };
    expect(canInvoke(magicMeal, { needs })).toBe(false);            // no aptitude
    expect(canInvoke(magicMeal, { needs, magic: mage() })).toBe(true);
  });

  it('magic requires enough mana', () => {
    const needs: Needs = { hunger: 0.5, energy: 1, social: 1 };
    expect(canInvoke(magicMeal, { needs, magic: mage(10) })).toBe(false); // < 18
    expect(canInvoke(magicMeal, { needs, magic: mage(20) })).toBe(true);
  });

  it('an energy cost requires enough energy', () => {
    expect(canInvoke(magicWithEnergyCost, { needs: { hunger: 1, energy: 0.1, social: 1 }, magic: mage() })).toBe(false);
    expect(canInvoke(magicWithEnergyCost, { needs: { hunger: 1, energy: 0.5, social: 1 }, magic: mage() })).toBe(true);
  });
});

describe('invokeCapability', () => {
  it('applies the default power and returns true on success (technology)', () => {
    const needs: Needs = { hunger: 0.1, energy: 1, social: 1 };
    expect(invokeCapability(techForage, { needs })).toBe(true);
    expect(needs.hunger).toBeCloseTo(0.5);
  });

  it('honours a caller-supplied power override', () => {
    const needs: Needs = { hunger: 0.1, energy: 1, social: 1 };
    invokeCapability(techForage, { needs }, 0.05);
    expect(needs.hunger).toBeCloseTo(0.15);
  });

  it('spends mana and applies the effect when a mage casts', () => {
    const needs: Needs = { hunger: 0.2, energy: 1, social: 1 };
    const m = mage(50);
    expect(invokeCapability(magicMeal, { needs, magic: m })).toBe(true);
    expect(m.mana).toBe(32);                 // 50 - 18
    expect(needs.hunger).toBeCloseTo(0.8);   // +0.6
  });

  it('returns false and changes nothing when prerequisites/cost are unmet', () => {
    const needs: Needs = { hunger: 0.2, energy: 1, social: 1 };
    expect(invokeCapability(magicMeal, { needs })).toBe(false);  // no aptitude
    expect(needs.hunger).toBe(0.2);                              // unchanged

    const m = mage(5);
    expect(invokeCapability(magicMeal, { needs, magic: m })).toBe(false); // too little mana
    expect(m.mana).toBe(5);                                     // unspent
    expect(needs.hunger).toBe(0.2);
  });

  it('deducts an energy cost', () => {
    const needs: Needs = { hunger: 0.5, energy: 0.9, social: 1 };
    const m = mage();
    invokeCapability(magicWithEnergyCost, { needs, magic: m });
    expect(needs.energy).toBeCloseTo(0.7); // 0.9 - 0.2
    expect(m.mana).toBe(95);               // 100 - 5
  });

  it('throws on an unimplemented effect tag (defensive)', () => {
    const bad: Capability = { ...techForage, effects: ['nonexistent'] };
    expect(() => invokeCapability(bad, { needs: { hunger: 0, energy: 1, social: 1 } }))
      .toThrowError(/unknown effect tag 'nonexistent'/);
  });
});
