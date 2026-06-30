// Legendary artifacts (M20 s2): once a day, a master crafter (skill ≥ MIN_SKILL) bearing a
// crafted weapon or armour has their masterwork **named and enshrined** as an artifact, with a
// forging history — and when a bearer dies, their artifact is **lost to history** as a relic.
// A pure read of durable state (the only RNG-free naming via the tongue word generator, keyed
// by entity id), so it never perturbs the trajectory. Ties M23 crafting to M20's legend layer.
import type { World, EntityId } from '../ecs.ts';
import {
  C_ARTIFACTS, C_AGENT, C_CRAFTING, C_EQUIPMENT, C_COMBAT, C_CLOCK, C_CHRONICLE, C_ENCHANTMENT, C_LINEAGE,
} from '../components.ts';
import type { ArtifactsData, Agent, Crafting, Equipment, Combat, Clock, Enchantment, Lineage } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import { getCultureStore, getCulture } from '../../culture/cultureStore.ts';
import { getLanguageStore, getLanguage } from '../../lang/languageStore.ts';
import { word } from '../../lang/language.ts';
import { bearerArtifact, enshrineArtifact, pruneArtifacts } from '../../history/artifacts.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';
import { MASTERWORK } from '../quality.ts';

const MIN_SKILL = 3;        // only a master's work becomes legend
const MAX_ARTIFACTS = 40;
const SCENE_IMPORTANCE = 0.78;   // only the loudest legends (wars, foundings, conquests) are worth graving
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function hash32(n: number): number {
  let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
// A grand scene from the durable history (M33 s2) for a masterwork to depict — drawn from the
// Chronicle's loudest legends + its compressed ages, generated, not authored. Deterministic (keyed by
// the maker's entity id — no sim RNG), so engraving never perturbs the trajectory. Trailing '.' trimmed.
function depictableScene(ch: ChronicleData | undefined, e: EntityId): string | undefined {
  if (!ch) return undefined;
  const scenes: string[] = [];
  for (const era of ch.eras) scenes.push(era.text);
  for (const en of ch.entries) if (en.importance >= SCENE_IMPORTANCE) scenes.push(en.text);
  if (!scenes.length) return undefined;
  return scenes[hash32(e) % scenes.length].replace(/\.\s*$/, '');
}

export function runArtifactSystem(world: World, cfg: SimConfig): void {
  const ents = world.query(C_ARTIFACTS);
  if (!ents.length) return;
  const data = world.getComponent<ArtifactsData>(ents[0], C_ARTIFACTS)!;
  const clockEnts = world.query(C_CLOCK);
  if (!clockEnts.length) return;
  const clock = world.getComponent<Clock>(clockEnts[0], C_CLOCK)!;
  if (clock.tick === 0 || clock.tick % cfg.ticksPerDay !== 0) return;   // daily
  const tick = clock.tick;
  const tpy = ticksPerYear(cfg);

  const cstore = getCultureStore(world);
  const lstore = getLanguageStore(world);
  const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);

  // ── Birth: a master crafter's masterwork OR an artificer-mage's enchanted gear (M26 s3) becomes
  // a named legendary artifact. A magic item is remembered whoever bears it — a master's work
  // additionally bears the master's name.
  for (const e of world.query(C_AGENT, C_EQUIPMENT)) {
    const eq = world.getComponent<Equipment>(e, C_EQUIPMENT)!;
    const existing = bearerArtifact(data, e);
    if (existing) {
      // A smith whose craft has since ripened to a true *masterwork* (M33 s1) has their signature
      // work recognised as one — and graven with a scene from the town's own history (M33 s2). The
      // artifact accrues this honour later in life (the seed of an heirloom's accruing history, s3).
      if (!existing.depicts && existing.bearer === e) {
        const q = existing.kind === 'weapon' ? (eq.weaponQuality ?? -1) : (eq.armourQuality ?? -1);
        const scene = q >= MASTERWORK ? depictableScene(ch, e) : undefined;
        if (scene) {
          existing.depicts = scene;
          existing.power = Math.max(existing.power, existing.kind === 'weapon' ? eq.weapon : eq.armour);
          existing.deeds = `a masterwork · ${existing.deeds}`;
          const who = world.getComponent<Agent>(e, C_AGENT)?.name ?? existing.forgedBy;
          emitEvent(world, 'culture', `${existing.name}, ${who}'s work, is now reckoned a masterwork — graven with the memory of: ${scene}.`);
          if (ch) chronicleAdd(ch, { tick, importance: 0.86, kind: 'artifact', text: `${existing.name} was reckoned a masterwork, depicting ${scene}.` }, cfg.chronicleImportanceThreshold);
        }
      }
      continue;
    }
    const skill = world.getComponent<Crafting>(e, C_CRAFTING)?.skill ?? 0;
    const ench = world.getComponent<Enchantment>(e, C_ENCHANTMENT);
    const isMaster = skill >= MIN_SKILL;
    if (!isMaster && !ench) continue;                            // only a master's work or a magic item
    const kind: 'weapon' | 'armour' = ench ? ench.kind : eq.weapon > 0 ? 'weapon' : eq.armour > 0 ? 'armour' : 'weapon';
    const base = kind === 'weapon' ? eq.weapon : eq.armour;
    const power = base + (ench && ench.kind === kind ? ench.bonus : 0);
    if (power <= 0) continue;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    // Coin a name from the bearer's tongue (deterministic, keyed by entity id — no sim RNG).
    const culture = agent.cultureId && cstore ? getCulture(cstore, agent.cultureId) : undefined;
    const lang = culture && lstore ? getLanguage(lstore, culture.language) : (lstore ? Object.values(lstore.byId)[0] : undefined);
    const name = cap(lang ? word(lang, `relic-${e}`) : `Relic${data.artifacts.length}`);
    const kills = world.getComponent<Combat>(e, C_COMBAT)?.kills ?? 0;
    const what = kind === 'weapon' ? 'blade' : 'war-gear';
    // A *masterwork* (M33 s1 quality, the finest work) is graven with a scene from the town's own
    // history (M33 s2) — generated from the Chronicle, no authoring.
    const gearQuality = kind === 'weapon' ? (eq.weaponQuality ?? -1) : (eq.armourQuality ?? -1);
    const depicts = isMaster && gearQuality >= MASTERWORK ? depictableScene(ch, e) : undefined;
    const parts: string[] = [];
    parts.push(depicts ? `a masterwork ${what}` : isMaster ? `a master-forged ${what}` : `a ${what}`);
    if (ench) parts.push(`enchanted by ${ench.by}`);
    if (kills > 0) parts.push(`${kills} ${kills === 1 ? 'foe' : 'foes'} slain`);
    enshrineArtifact(data, { id: `art.${e}.${tick}`, name, kind, power, bearer: e, forgedBy: agent.name, forgedTick: tick, deeds: parts.join(' · '), depicts, enchanted: ench?.by });
    if (ench) {
      emitEvent(world, 'magic', `${ench.by} imbued ${name}, an enchanted ${what}.`);
      if (ch) chronicleAdd(ch, { tick, importance: 0.82, kind: 'artifact', text: `${name}, an enchanted ${what}, was imbued by ${ench.by}.` }, cfg.chronicleImportanceThreshold);
    } else if (depicts) {
      emitEvent(world, 'culture', `${agent.name} forged ${name}, a masterwork ${what} graven with the ${kind === 'weapon' ? 'memory' : 'image'} of: ${depicts}.`);
      if (ch) chronicleAdd(ch, { tick, importance: 0.86, kind: 'artifact', text: `${name}, a masterwork ${what} depicting ${depicts}, was forged by ${agent.name}.` }, cfg.chronicleImportanceThreshold);
    } else {
      emitEvent(world, 'culture', `${agent.name} forged ${name}, a legendary ${what}.`);
      if (ch) chronicleAdd(ch, { tick, importance: 0.8, kind: 'artifact', text: `${name}, a legendary ${what}, was forged by ${agent.name}.` }, cfg.chronicleImportanceThreshold);
    }
  }

  // ── Inheritance & loss (M33 s3): a living bearer names their eldest living child as heir; when a
  // bearer dies, a borne relic passes down to that heir as an **heirloom** (accruing a generation of
  // history) — or, if the line has run out, is lost to history (→ a relic for archaeology, M20 s2b).
  for (const a of data.artifacts) {
    if (a.lost || a.bearer === null) continue;
    if (world.hasComponent(a.bearer, C_AGENT)) {
      const lin = world.getComponent<Lineage>(a.bearer, C_LINEAGE);   // designate an heir while the bearer lives
      a.heir = lin?.children.find(c => world.hasComponent(c, C_AGENT));
      continue;
    }
    // The bearer is no more.
    if (a.heir != null && world.hasComponent(a.heir, C_AGENT)) {
      a.bearer = a.heir;
      a.heir = undefined;
      a.generations = (a.generations ?? 0) + 1;
      if (!a.deeds.startsWith('an heirloom')) a.deeds = `an heirloom · ${a.deeds}`;
      const heirName = world.getComponent<Agent>(a.bearer, C_AGENT)!.name;
      const gens = a.generations;
      emitEvent(world, 'culture', `${a.name} passed down to ${heirName} — an heirloom of ${gens} generation${gens === 1 ? '' : 's'}.`);
      if (ch) chronicleAdd(ch, { tick, importance: Math.min(0.9, 0.74 + gens * 0.03), kind: 'artifact',
        text: `${a.name}, an heirloom of ${gens} generation${gens === 1 ? '' : 's'}, passed to ${heirName}.` }, cfg.chronicleImportanceThreshold);
    } else {
      a.lost = true;
      a.lostTick = tick;
      a.deeds = `${a.deeds} · lost in yr ${Math.floor(tick / tpy)}`;
      emitEvent(world, 'culture', `${a.name} was lost to history — its line is ended.`);
    }
  }

  pruneArtifacts(data, MAX_ARTIFACTS);
}
