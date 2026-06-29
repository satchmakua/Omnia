// Organizations over time (M14): leadership succession when a head dies, a tribe falling
// when its last member does, and schism — a faction breaking away from a large, loose tribe
// over the eras (new tribes emerge alongside cultures & tongues). Runs daily (succession is
// cheap and need not be instant); schism evaluates on the culture/language era cadence.
import type { World, EntityId } from '../ecs.ts';
import { C_AGENT, C_CLOCK, C_CHRONICLE, C_WALLET } from '../components.ts';
import type { Agent, Clock, Wallet, Organization } from '../components.ts';
import type { SimConfig } from '../config.ts';
import type { RNG } from '../rng.ts';
import {
  getOrgStore, forkOrg, pruneOrgs, areAtWar, declareWar, endWar,
  adjustStanding, standingBetween, areAllied, areRivals, inSameRealm, isVassal, submitAsVassal, releaseVassals,
} from '../../org/orgStore.ts';
import { renameToClan } from '../spawnAgent.ts';
import type { OrgStoreData } from '../../org/orgStore.ts';
import { getCultureStore, getCulture } from '../../culture/cultureStore.ts';
import { getLanguageStore, getLanguage } from '../../lang/languageStore.ts';
import { word } from '../../lang/language.ts';
import { emitEvent } from '../../history/eventlog.ts';
import { chronicleAdd } from '../../history/chronicle.ts';
import type { ChronicleData } from '../../history/chronicle.ts';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Diplomacy tunables (M31). Standing eases toward how alike two clans' values are; a much-weaker
// clan submits rather than be crushed; a vassal renders a little tribute each era.
const DAILY_DRIFT = 0.02;        // how fast standing eases toward value-affinity each day
const VASSAL_DOMINANCE = 2.5;    // a dominant clan this many times a clan's size can compel it into vassalage
const VASSAL_LORD_MARTIAL = 0.45; // …and it must be at least this assertive (it need not be a warmonger to overshadow a weak neighbour)
const TRIBUTE = 6;               // gold a vassal's head renders to its lord's head each era

// How two clans are inclined to regard each other, in [-1,1]. Shared values draw clans together
// (kin clans, alike after a schism, tend to ally); but a *warlike* clan is abrasive to all — an
// ambitious martial people makes enemies, not friends — so a high martiality drags the affinity
// down. The upshot: peaceable, like-minded clans ally; the warlike sit outside the alliances (war-
// able), and the most martial & value-divergent fall into outright rivalry.
const MARTIAL_CLASH = 0.9;
function valueAffinity(a: Organization['values'], b: Organization['values']): number {
  const d = (Math.abs(a.communal - b.communal) + Math.abs(a.martial - b.martial)
    + Math.abs(a.traditional - b.traditional) + Math.abs(a.open - b.open)) / 4;
  const clash = MARTIAL_CLASH * Math.max(a.martial, b.martial) ** 2;
  return Math.max(-1, (1 - 2 * d) - clash);
}

// Coin a tribe name from the (representative) member's tongue — e.g. "Korvu clan".
function tribeName(world: World, store: OrgStoreData, memberCultureLang: string | undefined, key: string): string {
  const lstore = getLanguageStore(world);
  const lang = (lstore && memberCultureLang ? getLanguage(lstore, memberCultureLang) : undefined)
    ?? (lstore ? Object.values(lstore.byId)[0] : undefined);
  return `${cap(lang ? word(lang, key) : `tribe${store.created}`)} clan`;
}

function eldest(world: World, members: EntityId[]): EntityId {
  let best = members[0], bestAge = -1;
  for (const e of members) {
    const age = world.getComponent<Agent>(e, C_AGENT)!.ticksAlive;
    if (age > bestAge) { bestAge = age; best = e; }
  }
  return best;
}

function cultureLangOf(world: World, e: EntityId): string | undefined {
  const cid = world.getComponent<Agent>(e, C_AGENT)!.cultureId;
  const cstore = getCultureStore(world);
  return cid && cstore ? getCulture(cstore, cid)?.language : undefined;
}

// War→militarism (D26): going to war hardens both belligerents' cultures toward `martial`
// — the matching response to famine→thrift (S71). Each represented culture is nudged once;
// bounded + clamped, deterministic (no RNG). The era value-drift counterbalances it, so
// martiality breathes rather than ratchets to a permanent war footing.
function militarize(world: World, aId: string, bId: string, members: Map<string, EntityId[]>): void {
  const cstore = getCultureStore(world);
  if (!cstore) return;
  const touched = new Set<string>();
  for (const tribe of [aId, bId]) {
    for (const e of members.get(tribe) ?? []) {
      const cid = world.getComponent<Agent>(e, C_AGENT)!.cultureId;
      if (!cid || touched.has(cid)) continue;
      touched.add(cid);
      const c = getCulture(cstore, cid);
      if (c) c.values.martial = Math.min(1, c.values.martial + 0.05);
    }
  }
}

export function runOrgSystem(world: World, cfg: SimConfig, rng: RNG): void {
  const store = getOrgStore(world);
  if (!store) return;
  const clockEnts = world.query(C_CLOCK);
  const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
  if (tick === 0 || tick % cfg.ticksPerDay !== 0) return;   // daily

  // Living members per tribe.
  const members = new Map<string, EntityId[]>();
  for (const e of world.query(C_AGENT)) {
    const orgId = world.getComponent<Agent>(e, C_AGENT)!.orgId;
    if (!orgId) continue;
    const list = members.get(orgId); if (list) list.push(e); else members.set(orgId, [e]);
  }

  // Succession + extinction: a memberless tribe falls; otherwise keep a living head.
  for (const id of Object.keys(store.byId)) {
    const org = store.byId[id];
    if (org.extinct) continue;
    const mem = members.get(id);
    if (!mem || mem.length === 0) {
      org.extinct = true; org.diedTick = tick; org.leader = null;
      org.lord = undefined; org.vassalSince = undefined;   // a fallen clan owes no tribute
      releaseVassals(store, id);                            // …and its realm dissolves — its vassals are freed (M31)
      continue;
    }
    const valid = org.leader != null && world.hasComponent(org.leader, C_AGENT)
      && world.getComponent<Agent>(org.leader, C_AGENT)!.orgId === id;
    if (!valid) {
      org.leader = eldest(world, mem);
      emitEvent(world, 'culture', `${world.getComponent<Agent>(org.leader, C_AGENT)!.name} now leads the ${org.name}.`);
    }
  }

  // ── Diplomacy drift (M31): the standing between two clans eases toward how alike their values are;
  //    crossing a threshold forges an alliance or kindles a rivalry. Daily, deterministic (no RNG).
  //    Clans bound in one realm (lord ↔ vassal, co-vassals) don't drift apart by this. ──
  const livingOrgs = Object.keys(store.byId).filter(id => !store.byId[id].extinct && (members.get(id)?.length ?? 0) > 0);
  for (let i = 0; i < livingOrgs.length; i++) for (let j = i + 1; j < livingOrgs.length; j++) {
    const a = livingOrgs[i], b = livingOrgs[j];
    if (inSameRealm(store, a, b)) continue;
    const drift = (valueAffinity(store.byId[a].values, store.byId[b].values) - standingBetween(store, a, b)) * DAILY_DRIFT;
    const forged = adjustStanding(store, a, b, drift, tick);
    if (forged === 'ally') emitEvent(world, 'culture', `The ${store.byId[a].name} and the ${store.byId[b].name} forged an alliance.`);
    else if (forged === 'rival') emitEvent(world, 'culture', `The ${store.byId[a].name} and the ${store.byId[b].name} fell into rivalry.`);
  }

  // Schism on the era cadence: a large, loose tribe fractures — a faction breaks away with a
  // new colour, coined name, and nudged values (and so, often, a different government).
  if (tick - store.lastEvolveTick >= cfg.evolutionIntervalDays * cfg.ticksPerDay) {
    store.lastEvolveTick = tick;
    for (const id of Object.keys(store.byId)) {            // snapshot — daughters aren't re-checked
      const org = store.byId[id];
      if (org.extinct) continue;
      const mem = members.get(id);
      if (!mem || mem.length < cfg.minSchismMembers) continue;
      if (rng() >= cfg.schismChancePerEra * (1 - org.cohesion)) continue;
      const name = tribeName(world, store, cultureLangOf(world, mem[0]), `schism-${store.created}`);
      const daughter = forkOrg(store, id, name, tick, cfg.schismValueNudge, rng);
      const sorted = [...mem].sort((a, b) => a - b);
      const half = Math.ceil(sorted.length / 2);
      for (const e of sorted.slice(half)) {
        const a = world.getComponent<Agent>(e, C_AGENT)!;
        a.orgId = daughter;
        renameToClan(a, store.byId[daughter].surname);   // the breakaway takes the new clan's name (M20)
      }
      store.byId[daughter].leader = eldest(world, sorted.slice(half));
      store.byId[id].leader = eldest(world, sorted.slice(0, half));
      emitEvent(world, 'culture', `The ${name} broke away from the ${org.name}.`);
    }

    // ── War (M16 slice 3): end decided/exhausted wars, then maybe start a new one ──
    const eraTicks = cfg.evolutionIntervalDays * cfg.ticksPerDay;
    const sizeOf = (id: string): number => members.get(id)?.length ?? 0;
    for (const war of [...(store.wars ?? [])]) {
      const a = store.byId[war.a], b = store.byId[war.b];
      const aN = sizeOf(war.a), bN = sizeOf(war.b);
      const routed = aN === 0 || bN === 0 || Math.min(aN, bN) < Math.max(aN, bN) * 0.4;
      const exhausted = tick - war.since >= cfg.warDurationEras * eraTicks;
      if (!a || !b || a.extinct || b.extinct || routed || exhausted) {
        endWar(store, war.a, war.b);
        const winnerId = routed ? (aN >= bN ? war.a : war.b) : null;
        if (!store.warLog) store.warLog = [];
        store.warLog.push({ a: war.a, b: war.b, since: war.since, ended: tick, winner: winnerId });
        if (store.warLog.length > 30) store.warLog.shift();
        if (a && b && !a.extinct && !b.extinct) {
          const winner = aN >= bN ? a : b, loser = aN >= bN ? b : a;
          adjustStanding(store, war.a, war.b, routed ? -0.2 : 0.3, tick);   // a rout breeds a grudge; a truce thaws the standing (M31)
          emitEvent(world, 'culture', routed
            ? `The ${winner.name} broke the ${loser.name} in war.`
            : `The ${a.name} and the ${b.name} made peace.`);
        }
      }
    }
    // ── Vassalage (M31): a weak clan overshadowed by a dominant martial power it is not allied to
    //    bends the knee — tribute for protection, a bloodless conquest. The seed of a realm; over deep
    //    time the strongest martial clan gathers vassals into a hegemony. Deterministic (no RNG). ──
    for (const vId of livingOrgs) {
      const v = store.byId[vId];
      if (v.lord || v.extinct) continue;
      let lord: string | undefined, lordN = sizeOf(vId) * VASSAL_DOMINANCE;   // a lord must tower this far over its vassal
      for (const lId of livingOrgs) {
        if (lId === vId || store.byId[lId].lord) continue;                          // no sub-realms (a vassal can't itself be a lord)
        if (store.byId[lId].values.martial < VASSAL_LORD_MARTIAL) continue;         // a timid clan compels no one — but it needn't be a warmonger
        if (areAllied(store, vId, lId) || inSameRealm(store, vId, lId)) continue;   // you ally with a friend, not bend the knee
        const lN = sizeOf(lId);
        if (lN >= lordN) { lord = lId; lordN = lN; }
      }
      if (lord) {
        submitAsVassal(store, vId, lord, tick);
        adjustStanding(store, vId, lord, 0.4, tick);   // a subdued peace under the new overlord
        emitEvent(world, 'culture', `The ${store.byId[vId].name} bent the knee to the ${store.byId[lord].name}, becoming its vassal.`);
        const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
        if (ch) chronicleAdd(ch, { tick, importance: 0.78, kind: 'war',
          text: `The ${store.byId[vId].name} bent the knee to the ${store.byId[lord].name}.` }, cfg.chronicleImportanceThreshold);
      }
    }

    const eligible = Object.keys(store.byId).filter(id => !store.byId[id].extinct && sizeOf(id) >= cfg.minWarMembers);
    // A vassal does not start its own wars (it follows its lord); only the martial & free may.
    const aggressors = eligible.filter(id => store.byId[id].values.martial >= cfg.warMartialThreshold && !isVassal(store, id));
    if (aggressors.length > 0 && eligible.length >= 2 && rng() < cfg.warChancePerEra) {
      const a = aggressors[Math.floor(rng() * aggressors.length)];
      // Never an ally or a clan of one's own realm; a standing rival is the preferred quarry (M31).
      const open = eligible.filter(id => id !== a && !areAtWar(store, a, id) && !areAllied(store, a, id) && !inSameRealm(store, a, id));
      const rivals = open.filter(id => areRivals(store, a, id));
      const pool = rivals.length > 0 ? rivals : open;
      if (pool.length > 0) {
        const b = pool[Math.floor(rng() * pool.length)];
        declareWar(store, a, b, tick);
        militarize(world, a, b, members);          // war hardens both cultures toward martial (D26)
        adjustStanding(store, a, b, -0.7, tick);   // war sours the standing into rivalry (M31)
        emitEvent(world, 'culture', `The ${store.byId[a].name} declared war on the ${store.byId[b].name}.`);
        const ch = world.getComponent<ChronicleData>(world.query(C_CHRONICLE)[0], C_CHRONICLE);
        if (ch) chronicleAdd(ch, { tick, importance: 0.8, kind: 'war',
          text: `The ${store.byId[a].name} went to war with the ${store.byId[b].name}.` }, cfg.chronicleImportanceThreshold);
      }
    }

    // ── Tribute (M31): each era a vassal renders a little gold to its lord — the price of protection. ──
    for (const vId of Object.keys(store.byId)) {
      const v = store.byId[vId];
      if (v.extinct || !v.lord) continue;
      const lord = store.byId[v.lord];
      if (!lord || lord.extinct) { v.lord = undefined; v.vassalSince = undefined; continue; }
      const vw = v.leader != null ? world.getComponent<Wallet>(v.leader, C_WALLET) : undefined;
      const lw = lord.leader != null ? world.getComponent<Wallet>(lord.leader, C_WALLET) : undefined;
      if (vw && lw && vw.gold > 0) { const trib = Math.min(vw.gold, TRIBUTE); vw.gold -= trib; lw.gold += trib; }
    }
  }

  pruneOrgs(store, cfg.maxLineages);
}
