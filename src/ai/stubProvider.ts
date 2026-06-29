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
    const table = TABLES[promptMode(prompt)];
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
