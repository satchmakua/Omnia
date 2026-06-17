// Compress the dead (M7 slice 5, D12 rule 5). Each era, a culture with no living
// members — and a tongue no living culture speaks — is marked **extinct** and kept as
// a compact descent record (it stays in the family tree, like a tombstone). When the
// stores grow past a cap, the oldest fully-dead side-branches (not ancestors of any
// living lineage) are pruned, so object counts stay bounded across deep time.
import { C_AGENT } from '../sim/components.ts';
import type { World } from '../sim/ecs.ts';
import type { Agent } from '../sim/components.ts';
import type { SimConfig } from '../sim/config.ts';
import type { CultureStoreData } from './cultureStore.ts';
import type { LanguageStoreData } from '../lang/languageStore.ts';
import { emitEvent } from '../history/eventlog.ts';
import { chronicleAdd } from '../history/chronicle.ts';
import type { ChronicleData } from '../history/chronicle.ts';

export function compressLineages(
  world: World, cstore: CultureStoreData, lstore: LanguageStoreData,
  cfg: SimConfig, tick: number, chronicle: ChronicleData | undefined,
): void {
  // Living members per culture, and living speakers per tongue.
  const members = new Map<string, number>();
  for (const e of world.query(C_AGENT)) {
    const cid = world.getComponent<Agent>(e, C_AGENT)!.cultureId;
    if (cid) members.set(cid, (members.get(cid) ?? 0) + 1);
  }
  const speakers = new Map<string, number>();
  for (const c of Object.values(cstore.byId)) {
    speakers.set(c.language, (speakers.get(c.language) ?? 0) + (members.get(c.id) ?? 0));
  }

  // A daughter culture that died out — recorded as a legend.
  for (const c of Object.values(cstore.byId)) {
    if (!c.extinct && (members.get(c.id) ?? 0) === 0) {
      c.extinct = true; c.diedTick = tick;
      if (c.parent) {
        emitEvent(world, 'culture', `The ${c.name} faded — its folk are gone.`);
        if (chronicle) {
          chronicleAdd(chronicle, { tick, importance: 0.8, kind: 'culture',
            text: `The ${c.name} faded into history; its line ended.` }, cfg.chronicleImportanceThreshold);
        }
      }
    }
  }
  // A daughter tongue that fell silent.
  for (const l of Object.values(lstore.byId)) {
    if (!l.extinct && (speakers.get(l.id) ?? 0) === 0) {
      l.extinct = true; l.diedTick = tick;
      if (l.parent) {
        emitEvent(world, 'culture', `The ${l.name} tongue fell silent — none speak it now.`);
        if (chronicle) {
          chronicleAdd(chronicle, { tick, importance: 0.8, kind: 'language',
            text: `The ${l.name} tongue is now lost — none speak it.` }, cfg.chronicleImportanceThreshold);
        }
      }
    }
  }

  prune(cstore, lstore, cfg.maxLineages);
}

// Keep every living lineage and its full ancestry; drop the oldest dead side-branches
// when over the cap.
function prune(cstore: CultureStoreData, lstore: LanguageStoreData, cap: number): void {
  const keepC = new Set<string>();
  for (const c of Object.values(cstore.byId)) {
    if (c.extinct) continue;
    let cur: string | undefined = c.id;
    while (cur && cstore.byId[cur] && !keepC.has(cur)) { keepC.add(cur); cur = cstore.byId[cur].parent; }
  }
  pruneOver(cstore.byId, keepC, cap);

  const keepL = new Set<string>();
  for (const cid of Object.keys(cstore.byId)) {
    let lid: string | undefined = cstore.byId[cid].language;
    while (lid && lstore.byId[lid] && !keepL.has(lid)) { keepL.add(lid); lid = lstore.byId[lid].parent; }
  }
  pruneOver(lstore.byId, keepL, cap);
}

function pruneOver(
  byId: Record<string, { diedTick?: number; foundedTick?: number }>, keep: Set<string>, cap: number,
): void {
  const ids = Object.keys(byId);
  if (ids.length <= cap) return;
  const removable = ids.filter(id => !keep.has(id))
    .sort((a, b) => (byId[a].diedTick ?? byId[a].foundedTick ?? 0) - (byId[b].diedTick ?? byId[b].foundedTick ?? 0));
  let over = ids.length - cap;
  for (const id of removable) { if (over <= 0) break; delete byId[id]; over--; }
}
