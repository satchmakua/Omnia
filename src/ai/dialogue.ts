// Conversations (M30-ish, requested). The town's small talk used to be one canned line flung at a
// neighbour with no reply. This generates a real *exchange* — an opener and a response (sometimes a
// rejoinder) — coloured by the speakers' MOODS and their RELATIONSHIP: warm partners, easy friends,
// weary folk who lean on each other, and rivals trading cold words. Skewed positive (most folk are
// content) but with real variance — gripes, worries, and frost among the cheer.
//
// Deterministic & replay-safe: every choice is a hash of a stable seed (entity ids + tick), so it
// consumes NO simulation RNG and reproduces identically — like the language generator. Pure flavour;
// nothing here feeds the trajectory.

export interface Line { speaker: string; text: string; sentiment: 'warm' | 'neutral' | 'low' | 'cold'; }
export type Relationship = 'partner' | 'friend' | 'rival';
type Tone = 'bright' | 'level' | 'low';

// A small, fast string hash → a stable value, so the same seed always picks the same thing.
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;   // avalanche: spread the bits so `% n` is fair
  return h >>> 0;
}
function pick<T>(pool: readonly T[], seed: string): T {
  return pool[hash(seed) % pool.length];
}

// Mood sets the baseline tone, but a soul has off-moments — ~a quarter of exchanges come out a notch
// more subdued than mood alone, so the town's talk has real variety (gripes & quiet among the cheer),
// not one warm note. Still skewed positive: most talk follows the (generally content) mood.
function moodTone(mood: number, seed: string): Tone {
  let t: Tone = mood >= 0.78 ? 'bright' : mood >= 0.5 ? 'level' : 'low';
  if (hash(seed + '|j') % 4 === 0) t = t === 'bright' ? 'level' : 'low';   // an off-moment
  return t;
}

// ── Openers: what the initiator says, by relationship × tone (topics mixed in for variety) ──
const OPEN: Record<Relationship, Record<Tone, readonly string[]>> = {
  partner: {
    bright: [
      'There you are — I was hoping to find you.', 'You make the long days lighter, you know.',
      'Come, sit with me a while.', 'I thought of you all morning.', 'How I love a quiet evening with you.',
      'Did you eat? You always forget to eat.', 'The little ones take after you — stubborn and lovely.',
    ],
    level: [
      'Busy day?', 'The roof wants mending before the rains.', 'I saw your kin at the well.',
      'We should set something by for winter.', 'Long shift again?', 'The market was thin today.',
    ],
    low: [
      'I am worn through, love. Forgive me.', 'Some days the weight of it all...', 'Stay close tonight, would you?',
      'I worry for us, if I am honest.', 'I have not the heart for much today.',
    ],
  },
  friend: {
    bright: [
      'Well met! Good to see your face.', 'You will not believe what I heard.', 'Come, share a moment with me.',
      'A fine day, is it not?', 'How is your lot these days?', 'Ha — just the soul I wanted to see.',
      'There is bread to spare, if you are hungry.', 'The harvest looks kind this year.',
      'My feet are done — rest with me.',
    ],
    level: [
      'How goes the work?', 'Heard any news worth telling?', 'The season turns early, I think.',
      'Same as ever, I suppose.', 'Long road today.', 'Have you seen the price of grain?',
      'They say the elders are quarrelling again.',
    ],
    low: [
      'Long day. I am worn to the bone.', 'Some days weigh more than others, friend.', 'I do not know... it has been hard.',
      'Do not mind me. Just tired.', 'I had a black night of it.', 'Trouble follows me lately, it seems.',
      'I could use a kind word, in truth.',
    ],
  },
  rival: {
    bright: ['Well. Look who it is.', 'You have a nerve, showing your face.', 'Keep walking.'],
    level: ['I have nothing to say to you.', 'Mind your distance.', 'We are not friends, you and I.', 'Do not test me.'],
    low: ['Have you not done enough?', 'I have not forgotten. I never will.', 'Leave me be — for both our sakes.'],
  },
};

// ── Replies: the listener's response, by register ──
const REPLY: Record<string, readonly string[]> = {
  warm: [
    'Aye, and gladly. It is good to see you.', 'You always know what to say.', 'Couldn’t have put it better.',
    'Rest then — you have earned it.', 'My heart is the lighter for it.', 'Bless you for that.',
    'Then let us make a good day of it.', 'I am glad of your company, truly.',
  ],
  cheerful: [
    'Ha! Tell me everything.', 'Now there is good news.', 'That is the spirit!', 'You always lift me up.',
    'Then the day is looking up.', 'Go on, do not keep me waiting!',
  ],
  sympathetic: [
    'I know the feeling. It passes, it always does.', 'Sit — you do not have to carry it alone.',
    'Hard times do not last, friend.', 'Lean on me a while, then.', 'You will come through it. You always do.',
    'Say no more — I am here.',
  ],
  neutral: [
    'So it goes.', 'Much the same with me.', 'Aye, well. We manage.', 'Such is the season.',
    'Cannot argue with that.', 'We shall see how it falls.', 'Time will tell.',
  ],
  down: [
    'I wish I could say it will be fine.', 'We are all a bit frayed, I think.', 'Don’t I know it.',
    'Do not lose heart entirely.', 'These are lean days for everyone.', 'I have no comfort to spare today, I am sorry.',
  ],
  cold: [
    'The feeling is mutual.', 'Then we are agreed — nothing.', 'Do not tempt me.', 'Gladly. Out of my sight.',
    'Say that again and see what comes of it.', 'You will get no peace from me.',
  ],
};

// Which reply register fits, given the relationship and both tones.
function replyRegister(rel: Relationship, openerTone: Tone, replierTone: Tone): keyof typeof REPLY {
  if (rel === 'rival') return 'cold';
  if (openerTone === 'low') return replierTone === 'low' ? 'down' : 'sympathetic';
  if (replierTone === 'bright') return openerTone === 'bright' ? 'cheerful' : 'warm';
  if (replierTone === 'low') return 'down';
  return 'neutral';
}

const sentimentOf = (rel: Relationship, t: Tone): Line['sentiment'] =>
  rel === 'rival' ? 'cold' : t === 'low' ? 'low' : t === 'bright' ? 'warm' : 'neutral';

/**
 * Build a short conversation (2 lines, sometimes 3) between two souls, coloured by their moods and
 * relationship. `seed` must be stable for a given exchange (e.g. ids + tick) so it replays identically.
 */
export function generateConversation(
  seed: string, a: { name: string; mood: number }, b: { name: string; mood: number }, rel: Relationship,
): Line[] {
  const ta = moodTone(a.mood, seed + '|ta'), tb = moodTone(b.mood, seed + '|tb');
  const opener = pick(OPEN[rel][ta], seed + '|o');
  const reg = replyRegister(rel, ta, tb);
  const reply = pick(REPLY[reg], seed + '|r');

  const lines: Line[] = [
    { speaker: a.name, text: opener, sentiment: sentimentOf(rel, ta) },
    { speaker: b.name, text: reply, sentiment: rel === 'rival' ? 'cold' : reg === 'down' ? 'low' : reg === 'sympathetic' || reg === 'neutral' ? 'neutral' : 'warm' },
  ];

  // ~⅓ of the time the initiator rounds it off — a rejoinder, so some talks run a beat longer.
  if (rel !== 'rival' && (seed.charCodeAt(0) + seed.length) % 3 === 0) {
    const closer = pick(CLOSERS[ta], seed + '|c');
    lines.push({ speaker: a.name, text: closer, sentiment: sentimentOf(rel, ta) });
  }
  return lines;
}

const CLOSERS: Record<Tone, readonly string[]> = {
  bright: ['Until next time, then.', 'Go well, friend.', 'You have made my day the brighter.', 'Mind how you go!'],
  level: ['Anyway. Best get on.', 'I will let you to it.', 'We will talk again.', 'Take care of yourself.'],
  low: ['...thank you for listening.', 'I had better rest.', 'It helps, talking. It does.', 'Tomorrow is another day, I suppose.'],
};
