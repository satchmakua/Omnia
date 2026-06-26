// Legendary artifacts (M20 s2): once a day, a master crafter (skill ≥ MIN_SKILL) bearing a
// crafted weapon or armour has their masterwork **named and enshrined** as an artifact, with a
// forging history — and when a bearer dies, their artifact is **lost to history** as a relic.
// A pure read of durable state (the only RNG-free naming via the tongue word generator, keyed
// by entity id), so it never perturbs the trajectory. Ties M23 crafting to M20's legend layer.
import type { World, EntityId } from '../ecs.ts';
import {
  C_ARTIFACTS, C_AGENT, C_CRAFTING, C_EQUIPMENT, C_COMBAT, C_CLOCK, C_CHRONICLE,
} from '../components.ts';
import type { ArtifactsData, Agent, Crafting, Equipment, Combat, Clock } from '../components.ts';
import type { SimConfig } from '../config.ts';
import { ticksPerYear } from '../config.ts';
import { getCultureStore, getCulture } from '../../culture/cultureStore.ts';
import { getLanguageStore, getLanguage } from '../../lang/languageStore.ts';
import { word } from '../../lang/language.ts';
import { bearerArtifact, enshrineArtifact, pruneArtifacts } from '../../history/artifacts.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const MIN_SKILL = 3;        // only a master's work becomes legend
const MAX_ARTIFACTS = 40;
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

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

  // ── Birth: a master crafter's borne masterwork becomes a named artifact ──
  for (const e of world.query(C_AGENT, C_CRAFTING, C_EQUIPMENT)) {
    if ((world.getComponent<Crafting>(e, C_CRAFTING)!.skill) < MIN_SKILL) continue;
    if (bearerArtifact(data, e)) continue;                       // already has a signature work
    const eq = world.getComponent<Equipment>(e, C_EQUIPMENT)!;
    const kind: 'weapon' | 'armour' = eq.weapon > 0 ? 'weapon' : eq.armour > 0 ? 'armour' : 'weapon';
    const power = kind === 'weapon' ? eq.weapon : eq.armour;
    if (power <= 0) continue;
    const agent = world.getComponent<Agent>(e, C_AGENT)!;
    // Coin a name from the maker's tongue (deterministic, keyed by entity id — no sim RNG).
    const culture = agent.cultureId && cstore ? getCulture(cstore, agent.cultureId) : undefined;
    const lang = culture && lstore ? getLanguage(lstore, culture.language) : (lstore ? Object.values(lstore.byId)[0] : undefined);
    const name = cap(lang ? word(lang, `relic-${e}`) : `Relic${data.artifacts.length}`);
    const kills = world.getComponent<Combat>(e, C_COMBAT)?.kills ?? 0;
    const what = kind === 'weapon' ? 'blade' : 'war-gear';
    const deeds = `a master-forged ${what}${kills > 0 ? ` · ${kills} ${kills === 1 ? 'foe' : 'foes'} slain` : ''}`;
    enshrineArtifact(data, { id: `art.${e}.${tick}`, name, kind, power, bearer: e, forgedBy: agent.name, forgedTick: tick, deeds });
    emitEvent(world, 'culture', `${agent.name} forged ${name}, a legendary ${what}.`);
    if (ch) chronicleAdd(ch, { tick, importance: 0.8, kind: 'artifact', text: `${name}, a legendary ${what}, was forged by ${agent.name}.` }, cfg.chronicleImportanceThreshold);
  }

  // ── Loss: a relic whose bearer has died passes out of the world's hands ──
  for (const a of data.artifacts) {
    if (a.lost || a.bearer === null) continue;
    if (world.hasComponent(a.bearer, C_AGENT)) continue;   // bearer still lives
    a.lost = true;
    a.lostTick = tick;
    a.deeds = `${a.deeds} · lost in yr ${Math.floor(tick / tpy)}`;
    emitEvent(world, 'culture', `${a.name} was lost to history — its bearer is no more.`);
  }

  pruneArtifacts(data, MAX_ARTIFACTS);
}
