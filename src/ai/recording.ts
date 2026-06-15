// Recording & replay of LLM responses (ARCHITECTURE determinism rule). Every
// response is written to a singleton log keyed by a hash of its prompt; a replay
// uses RecordedProvider, which returns the recorded text for each prompt — so a
// run reproduces exactly even though live generation varies.
import type { World } from '../sim/ecs.ts';
import { C_AIRECORD } from '../sim/components.ts';
import type { AIRecord } from '../sim/components.ts';
import type { AIProvider } from './provider.ts';
import { hashString, embedText } from './provider.ts';

export function recordResponse(world: World, tick: number, key: number, response: string): void {
  const ents = world.query(C_AIRECORD);
  if (ents.length === 0) return;
  world.getComponent<AIRecord>(ents[0], C_AIRECORD)!.entries.push({ tick, key, response });
}

// Replays a prior run's responses: for each prompt, returns what was recorded.
export class RecordedProvider implements AIProvider {
  readonly name = 'recorded';
  private readonly byKey = new Map<number, string>();

  constructor(record: AIRecord) {
    for (const e of record.entries) this.byKey.set(e.key, e.response);
  }

  completeSync(prompt: string): string {
    return this.byKey.get(hashString(prompt)) ?? '';
  }
  complete(prompt: string): Promise<string> {
    return Promise.resolve(this.completeSync(prompt));
  }
  embed(text: string): number[] {
    return embedText(text);
  }
}
