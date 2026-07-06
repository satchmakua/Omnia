// The default AIProvider: a deterministic, offline stand-in for a language model.
// It reads the themes present in a prompt (the agent's memories) and synthesises a
// fitting line — a belief, a dream, a spoken line, or a resolution, depending on the
// prompt's register. Same prompt → same line, always — so the sim stays fully
// reproducible and runs with no model, network, or Ollama installed.
import type { AIProvider } from './provider.ts';
import { hashString, embedText } from './provider.ts';

type Mode = 'belief' | 'dream' | 'say' | 'decide';

// theme keyword → candidate phrasings per mode (chosen deterministically by hash).
const BELIEFS: Record<string, string[]> = {
  family: ['treasures family above all', 'lives for their kin', 'finds meaning in their family',
    'believes blood is the truest bond', 'would give anything for their own', 'holds that a house full of voices is wealth'],
  grief:  ['carries old grief quietly', 'has learned that all things pass', 'guards their heart against loss',
    'has made a kind of peace with sorrow', 'believes the dead are not wholly gone', 'knows joy and grief are kin'],
  love:   ['believes in devotion', 'is warmed by companionship', 'holds love a steadying force',
    'trusts that two endure what one cannot', 'thinks tenderness the rarest courage', 'believes a shared life is the only one worth living'],
  frailty:['fears sickness', 'knows the body is fragile', 'is grateful for each well day',
    'has learned not to waste a sound morning', 'treats health as the quiet fortune it is', 'no longer takes a steady breath for granted'],
  labor:  ['takes pride in honest work', 'measures worth in a day’s labour', 'trusts diligence over luck',
    'believes idle hands sour the spirit', 'holds that what is built well outlasts its builder', 'reckons a callus more honest than a coin'],
  magic:  ['suspects the world is stranger than it seems', 'feels the old arts stir within', 'wonders at their gift',
    'believes the fallen world left secrets behind', 'senses a pattern others cannot', 'half-fears what they might become'],
  quiet:  ['keeps their own counsel', 'finds peace in the ordinary', 'watches the seasons turn',
    'believes contentment is its own kind of riches', 'asks little of the world and is seldom disappointed', 'finds the small days the sweetest'],
};

const DREAMS: Record<string, string[]> = {
  family: ['dreamed of small hands reaching up', 'dreamed of a full table and many voices', 'dreamed their children grown and well',
    'dreamed of a lullaby half-remembered', 'dreamed the whole family walked a green road together'],
  grief:  ['dreamed of a familiar face fading into mist', 'dreamed of an empty chair by the fire', 'dreamed of footsteps that never arrived',
    'dreamed they spoke once more with the departed', 'dreamed of a name they could not bring themselves to call'],
  love:   ['dreamed of a warm hand in theirs', 'dreamed of a wedding beneath strange stars', 'dreamed of never being alone',
    'dreamed of two shadows merging into one', 'dreamed of a vow whispered and kept'],
  frailty:['dreamed of running, light and unafraid', 'dreamed the fever broke like a tide', 'dreamed of clean breath and steady limbs',
    'dreamed of a body that never failed them', 'dreamed they outran the thing that chased them'],
  labor:  ['dreamed of a field that harvested itself', 'dreamed of a tower they had built touching the clouds', 'dreamed their hands had turned to gold',
    'dreamed of a workshop that never went quiet', 'dreamed the whole town raised a roof in a single day'],
  magic:  ['dreamed of lights dancing just out of reach', 'dreamed the old ruins spoke their name', 'dreamed of power coiled like a sleeping snake',
    'dreamed of a door in the air, just ajar', 'dreamed they read a language no one living knows'],
  quiet:  ['dreamed of a slow river and a low sun', 'dreamed of an ordinary, perfect afternoon', 'dreamed of nothing they could name',
    'dreamed of rain on a warm roof', 'dreamed of a road that simply went on, pleasantly'],
};

const SAYINGS: Record<string, string[]> = {
  family: ['How are the little ones?', 'Our family is everything to me.', 'Stay close — kin is all we have.'],
  grief:  ['I think of those we lost.', 'We carry them with us still.', 'Some days the absence is heavy.'],
  love:   ['I am glad to have you near.', 'You steady me, you know.', 'There is no one I would rather see.'],
  frailty:['Mind your health in this air.', 'I am only glad to be on my feet.', 'These old bones complain, but I endure.'],
  labor:  ['It has been a long day’s work.', 'Honest toil keeps the dark off.', 'There is always more to be done.'],
  magic:  ['The old arts stir again.', 'Did you feel that? Something shifted.', 'The world is stranger than it lets on.'],
  quiet:  ['A fine, quiet day.', 'Good to share a moment.', 'The seasons turn, as ever.'],
};

const RESOLVES: Record<string, string[]> = {
  family: ['vowed to put family above all else', 'resolved to keep their kin safe', 'swore to give their kin a better life',
    'resolved that no child of theirs would go without', 'vowed to be the one their family could lean on'],
  grief:  ['resolved to carry on for those who could not', 'vowed never to forget', 'chose to live well in their memory',
    'resolved to let the grief make them gentler, not harder', 'swore the loss would not be the end of them'],
  love:   ['resolved to build a life together', 'swore to stay by their side', 'chose devotion over doubt',
    'resolved to say the tender things while there is time', 'vowed to grow old beside them'],
  frailty:['resolved to live while there is time', 'vowed to guard their health', 'chose to seize each well day',
    'resolved to waste no more good mornings', 'swore to mend, and to help others mend'],
  labor:  ['resolved to build something lasting', 'vowed to work for a better lot', 'chose diligence over despair',
    'resolved to leave the town better than they found it', 'swore their hands would make something worth keeping'],
  magic:  ['resolved to master the gift within', 'vowed to seek out the old arts', 'chose to follow where the power led',
    'resolved to use the gift for good, not for fear', 'swore to learn what the fallen world forgot'],
  quiet:  ['resolved to take each day as it comes', 'chose contentment in small things', 'vowed to keep their own counsel',
    'resolved to need less and notice more', 'swore to find the good in an ordinary day'],
};

// ── The alignment voice (M13 s2) ─────────────────────────────────────────────────────
// Nine-cell pools: when a prompt carries the soul cue ("Their soul leans lawful good."),
// about half an aligned soul's lines speak in its MORAL register rather than its life-theme —
// a Lawful Good dream is not a Chaotic Evil one. Chosen by hash (deterministic, replay-safe).
// The cue is embedded by memory.ts's builders, so a live model conditions on the same words.
const ALIGN_DREAMS: Record<string, string[]> = {
  LG: ['dreamed of a city where no door needed locks', 'dreamed of holding a shield over sleeping children',
    'dreamed of courts where every wrong was righted', 'dreamed of a bright order to things, and their place in it',
    'dreamed of walls they built standing long after them'],
  NG: ['dreamed of strangers fed at their own table', 'dreamed of binding a stranger’s wound',
    'dreamed of a harvest shared out to the last measure', 'dreamed of lifting someone from a river, laughing with relief',
    'dreamed of a town where no one went without'],
  CG: ['dreamed of tearing down a fence and planting flowers in the gap', 'dreamed of flying low over the fields, whooping',
    'dreamed of freeing caged birds by the hundred', 'dreamed of a feast with no head of table',
    'dreamed of roads that went everywhere and belonged to no one'],
  LN: ['dreamed of scales that balanced to the grain', 'dreamed of a ledger where every line came true',
    'dreamed of the seasons keeping perfect time', 'dreamed of an oath carved in standing stone',
    'dreamed of a procession that never missed a step'],
  TN: ['dreamed of a still pond that held the whole sky', 'dreamed of standing at the exact centre of a turning wheel',
    'dreamed of weighing two stones and finding them equal', 'dreamed of a river neither rising nor falling',
    'dreamed of two armies laying down arms, owing neither'],
  CN: ['dreamed of dice that never landed', 'dreamed of changing shape with every step',
    'dreamed of a map that redrew itself nightly', 'dreamed of dancing on a rooftop in a storm',
    'dreamed of a door to anywhere, and no reason to choose'],
  LE: ['dreamed of a throne built from every debt owed them', 'dreamed of the whole town signing their book',
    'dreamed of an iron law with their name on it', 'dreamed of servants who never met their eyes',
    'dreamed of collecting the last coin of a long contract'],
  NE: ['dreamed of a purse that filled as their neighbour’s emptied', 'dreamed of eating well behind a locked door while it rained',
    'dreamed of being owed favours by everyone worth knowing', 'dreamed of watching a rival stumble and feeling only warmth',
    'dreamed of a ladder pulled up after them'],
  CE: ['dreamed of the town alight, and themselves laughing', 'dreamed of teeth — their own — growing longer',
    'dreamed of a storm that spared only them', 'dreamed of every slight repaid a hundredfold',
    'dreamed of a world with nothing left to tell them no'],
};
const ALIGN_BELIEFS: Record<string, string[]> = {
  LG: ['believes order exists to shelter the weak', 'holds that a promise kept is the truest prayer',
    'believes right must be done even when it costs', 'trusts that good laws make good neighbours'],
  NG: ['believes kindness is never wasted', 'holds that everyone deserves a second chance',
    'believes a full table should be shared', 'trusts that small mercies mend the world'],
  CG: ['believes no rule outranks a conscience', 'holds that freedom is the first kindness',
    'believes rules bend where people matter', 'trusts the open road over the high wall'],
  LN: ['believes the law is owed, liked or not', 'holds that order outlasts intention',
    'believes a thing done properly is done once', 'trusts custom over cleverness'],
  TN: ['believes all things find their balance', 'holds that neither pan of a scale is holy',
    'believes the middle road wears best', 'trusts the turning of the seasons over any creed'],
  CN: ['believes tomorrow owes today nothing', 'holds that plans are just guesses in good clothes',
    'believes whim is as good a compass as any', 'trusts luck more than ledgers'],
  LE: ['believes power kept in order is power kept', 'holds that fear collects better than kindness',
    'believes every favour is a debt to be called', 'trusts the contract, never the man'],
  NE: ['believes charity begins and ends at home', 'holds that the world takes, so take first',
    'believes soft hearts make thin purses', 'trusts no one who works for free'],
  CE: ['believes the strong owe the weak nothing', 'holds that ruin is honester than order',
    'believes wanting a thing is claim enough', 'trusts appetite over argument'],
};
const ALIGN_RESOLVES: Record<string, string[]> = {
  LG: ['swore to guard the weak while they draw breath', 'resolved to right what wrongs they can reach',
    'vowed to hold the line others retreat from', 'resolved to serve the town before themselves'],
  NG: ['resolved to help whoever crosses their path in need', 'vowed to share what fortune grants',
    'chose gentleness, again, whatever it costs', 'resolved to leave every soul a little better off'],
  CG: ['vowed to answer to their conscience alone', 'resolved to break any rule that cages a friend',
    'chose the open road and the open hand', 'swore no law would make them cruel'],
  LN: ['resolved to keep every word they give', 'vowed to do their duty to the letter',
    'chose the old ways, tested and true', 'resolved to bring order where they stand'],
  TN: ['resolved to keep their balance whatever tips', 'vowed to take the middle way',
    'chose to watch, and weigh, and then decide', 'resolved to let the seasons set the pace'],
  CN: ['resolved to follow the next whim wholeheartedly', 'vowed nothing, and meant it',
    'chose to let the wind pick the way', 'resolved to be surprised by their own life'],
  LE: ['resolved to collect every debt owed them', 'vowed to climb, whoever serves as rungs',
    'chose fear over affection — it keeps better', 'resolved to bind their betters with their own rules'],
  NE: ['resolved to look after their own hide first', 'vowed to give nothing they cannot bill',
    'chose the sure coin over the kind word', 'resolved to be owed, never owing'],
  CE: ['swore to repay every slight with interest', 'resolved to take what the timid leave unguarded',
    'vowed to bow to no one and break what bows them', 'chose ruin for their rivals, and said so smiling'],
};
/** The alignment-voiced pools, exported for content-coverage tests. */
export const ALIGN_TABLES: Readonly<Partial<Record<Mode, Record<string, string[]>>>> = {
  dream: ALIGN_DREAMS, belief: ALIGN_BELIEFS, decide: ALIGN_RESOLVES,
};

const ALIGN_NAME_TO_KEY: Record<string, string> = {
  'lawful good': 'LG', 'neutral good': 'NG', 'chaotic good': 'CG',
  'lawful neutral': 'LN', 'true neutral': 'TN', 'chaotic neutral': 'CN',
  'lawful evil': 'LE', 'neutral evil': 'NE', 'chaotic evil': 'CE',
};
// The soul cue a prompt may carry (embedded by memory.ts's soulCue) → the nine-cell key.
function soulKey(prompt: string): string | null {
  const m = prompt.toLowerCase().match(/soul leans ([a-z]+ [a-z]+)/);
  return m ? (ALIGN_NAME_TO_KEY[m[1]] ?? null) : null;
}

const TABLES: Record<Mode, Record<string, string[]>> = {
  belief: BELIEFS, dream: DREAMS, say: SAYINGS, decide: RESOLVES,
};

// Which register a prompt is asking for, keyed off the cue word the builders embed.
function promptMode(prompt: string): Mode {
  const p = prompt.toLowerCase();
  if (p.includes('dream')) return 'dream';
  if (p.includes('resolve')) return 'decide';
  if (p.includes('say to')) return 'say';
  return 'belief';
}

// `family` is keyed on having KIN of one's own (a child born / lost) — NOT on 'born'
// alone, which also matches an agent's *own* birth ("was born to X"); a newborn must not
// reflect as if it had children. So the family theme only fires from genuine parenthood.
const THEME_KEYWORDS: [string, string[]][] = [
  ['family', ['child', 'children', 'kin']],
  ['grief',  ['died', 'lost', 'passed', 'grief', 'buried']],
  ['love',   ['wed', 'married', 'partner', 'love']],
  ['frailty',['ill', 'sick', 'fever', 'frail']],
  ['labor',  ['work', 'labour', 'job', 'mine', 'harvest']],
  ['magic',  ['conjured', 'mended', 'mana', 'spell', 'magic']],
];

function dominantTheme(prompt: string): string {
  const p = prompt.toLowerCase();
  let bestTheme = 'quiet', bestCount = 0;
  for (const [theme, words] of THEME_KEYWORDS) {
    let count = 0;
    for (const w of words) {
      let idx = p.indexOf(w);
      while (idx !== -1) { count++; idx = p.indexOf(w, idx + w.length); }
    }
    if (count > bestCount) { bestCount = count; bestTheme = theme; }
  }
  return bestTheme;
}

export class StubProvider implements AIProvider {
  readonly name = 'stub';

  completeSync(prompt: string): string {
    const mode = promptMode(prompt);
    // The alignment voice (M13 s2): an aligned soul speaks about half its lines in its own
    // moral register — the rest still follow the life-themes, so identity and biography mix.
    const key = soulKey(prompt);
    const aligned = key ? ALIGN_TABLES[mode]?.[key] : undefined;
    if (aligned && hashString(prompt + '|soul') % 2 === 0) {
      return aligned[hashString(prompt) % aligned.length];
    }
    const table = TABLES[mode];
    const theme = dominantTheme(prompt);
    const options = table[theme] ?? table.quiet;
    return options[hashString(prompt) % options.length];
  }

  complete(prompt: string): Promise<string> {
    return Promise.resolve(this.completeSync(prompt));
  }

  embed(text: string): number[] {
    return embedText(text);
  }
}

export const stubProvider = new StubProvider();
