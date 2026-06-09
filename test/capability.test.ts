import { describe, it, expect } from 'vitest';
import { EFFECT_TAGS, isKnownEffectTag } from '../src/capability/effects.ts';
import { invokeCapability } from '../src/capability/invoke.ts';
import type { Capability } from '../src/content/schema.ts';
import type { Needs } from '../src/sim/components.ts';

describe('effect tags', () => {
  it('restore_hunger raises hunger by power, clamped to 1', () => {
    const needs: Needs = { hunger: 0.5, energy: 1 };
    EFFECT_TAGS.restore_hunger({ needs, power: 0.3 });
    expect(needs.hunger).toBeCloseTo(0.8);

    EFFECT_TAGS.restore_hunger({ needs, power: 0.5 });
    expect(needs.hunger).toBe(1); // clamped
  });

  it('isKnownEffectTag reports known vs unknown', () => {
    expect(isKnownEffectTag('restore_hunger')).toBe(true);
    expect(isKnownEffectTag('teleport')).toBe(false);
  });
});

describe('invokeCapability', () => {
  const forage: Capability = {
    id: 'forage', name: 'Forage', tradition: 'technology',
    effects: ['restore_hunger'], power: 0.4,
  };

  it('applies the capability default power when none is given', () => {
    const needs: Needs = { hunger: 0.1, energy: 1 };
    invokeCapability(forage, { needs });
    expect(needs.hunger).toBeCloseTo(0.5);
  });

  it('honours a caller-supplied power override', () => {
    const needs: Needs = { hunger: 0.1, energy: 1 };
    invokeCapability(forage, { needs }, 0.05);
    expect(needs.hunger).toBeCloseTo(0.15);
  });

  it('throws on an unimplemented effect tag (defensive)', () => {
    const bad: Capability = { ...forage, effects: ['nonexistent'] };
    expect(() => invokeCapability(bad, { needs: { hunger: 0, energy: 1 } }))
      .toThrowError(/unknown effect tag 'nonexistent'/);
  });
});
