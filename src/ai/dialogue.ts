// Conversations (M30-ish, requested). The town's small talk used to be one canned line flung at a
// neighbour with no reply. This generates a real *exchange* — an opener and a response (sometimes a
// rejoinder) — coloured by the speakers' MOODS and their RELATIONSHIP: warm partners, easy friends,
// weary folk who lean on each other, and rivals trading cold words. Skewed positive (most folk are
// content) but with real variance — gripes, worries, and frost among the cheer.
//
// Deterministic & replay-safe: every choice is a hash of a stable seed (entity ids + tick), so it
// consumes NO simulation RNG and reproduces identically — like the language generator. The generator
// itself is a pure function; the exchange's EFFECTS on the pair (mood, feud heat — M13 s2) are
// applied by the caller (AISystem.dialoguePass), where the sim state lives.

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

// ── The alignment voice (M13 s2): a soul's moral register colours its talk ──────────────
// About a third of an aligned speaker's openers (and replies) come from the NINE-CELL pool
// instead of the mood pool — so a Lawful Good neighbour and a Chaotic Evil one are heard,
// not just labelled. Rivals get their own register: nine ways to loathe someone.
export const ALIGN_OPEN: Record<string, readonly string[]> = {
  LG: ['Is your household well? Say the word if anything wants defending.', 'There is talk of wrongdoing about — keep to the honest path.',
    'I mean to see this town kept safe, whatever it asks of me.', 'A promise made is a promise kept. Remember I said so.'],
  NG: ['You look worn — sit, I will fetch you something.', 'If your stores run thin this winter, my door is open.',
    'Kindness costs little and buys much, I find.', 'Tell me truly — are you getting on all right?'],
  CG: ['Rules are for those who need them, friend — come, live a little.', 'I left the gate open on purpose. Let the chickens see the world.',
    'If the elders frown on it, it is probably worth doing.', 'Take the day off with me — the work will keep.'],
  LN: ['Everything in its place, I always say.', 'The old ways served our grandparents; they will serve us.',
    'A town keeps its rules or it keeps nothing.', 'I have done my part today. See that you do yours.'],
  TN: ['The seasons turn and we turn with them.', 'I take the days as they come, no more, no less.',
    'There is a balance in things, if you watch for it.', 'Neither the best of days nor the worst. That suits me.'],
  CN: ['I woke today and chose a different road entirely.', 'Plans! I make them just to watch them fall apart.',
    'Ask me tomorrow — I will be someone else by then.', 'Come on a whim with me. Any whim. Pick one.'],
  LE: ['You will recall what you owe me. I always do.', 'Order is such a useful thing — for those who hold the ledger.',
    'I keep every bargain to the letter. Mind the letter.', 'Serve me well and you will find me... predictable.'],
  NE: ['What is in it for me? There is always something in it.', 'I look after my own. The rest of you manage as you can.',
    'Sentiment is a luxury. I buy none of it.', 'If you are selling favours, I am not buying — I am collecting.'],
  CE: ['One day this town will learn what I am owed.', 'I dreamed of fire again. I rather liked it.',
    'The meek keep giving me their share. Sweet of them.', 'Cross me and find out. Please — find out.'],
};
export const ALIGN_RIVAL_OPEN: Record<string, readonly string[]> = {
  LG: ['I will not stoop to your level — but I will not step aside either.', 'Answer for what you did, and we are done.', 'Justice finds everyone. Even you.'],
  NG: ['I bear you no hatred. But I have not forgotten.', 'We could end this, you and I. You need only own it.', 'You hurt people I care for. That is between you and them.'],
  CG: ['You and your kind squeeze the joy from this town.', 'I do not need a magistrate to settle you.', 'Strut while you can.'],
  LN: ['We keep our distance. That is the arrangement.', 'You broke the custom between us. It stays broken.', 'I will be civil. Nothing more.'],
  TN: ['We are as we are, you and I. Leave it there.', 'No word of yours moves me either way.', 'The scale between us sits where it sits.'],
  CN: ['Ha! Still wearing that face, I see.', 'Today I cannot be bothered to despise you. Ask again tomorrow.', 'You are the dullest of my enemies.'],
  LE: ['Every debt is written down, and yours is long.', 'Patience is a collector’s virtue. I am very patient.', 'When the reckoning comes, it will be exact.'],
  NE: ['You have nothing I want today. Lucky you.', 'Keep your back to a wall, that is my advice.', 'I profit either way, you know.'],
  CE: ['One dark night, you and I will finish this.', 'I have imagined this meeting. It ends worse for you.', 'Smile while you still have the teeth for it.'],
};
export const ALIGN_REPLY: Record<string, readonly string[]> = {
  LG: ['Then let us do the right thing by it.', 'You have my word on it — and my word holds.', 'The town stands together, or not at all.'],
  NG: ['Bless you — and mind you look after yourself too.', 'If there is need, share it with me.', 'That is kindly said. Kindly meant, I hope.'],
  CG: ['Ha! Now that is the spirit.', 'Never let them fence you in, friend.', 'To freedom, then — and to supper.'],
  LN: ['As is proper.', 'So the custom holds. Good.', 'Let it be done in the right order.'],
  TN: ['So it goes, and so it balances.', 'Neither here nor there, I would say.', 'The wheel turns regardless.'],
  CN: ['Or — and hear me out — we could do something mad instead.', 'I agreed to nothing, remember.', 'Who knows! Not me, and I love it.'],
  LE: ['Noted. Everything is noted.', 'And what, precisely, do I gain?', 'We understand each other. How efficient.'],
  NE: ['That is your problem, not mine.', 'I will remember that — if it pays to.', 'Spare me the sentiment; state the favour.'],
  CE: ['Careful. I bite on less provocation than that.', 'How touching. I feel nothing.', 'Say it again and see what it costs you.'],
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
 * Build a short conversation (2 lines, sometimes 3) between two souls, coloured by their moods,
 * relationship, and — for the morally leaning — their ALIGNMENT (M13 s2): about a third of an
 * aligned speaker's lines come from their nine-cell moral register instead of the mood pool.
 * `seed` must be stable for a given exchange (e.g. ids + tick) so it replays identically.
 */
export interface Voice { name: string; mood: number; align?: string; }   // align: a nine-cell AlignKey
export function generateConversation(
  seed: string, a: Voice, b: Voice, rel: Relationship,
): Line[] {
  const ta = moodTone(a.mood, seed + '|ta'), tb = moodTone(b.mood, seed + '|tb');
  // The soul speaks (M13 s2): an aligned opener/reply, roughly a third of the time. True
  // Neutral counts too — balance has a voice of its own.
  const aPool = rel === 'rival' ? (a.align ? ALIGN_RIVAL_OPEN[a.align] : undefined) : (a.align ? ALIGN_OPEN[a.align] : undefined);
  const opener = aPool && hash(seed + '|ao') % 3 === 0 ? pick(aPool, seed + '|o') : pick(OPEN[rel][ta], seed + '|o');
  const reg = replyRegister(rel, ta, tb);
  const bPool = rel === 'rival' ? undefined : (b.align ? ALIGN_REPLY[b.align] : undefined);   // rival replies stay cold steel
  const reply = bPool && hash(seed + '|br') % 3 === 0 ? pick(bPool, seed + '|r') : pick(REPLY[reg], seed + '|r');

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
