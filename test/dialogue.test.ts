// The conversation generator — rich, mood- & relationship-aware back-and-forth, deterministic.
import { describe, it, expect } from 'vitest';
import { generateConversation } from '../src/ai/dialogue.ts';

const A = { name: 'Mira', mood: 0.9 };
const B = { name: 'Korga', mood: 0.9 };

describe('generateConversation (M29-ish: real exchanges)', () => {
  it('produces a back-and-forth — opener then reply, alternating speakers', () => {
    const lines = generateConversation('1.2.1000', A, B, 'friend');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0].speaker).toBe('Mira');
    expect(lines[1].speaker).toBe('Korga');
    expect(lines[0].text.length).toBeGreaterThan(0);
    expect(lines[1].text.length).toBeGreaterThan(0);
  });

  it('is deterministic — same seed → identical exchange', () => {
    expect(generateConversation('7.9.500', A, B, 'friend'))
      .toEqual(generateConversation('7.9.500', A, B, 'friend'));
  });

  it('different seeds give variety (not all the same line)', () => {
    const openers = new Set(
      Array.from({ length: 20 }, (_, i) => generateConversation(`${i}.x.${i}`, A, B, 'friend')[0].text));
    expect(openers.size).toBeGreaterThan(3);   // a real spread, not one canned line
  });

  it('rivals trade cold words; friends do not', () => {
    const rivals = generateConversation('3.4.10', A, B, 'rival');
    expect(rivals.every(l => l.sentiment === 'cold')).toBe(true);
    const friends = generateConversation('3.4.10', A, B, 'friend');
    expect(friends.some(l => l.sentiment !== 'cold')).toBe(true);
  });

  it('mood colours the tone — the low-spirited always speak low; the bright skew warm but vary', () => {
    // a miserable soul's talk is consistently low
    for (let i = 0; i < 10; i++) {
      expect(generateConversation(`${i}.x.${i}`, { name: 'Sad', mood: 0.2 }, { name: 'Pal', mood: 0.2 }, 'friend')[0].sentiment).toBe('low');
    }
    // a content soul's talk is mostly warm, but with off-moments (variance the town needs)
    const sents = Array.from({ length: 30 }, (_, i) =>
      generateConversation(`${i}.y.${i}`, { name: 'Joy', mood: 0.95 }, { name: 'Pal', mood: 0.95 }, 'friend')[0].sentiment);
    expect(sents.filter(s => s === 'warm').length).toBeGreaterThan(sents.length * 0.5);   // skewed positive
    expect(new Set(sents).size).toBeGreaterThan(1);                                        // but not monotone
  });
});
