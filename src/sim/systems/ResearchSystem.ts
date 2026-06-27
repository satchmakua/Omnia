// Knowledge (M17): each tribe accumulates research and climbs the content-defined tech ladder
// (D34) — tribal → bronze → … → sci-fi, framed as re-ascending the fallen world's lost tech.
// Bigger tribes advance faster; a tribe unlocks the cheapest tech whose prerequisites it knows,
// as many as its research can afford each day. Each discovery is a feed line, and crossing into
// a new age a Chronicle legend. Pure accumulation — no RNG. Runs daily.
import type { World } from '../ecs.ts';
import { C_AGENT, C_CLOCK, C_CHRONICLE } from '../components.ts';
import type { Agent, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { Content } from '../../content/loader.ts';
import { getOrgStore } from '../../org/orgStore.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const RESEARCH_BONUS = 0.12;   // each `research` tech (scholarship/computing) speeds research (M25)

export function runResearchSystem(world: World, cfg: SimConfig, content: Content): void {
  const store = getOrgStore(world);
  if (!store) return;
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // daily
  const tick = clock.tick;

  const techs = content.tech.all();
  if (techs.length === 0) return;

  // Living members per tribe (drives research rate).
  const members = new Map<string, number>();
  for (const e of world.query(C_AGENT)) {
    const id = world.getComponent<Agent>(e, C_AGENT)!.orgId;
    if (id) members.set(id, (members.get(id) ?? 0) + 1);
  }
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);

  for (const id of Object.keys(store.byId)) {
    const org = store.byId[id];
    if (org.extinct) continue;
    const n = members.get(id) ?? 0;
    if (n === 0) continue;

    // Schools & computing (the `research` effect) compound: a learned tribe researches faster (M25).
    const scholarship = 1 + RESEARCH_BONUS * (org.effects?.research ?? 0);
    org.research = (org.research ?? 0) + (cfg.researchBasePerDay + cfg.researchPerMemberPerDay * n) * scholarship;
    if (!org.techs) org.techs = [];

    // Unlock as many affordable techs as research allows, cheapest-available first.
    for (;;) {
      const known = new Set(org.techs);
      const available = techs.filter(t => !known.has(t.id) && t.prerequisites.every(p => known.has(p)));
      if (available.length === 0) break;
      available.sort((a, b) => (a.cost - b.cost) || (a.id < b.id ? -1 : 1));
      const next = available[0];
      if ((org.research ?? 0) < next.cost) break;
      org.research = (org.research ?? 0) - next.cost;
      org.techs.push(next.id);
      org.tier = Math.max(org.tier ?? 1, next.tier);
      if (!store.everKnown) store.everKnown = [];
      if (!store.everKnown.includes(next.id)) store.everKnown.push(next.id);
      // Denormalise the tech's effect tags onto the tribe (combat/health read these without
      // needing the content registry).
      if (next.effects.length > 0) {
        if (!org.effects) org.effects = {};
        for (const tag of next.effects) org.effects[tag] = (org.effects[tag] ?? 0) + 1;
      }
      emitEvent(world, 'culture', `The ${org.name} mastered ${next.name}.`);
      if (ch && next.tier >= 3) {
        chronicleAdd(ch, {
          tick, importance: 0.5 + next.tier * 0.045, kind: 'tech',
          text: `The ${org.name} reached the ${next.era} — they mastered ${next.name}.`,
        }, cfg.chronicleImportanceThreshold);
      }
    }
  }

  // ── Lost & rediscovered knowledge (M17 s4) ──────────────────────────────────────
  // When the last tribe holding a tech dies out, the art is lost (a dark-age legend);
  // when a tribe re-researches it later, it is rediscovered.
  if (!store.everKnown) store.everKnown = [];
  if (!store.lost) store.lost = [];
  const heldNow = new Set<string>();
  for (const org of Object.values(store.byId)) {
    if (org.extinct || (members.get(org.id) ?? 0) === 0) continue;
    for (const t of org.techs ?? []) heldNow.add(t);
  }
  for (const id of store.everKnown) {
    const held = heldNow.has(id);
    const lost = store.lost.includes(id);
    const name = content.tech.get(id)?.name ?? id;
    if (!held && !lost) {
      store.lost.push(id);
      emitEvent(world, 'culture', `The art of ${name} has been lost.`);
      if (ch) chronicleAdd(ch, { tick, importance: 0.7, kind: 'tech', text: `The art of ${name} was lost — its last keepers are gone.` }, cfg.chronicleImportanceThreshold);
    } else if (held && lost) {
      store.lost = store.lost.filter(x => x !== id);
      emitEvent(world, 'culture', `${name} has been rediscovered.`);
      if (ch) chronicleAdd(ch, { tick, importance: 0.72, kind: 'tech', text: `${name} was rediscovered, long after it was thought lost.` }, cfg.chronicleImportanceThreshold);
    }
  }
}
