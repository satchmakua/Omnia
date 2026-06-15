// The default AIProvider: a deterministic, offline stand-in for a language model.
// It reads the themes present in a reflection prompt (the agent's memories) and
// synthesises a belief from them. Same prompt → same belief, always — so the sim
// stays fully reproducible and runs with no model, network, or Ollama installed.
import type { AIProvider } from './provider.ts';
import { hashString, embedText } from './provider.ts';

// theme keyword → candidate belief phrasings (chosen deterministically by hash).
const BELIEFS: Record<string, string[]> = {
  family: ['treasures family above all', 'lives for their kin', 'finds meaning in their children'],
  grief:  ['carries old grief quietly', 'has learned that all things pass', 'guards their heart against loss'],
  love:   ['believes in devotion', 'is warmed by companionship', 'holds love a steadying force'],
  frailty:['fears sickness', 'knows the body is fragile', 'is grateful for each well day'],
  labor:  ['takes pride in honest work', 'measures worth in a day’s labour', 'trusts diligence over luck'],
  magic:  ['suspects the world is stranger than it seems', 'feels the old arts stir within', 'wonders at their gift'],
  quiet:  ['keeps their own counsel', 'finds peace in the ordinary', 'watches the seasons turn'],
};

const THEME_KEYWORDS: [string, string[]][] = [
  ['family', ['born', 'child', 'children', 'kin']],
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
    const theme = dominantTheme(prompt);
    const options = BELIEFS[theme] ?? BELIEFS.quiet;
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
