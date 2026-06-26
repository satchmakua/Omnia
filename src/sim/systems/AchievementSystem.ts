// Achievements (M17 s4): civ + agent milestones that fire once and are kept forever (shown
// in the Legends view). A daily pass checks each unfired achievement's condition against the
// world; the first time it holds, it's unlocked with a feed line + a Chronicle legend. Pure
// reads (no RNG) — just durable state.
import type { World } from '../ecs.ts';
import {
  C_ACHIEVEMENTS, C_CLOCK, C_CHRONICLE, C_AGENT, C_COMBAT, C_CRIME, C_MAGIC, C_ORGSTORE,
} from '../components.ts';
import type { AchievementsData, Achievement, Clock, Agent, Combat, Crime, Magic } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ageInYears } from '../config.ts';
import type { OrgStoreData } from '../../org/orgStore.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const ERA_NAMES: Record<number, string> = { 2: 'Bronze Age', 3: 'Iron Age', 4: 'Medieval Age', 5: 'Industrial Age', 6: 'Modern Age', 7: 'Sci-Fi Age' };

// Each definition returns a detail string (who/what earned it) the first time it holds, else null.
interface AchDef { id: string; name: string; check: (world: World, cfg: SimConfig) => string | null; }

function topTribeAtTier(store: OrgStoreData | undefined, tier: number): string | null {
  if (!store) return null;
  for (const o of Object.values(store.byId)) if (!o.extinct && (o.tier ?? 1) >= tier) return o.name;
  return null;
}

const DEFS: AchDef[] = [
  ...[2, 3, 4, 5, 6, 7].map(tier => ({
    id: `age_${tier}`, name: `Reach the ${ERA_NAMES[tier]}`,
    check: (w: World) => topTribeAtTier(orgStore(w), tier),
  })),
  { id: 'first_blood', name: 'First Blood (a foe slain)', check: (w) => {
    for (const e of w.query(C_AGENT, C_COMBAT)) if (w.getComponent<Combat>(e, C_COMBAT)!.kills > 0) return w.getComponent<Agent>(e, C_AGENT)!.name;
    return null;
  } },
  { id: 'first_war', name: 'The First War', check: (w) => {
    const s = orgStore(w);
    const war = s?.wars[0] ?? s?.warLog?.[0];
    return war && s ? `${s.byId[war.a]?.name ?? '?'} vs ${s.byId[war.b]?.name ?? '?'}` : null;
  } },
  { id: 'bloodshed', name: 'Bloodshed (a murder)', check: (w) => {
    for (const e of w.query(C_AGENT, C_CRIME)) if (w.getComponent<Crime>(e, C_CRIME)!.murders > 0) return w.getComponent<Agent>(e, C_AGENT)!.name;
    return null;
  } },
  { id: 'archmage', name: 'Archmage (mastery 5)', check: (w) => {
    for (const e of w.query(C_AGENT, C_MAGIC)) if ((w.getComponent<Magic>(e, C_MAGIC)!.mastery ?? 0) >= 5) return w.getComponent<Agent>(e, C_AGENT)!.name;
    return null;
  } },
  { id: 'elder', name: 'Venerable Elder (age 100)', check: (w, cfg) => {
    for (const e of w.query(C_AGENT)) if (ageInYears(w.getComponent<Agent>(e, C_AGENT)!.ticksAlive, cfg) >= 100) return w.getComponent<Agent>(e, C_AGENT)!.name;
    return null;
  } },
  { id: 'lost_art', name: 'A Lost Art', check: (w) => {
    const s = orgStore(w);
    return s?.lost && s.lost.length > 0 ? `${s.lost.length} lost` : null;
  } },
];

function orgStore(world: World): OrgStoreData | undefined {
  const ents = world.query(C_ORGSTORE);
  return ents.length ? world.getComponent<OrgStoreData>(ents[0], C_ORGSTORE) : undefined;
}

export function createAchievements(): AchievementsData { return { unlocked: [] }; }

export function runAchievementSystem(world: World, cfg: SimConfig): void {
  const ents = world.query(C_ACHIEVEMENTS);
  if (!ents.length) return;
  const data = world.getComponent<AchievementsData>(ents[0], C_ACHIEVEMENTS)!;
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // daily

  const have = new Set(data.unlocked.map(a => a.id));
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);

  for (const def of DEFS) {
    if (have.has(def.id)) continue;
    const detail = def.check(world, cfg);
    if (detail === null) continue;
    const ach: Achievement = { id: def.id, name: def.name, tick: clock.tick, detail: detail || undefined };
    data.unlocked.push(ach);
    emitEvent(world, 'culture', `🏆 ${def.name}${detail ? ` — ${detail}` : ''}.`);
    if (ch) chronicleAdd(ch, { tick: clock.tick, importance: 0.78, kind: 'achievement', text: `🏆 ${def.name}${detail ? ` (${detail})` : ''}.` }, cfg.chronicleImportanceThreshold);
  }
}
