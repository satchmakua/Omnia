// A bounded log of recent CONVERSATIONS — the back-and-forth exchanges folk have when they stand
// together (AISystem dialoguePass). Distinct from the EventLog ticker (single lines mixed with
// births/deaths): here each record is a whole little exchange, so the Conversation tab can show a
// real dialogue — who said what, to whom, in turn. A pure render-facing read; bounded ring buffer.
import type { World } from '../sim/ecs.ts';
import { C_CONVOLOG } from '../sim/components.ts';
import type { Line } from '../ai/dialogue.ts';

export interface ConversationRecord {
  tick: number;
  participants: [string, string];   // the two souls, for the header
  rel: 'partner' | 'friend' | 'rival';
  lines: Line[];                     // the exchange, in order
}

export interface ConversationLogData {
  records: ConversationRecord[];
  cap: number;
}

export function createConversationLog(cap = 60): ConversationLogData {
  return { records: [], cap };
}

export function logConversation(world: World, rec: ConversationRecord): void {
  const ents = world.query(C_CONVOLOG);
  if (!ents.length) return;
  const log = world.getComponent<ConversationLogData>(ents[0], C_CONVOLOG)!;
  log.records.push(rec);
  if (log.records.length > log.cap) log.records.shift();
}

// Most recent conversations first.
export function recentConversations(log: ConversationLogData, n: number): ConversationRecord[] {
  return log.records.slice(-n).reverse();
}
