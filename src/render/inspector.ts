import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES, C_MAGIC, C_JOB, C_BUSINESS, C_HOME, C_CIVIC, C_RUIN,
  C_HEALTH, C_LINEAGE, C_MEMORY, C_FAUNA, C_FLORA, C_RESOURCE, C_TILEMAP, C_TOMBSTONE, C_BODY, C_ALIGNMENT, C_PERSONALITY, C_COMBAT, C_CRIME, C_INVENTORY, C_CRAFTING, C_EQUIPMENT, C_QUEST, C_WONDERSITE, C_SPECIAL, C_FISH, C_CLOCK, C_WARD, C_CURSE, C_ENCHANTMENT, C_VOYAGE, C_RELATIONSHIPS, C_AFFLICTIONS,
} from '../sim/components.ts';
import type {
  Agent, Needs, Wallet, Position, SpeciesComp, Magic, Job, Business, Home, Civic,
  Health, Lineage, Memory, Fauna, Flora, Resource, Tombstone, Body, Alignment, Personality, Combat, Crime, Inventory, Crafting, Equipment, Ruin, Quest, WonderSite, Special, Clock, Ward, Curse, Enchantment, Voyage, Relationships, Afflictions,
} from '../sim/components.ts';
import { eyeColour, hairColour, buildWord, alignmentName, traitsOf } from '../sim/heredity.ts';
import { afflictionLabels } from '../sim/afflictions.ts';
import { socialClassOf } from '../sim/society.ts';
import { schoolOf } from '../magic/schools.ts';
import { getReligionStore, getReligion } from '../religion/religionStore.ts';
import { biomeNameAt, inBounds, isWater } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { ageInYears } from '../sim/config.ts';
import { defaultConfig } from '../sim/config.ts';
import { getCultureStore, getCulture } from '../culture/cultureStore.ts';
import { getLanguageStore, getLanguage } from '../lang/languageStore.ts';
import { getOrgStore, getOrg } from '../org/orgStore.ts';

function bar(v: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(v * 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${Math.round(v * 100)}%`;
}

const SECTION = 'color:#aac;font-size:11px;text-transform:uppercase;letter-spacing:1px';
const RULE = 'border-color:rgba(255,255,255,0.1);margin:8px 0';

// Tech-tier → era label (M17), mirroring the Knowledge tab — so a clan's tech age reads on its folk.
const ERA_NAMES = ['Tribal Age', 'Tribal Age', 'Bronze Age', 'Iron Age', 'Medieval Age', 'Industrial Age', 'Modern Age', 'Sci-Fi Age'];

export class Inspector {
  private readonly panel: HTMLDivElement;
  private readonly bodyEl: HTMLDivElement;
  private selected: EntityId | null = null;
  private selectedTile: { x: number; y: number } | null = null;

  constructor() {
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position:   'fixed',
      right:      '0',
      top:        '0',
      width:      '240px',
      height:     '100vh',
      background: 'rgba(8,8,24,0.92)',
      color:      '#dde',
      fontFamily: 'monospace',
      fontSize:   '12px',
      lineHeight: '1.7',
      padding:    '14px',
      boxSizing:  'border-box',
      display:    'none',
      overflowY:  'auto',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
    });

    // A persistent close button. The body is re-rendered every frame; the button is
    // NOT (rebuilding it each frame would destroy it mid-click — the old close bug).
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.title = 'Close (Esc)';
    Object.assign(closeBtn.style, {
      position: 'sticky', top: '0', float: 'right', background: 'transparent',
      color: '#aab', border: 'none', cursor: 'pointer', fontSize: '18px', lineHeight: '1', padding: '0 2px',
    } as Partial<CSSStyleDeclaration>);
    closeBtn.addEventListener('click', () => this.close());

    this.bodyEl = document.createElement('div');

    this.panel.append(closeBtn, this.bodyEl);
    document.body.appendChild(this.panel);
  }

  inspect(entity: EntityId, world: World): void {
    this.selected = entity;
    this.selectedTile = null;   // an entity click supersedes a tile click
    this.panel.style.display = 'block';
    this._render(entity, world);
  }

  // Inspect a bare tile (M24): clicking empty ground/water shows the terrain itself.
  inspectTile(x: number, y: number, world: World): void {
    this.selected = null;
    this.selectedTile = { x, y };
    this.panel.style.display = 'block';
    this.bodyEl.innerHTML = this._tile(world, x, y);
  }

  /** The currently-inspected entity, if any (used by the family-tree dashboard). */
  get selectedEntity(): EntityId | null { return this.selected; }

  get isOpen(): boolean { return this.panel.style.display !== 'none'; }

  update(world: World): void {
    if (this.selectedTile !== null) { this.bodyEl.innerHTML = this._tile(world, this.selectedTile.x, this.selectedTile.y); return; }
    if (this.selected === null) return;
    if (!world.isAlive(this.selected)) {
      this.bodyEl.innerHTML = '<b style="color:#f88">— gone —</b>';
      this.selected = null;   // the persistent ✕ (or Esc) closes the panel
      return;
    }
    this._render(this.selected, world);
  }

  close(): void {
    this.selected = null;
    this.selectedTile = null;
    this.panel.style.display = 'none';
  }

  private terrainLine(world: World, pos: Position): string {
    const mapEnts = world.query(C_TILEMAP);
    const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
    return (map && inBounds(map, pos.x, pos.y))
      ? `<div><b>Terrain</b> ${biomeNameAt(map, pos.x, pos.y)}</div>` : '';
  }

  private _render(entity: EntityId, world: World): void {
    const pos = world.getComponent<Position>(entity, C_POSITION)!;
    let body: string;

    if (world.hasComponent(entity, C_AGENT)) {
      body = this._agent(world, entity, pos);
    } else if (world.hasComponent(entity, C_BUSINESS)) {
      body = this._business(world, entity, pos);
    } else if (world.hasComponent(entity, C_HOME)) {
      body = this._home(world, entity, pos);
    } else if (world.hasComponent(entity, C_WONDERSITE)) {
      body = this._wonder(world, entity, pos);
    } else if (world.hasComponent(entity, C_RUIN)) {
      body = this._ruin(world, entity, pos);
    } else if (world.hasComponent(entity, C_CIVIC)) {
      body = this._civic(world, entity, pos);
    } else if (world.hasComponent(entity, C_SPECIAL)) {
      body = this._special(world, entity, pos);
    } else if (world.hasComponent(entity, C_FAUNA)) {
      body = this._fauna(world, entity, pos);
    } else if (world.hasComponent(entity, C_FISH)) {
      body = this._fish(world, pos);
    } else if (world.hasComponent(entity, C_RESOURCE)) {
      body = this._resource(world, entity, pos);
    } else if (world.hasComponent(entity, C_FLORA)) {
      body = this._flora(world, entity, pos);
    } else {
      body = '<div>—</div>';
    }

    this.bodyEl.innerHTML = body;
  }

  private title(text: string, sub: string): string {
    return `<div style="font-size:14px;font-weight:bold;margin-bottom:2px;color:#fff">${text}</div>` +
           `<div style="color:#99a;margin-bottom:8px">${sub}</div>`;
  }

  private _agent(world: World, e: EntityId, pos: Position): string {
    const agent   = world.getComponent<Agent>(e, C_AGENT)!;
    const needs   = world.getComponent<Needs>(e, C_NEEDS)!;
    const wallet  = world.getComponent<Wallet>(e, C_WALLET)!;
    const species = world.getComponent<SpeciesComp>(e, C_SPECIES);
    const job     = world.getComponent<Job>(e, C_JOB);
    const speciesLine = species
      ? `<div><b>Species</b> <span style="color:${species.color}">${species.name}</span> (${species.size})</div>` : '';
    // Tongue: derived live from the agent's culture's language, so a schism that
    // moves them to a daughter culture shows the new dialect (not the birth name's).
    const cstore0 = getCultureStore(world);
    const lstore0 = getLanguageStore(world);
    const culture0 = agent.cultureId && cstore0 ? getCulture(cstore0, agent.cultureId) : undefined;
    const tongueName = culture0 && lstore0 ? getLanguage(lstore0, culture0.language)?.name : undefined;
    const tongueLine = tongueName
      ? `<div><b>Tongue</b> <span style="color:#bcd">${tongueName}</span></div>` : '';
    // Tongues picked up through contact beyond the native one (M10 slice 4): the best-known
    // few with their fluency %, so a polyglot — and the town's mixing — reads at a glance.
    let learnedLine = '';
    if (agent.fluency && lstore0) {
      const others = Object.entries(agent.fluency)
        .filter(([id, f]) => id !== culture0?.language && f >= 0.1)
        .sort((p, q) => q[1] - p[1]).slice(0, 3)
        .map(([id, f]) => `${getLanguage(lstore0!, id)?.name ?? id} ${Math.round(f * 100)}%`);
      if (others.length) learnedLine = `<div><b>Also speaks</b> <span style="color:#9ab">${others.join(', ')}</span></div>`;
    }
    const jobLine = job
      ? `<div><b>Job</b> ${job.professionName}</div>`
      : `<div><b>Job</b> <span style="color:#a99">unemployed</span></div>`;
    const debtLine = wallet.debt > 0
      ? `<div style="color:#f99">Debt ${wallet.debt.toFixed(1)}</div>` : '';
    const magic = world.getComponent<Magic>(e, C_MAGIC);
    const magicBlock = magic ? (() => {
      const school = schoolOf(magic.school);
      const mastery = magic.mastery ?? 1;
      const spells = school ? school.spells.map(sp => {
        const known = sp.mastery <= mastery;
        return `<span style="color:${known ? '#d8b8ff' : '#5a5a66'}">${known ? '✦' : '○'} ${sp.name}${known ? '' : ` <span style="color:#556;font-size:10px">(m${sp.mastery})</span>`}</span>`;
      }).join('  ·  ') : '';
      return `<hr style="${RULE}">
        <div style="${SECTION}">Magic <span style="color:#d090f0">✦ ${school ? `${school.name} · mastery ${Math.floor(mastery)}` : 'aptitude'}</span></div>
        <div>Mana ${bar(magic.mana / magic.maxMana)}</div>
        ${school ? `<div style="color:#9ab;font-size:11px;margin-top:2px">${school.blurb}</div><div style="margin-top:3px">${spells}</div>` : ''}`;
    })() : '';

    const health = world.getComponent<Health>(e, C_HEALTH);
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    const ageYears = Math.floor(ageInYears(agent.ticksAlive, defaultConfig));
    const sexGlyph = agent.sex === 'female' ? '♀' : '♂';
    const child = ageYears < defaultConfig.adultAgeYears;
    // Home ownership (M11): count the homes this agent owns; ≥2 marks an emergent landlord.
    let homeCount = 0; let firstHome: Position | undefined;
    for (const he of world.query(C_HOME)) {
      if (world.getComponent<Home>(he, C_HOME)!.owner === e) {
        homeCount++;
        if (!firstHome) firstHome = world.getComponent<Position>(he, C_POSITION);
      }
    }
    const moodVal = agent.mood ?? 0.6;
    const moodWord = moodVal >= 0.66 ? 'content' : moodVal >= 0.4 ? 'unsettled' : 'low';
    // A current mental break (M28 s2), if any — the headline of an agent's inner state.
    const STATE_TAG: Record<string, string> = {
      despair: '<span style="color:#7fa8d0">▼ in despair (withdrawn)</span>',
      anger:   '<span style="color:#e06666">▲ in a rage</span>',
      elation: '<span style="color:#ffd278">★ overjoyed</span>',
    };
    const stateTag = agent.mentalState ? ` · ${STATE_TAG[agent.mentalState]}` : '';
    // Why the mood sits where it does — the same circumstance the MoodSystem reads (D35 legibility).
    const aliveRel = (id: number | null | undefined) => id != null && world.hasComponent(id, C_AGENT);
    const hasFamily = !!lin && (aliveRel(lin.partner) || lin.parents.some(aliveRel) || lin.children.some(aliveRel));
    const lifts: string[] = [], weighs: string[] = [];
    if (homeCount > 0) lifts.push('a home'); if (hasFamily) lifts.push('family');
    if (wallet.debt > 0) weighs.push('debt');
    if (!child && homeCount === 0 && agent.rentsFrom === undefined) weighs.push('no home');
    if (health?.ill) weighs.push('illness');
    if ((needs.fun ?? 1) < defaultConfig.actionThreshold) weighs.push('no leisure');
    const causeBits = [lifts.length ? `lifted by ${lifts.join(', ')}` : '', weighs.length ? `weighed by ${weighs.join(', ')}` : ''].filter(Boolean).join(' · ');
    const causeLine = causeBits ? `<div style="color:#778;font-size:10px">${causeBits}</div>` : '';
    const moodLine = `<div>Mood ${bar(moodVal)} <span style="color:#889">${moodWord}</span>${stateTag}</div>${causeLine}`;
    const renting = agent.rentsFrom !== undefined && world.hasComponent(agent.rentsFrom, C_AGENT)
      ? world.getComponent<Agent>(agent.rentsFrom, C_AGENT)!.name : null;
    let tenants = 0;
    if (homeCount >= 2) for (const oe of world.query(C_AGENT)) if (world.getComponent<Agent>(oe, C_AGENT)!.rentsFrom === e) tenants++;
    const homeLine = homeCount === 0
      ? (renting
          ? `<div><b>Home</b> <span style="color:#9bc">renting from ${renting}</span></div>`
          : `<div><b>Home</b> <span style="color:#a99">none yet</span></div>`)
      : homeCount === 1
        ? `<div><b>Home</b> at (${firstHome!.x}, ${firstHome!.y})</div>`
        : `<div><b>Home</b> owns ${homeCount} <span style="color:#caa46a">— a landlord${tenants ? ` (${tenants} tenant${tenants > 1 ? 's' : ''})` : ''}</span></div>`;
    // Social standing & class (M14 thread): esteem from deeds & means → a class label.
    const isOutlaw = world.hasComponent(e, C_CRIME);
    const orgStore0 = getOrgStore(world);
    const isLeader0 = !!orgStore0 && Object.values(orgStore0.byId).some(o => o.leader === e);
    const standingVal = agent.standing ?? 0.5;
    const klass = socialClassOf(standingVal, isOutlaw, isLeader0, homeCount >= 2);
    const standingLine = child ? '' :
      `<div>Standing ${bar(standingVal)}</div><div style="color:#cbb6e0">${klass}</div>`;

    // Livelihood reads differently for a child: a dependent — no job, no cost of living,
    // no wealth goal yet (the Kids Pass). Adults keep the full job / gold / debt / goal block.
    const livelihoodBlock = child
      ? `<hr style="${RULE}">
         <div style="${SECTION}">Livelihood</div>
         <div style="color:#9bc">A child — a dependent (no work or upkeep yet)</div>
         <div>Gold ${wallet.gold.toFixed(1)}</div>`
      : `<hr style="${RULE}">
         <div style="${SECTION}">Livelihood</div>
         ${jobLine}
         <div>Gold ${wallet.gold.toFixed(1)}</div>
         ${debtLine}
         <div style="color:#889">Goal ${Math.round(agent.wealthGoal)}g</div>
         ${homeLine}
         ${standingLine}`;

    // Family: name the partner if alive; count living children & friends.
    let family = '';
    if (lin) {
      const partnerName = lin.partner != null && world.hasComponent(lin.partner, C_AGENT)
        ? world.getComponent<Agent>(lin.partner, C_AGENT)!.name : null;
      const livingChildren = lin.children.filter(c => world.hasComponent(c, C_AGENT)).length;
      family = `<hr style="${RULE}">
        <div style="${SECTION}">Family</div>
        <div><b>Partner</b> ${partnerName ?? '<span style="color:#889">none</span>'}</div>
        <div><b>Children</b> ${livingChildren}</div>`;
    }

    // Ties (M29 s1): the soul's strongest opinions of the living — friends & rivals, each with the
    // reason behind it. (The partner is named in Family; everyone else surfaces here.)
    let tiesBlock = '';
    const rel = world.getComponent<Relationships>(e, C_RELATIONSHIPS);
    if (rel) {
      const ties = Object.entries(rel.edges)
        .map(([id, edge]) => ({ id: Number(id), edge }))
        .filter(t => t.edge.type !== 'partner' && world.hasComponent(t.id, C_AGENT))
        .sort((a, b) => Math.abs(b.edge.sentiment) - Math.abs(a.edge.sentiment))
        .slice(0, 5);
      if (ties.length) {
        const rows = ties.map(t => {
          const nm = world.getComponent<Agent>(t.id, C_AGENT)!.name;
          const foe = t.edge.type === 'rival' || t.edge.sentiment < 0;
          const glyph = foe ? '<span style="color:#ff7a7a">⚔</span>' : '<span style="color:#7fd6a0">♥</span>';
          const word = foe ? 'rival' : 'friend';
          const why = t.edge.reason ? ` <span style="color:#889;font-size:11px">— ${t.edge.reason}</span>` : '';
          return `<div style="margin:2px 0">${glyph} ${nm} <span style="color:#9ab;font-size:11px">(${word})</span>${why}</div>`;
        }).join('');
        tiesBlock = `<hr style="${RULE}"><div style="${SECTION}">Ties</div>${rows}`;
      }
    }
    const healthBlock = health
      ? `<div>Health ${bar(health.value)}${health.ill ? ' <span style="color:#f99">(ill)</span>' : ''}</div>` : '';
    // Specific afflictions the body carries (M30): injuries, the frailty of age, a chronic illness.
    const afflictions = afflictionLabels(world.getComponent<Afflictions>(e, C_AFFLICTIONS));
    const afflictLine = afflictions.length
      ? `<div style="color:#d9a0a0">⚕ afflicted by ${afflictions.join(', ')}</div>` : '';
    // A procedural quest the soul has taken up (M20 s3).
    const quest = world.getComponent<Quest>(e, C_QUEST);
    const questLine = quest ? `<div style="color:#ffd27a">⚑ on a quest — to ${quest.text}</div>` : '';
    // A protective ward laid by an abjurer (M26 s2).
    const ward = world.getComponent<Ward>(e, C_WARD);
    const wardLine = ward ? `<div style="color:#8fd8ff">🛡 warded — shielded against harm</div>` : '';
    // A magic item: enchanted gear imbued by an artificer (M26 s3).
    const ench = world.getComponent<Enchantment>(e, C_ENCHANTMENT);
    const enchLine = ench ? `<div style="color:#e6c0ff">✨ bears an enchanted ${ench.kind} — imbued by ${ench.by} (${ench.school})</div>` : '';
    // A merchant away at sea on a trade voyage (M25 s3).
    const voyage = world.getComponent<Voyage>(e, C_VOYAGE);
    const voyageLine = voyage ? (() => {
      const ostore = getOrgStore(world);
      const dest = ostore ? getOrg(ostore, voyage.orgId) : undefined;
      return `<div style="color:#7fb8cf">⛵ away on a trade voyage${dest ? ` to the ${dest.name}` : ' across the sea'}</div>`;
    })() : '';

    // Carried materials & goods + craft skill (M23): what the gatherer/crafter holds & can make.
    const inv = world.getComponent<Inventory>(e, C_INVENTORY);
    const craft = world.getComponent<Crafting>(e, C_CRAFTING);
    const hasInv = !!inv && Object.keys(inv.items).length > 0;
    const carryingBlock = (hasInv || craft)
      ? `<hr style="${RULE}"><div style="${SECTION}">Carrying${craft ? ' &amp; craft' : ''}</div>` +
        (craft ? `<div style="color:#cbb6e0">Craft skill ${craft.skill.toFixed(1)}${craft.skill >= 6 ? ' <span style="color:#e7c98a">· a master of the craft</span>' : ''}</div>` : '') +
        (hasInv ? Object.entries(inv!.items).sort((a, b) => b[1] - a[1]).map(([id, q]) =>
          `<div><span style="color:#cdb89a">${id.charAt(0).toUpperCase() + id.slice(1)}</span> <span style="color:#9ab">${q.toFixed(1)}</span></div>`).join('') : '')
      : '';

    // The inner life: beliefs (from reflection), recent dreams/sayings/resolutions,
    // and a couple of recent memories.
    const mem = world.getComponent<Memory>(e, C_MEMORY);
    let mind = '';
    if (mem && (mem.beliefs.length > 0 || mem.events.length > 0)) {
      const beliefs = mem.beliefs.length
        ? mem.beliefs.map(b => `<div style="color:#bcd">“…${b.text}”</div>`).join('')
        : '<div style="color:#778">no settled beliefs yet</div>';
      const glyph = { say: '❝', dream: '☾', decide: '➜' } as const;
      const said = mem.utterances.slice(-3).reverse()
        .map(u => `<div style="color:#b9c6e6">${glyph[u.kind]} ${u.text}</div>`).join('');
      const recent = mem.events.slice(-3).reverse()
        .map(m => `<div style="color:#99a">· ${m.text}</div>`).join('');
      // Episodic summaries: the compressed older life, newest era first.
      const earlier = mem.summaries.slice(-2).reverse()
        .map(s => `<div style="color:#8a8a9a">❧ ${s.text}</div>`).join('');
      const memCount = mem.events.length + mem.summaries.reduce((n, s) => n + s.count, 0);
      // The causal life-purpose (D26): the vow that bends how hard they strive.
      const purpose = mem.purpose ?? 0;
      const drive = purpose > 0.05 ? ' · strives for it' : purpose < -0.05 ? ' · grief pulls them back' : '';
      const vowLine = mem.vow
        ? `<div style="color:#ffd27a">⚑ vows ${mem.vow}<span style="color:#998">${drive}</span></div>` : '';
      mind = `<hr style="${RULE}">
        <div style="${SECTION}">Mind &nbsp;<span style="color:#789">${memCount} memories</span></div>
        ${vowLine}${beliefs}${said}${recent}${earlier}`;
    }

    return `
      ${this.title(agent.name, magic ? `sapient · folk · ${schoolOf(magic.school)?.name.toLowerCase() ?? 'mage'}` : 'sapient · folk')}
      ${speciesLine}
      ${tongueLine}
      ${learnedLine}
      ${this.terrainLine(world, pos)}
      <div><b>Sex / Age</b> ${sexGlyph} · ${ageYears}y</div>
      <div><b>Action</b> ${agent.action}</div>
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Needs</div>
      <div>Hunger ${bar(needs.hunger)}</div>
      <div>Energy ${bar(needs.energy)}</div>
      <div>Social ${bar(needs.social)}</div>
      <div>Fun ${bar(needs.fun ?? 1)}</div>
      ${moodLine}
      ${healthBlock}
      ${afflictLine}
      ${questLine}
      ${wardLine}
      ${enchLine}
      ${voyageLine}
      ${livelihoodBlock}
      ${carryingBlock}
      ${family}
      ${tiesBlock}
      ${this._bodyBlock(world, e)}
      ${this._allegianceBlock(world, e, agent)}
      ${this._faithBlock(world, agent)}
      ${this._cultureBlock(world, agent)}
      ${magicBlock}
      ${mind}`;
  }

  // Body (M13): the six ability scores + a one-line physical description, all heritable.
  private _bodyBlock(world: World, e: EntityId): string {
    const b = world.getComponent<Body>(e, C_BODY);
    if (!b) return '';
    const score = (label: string, v: number) => `<span style="display:inline-block;min-width:60px">${label} <b style="color:#dde">${v}</b></span>`;
    const al = world.getComponent<Alignment>(e, C_ALIGNMENT);
    const pers = world.getComponent<Personality>(e, C_PERSONALITY);
    const charBits = [pers ? traitsOf(pers).join(', ') : '', al ? alignmentName(al) : ''].filter(Boolean).join(' · ');
    const charLine = charBits ? `<div style="color:#c9b6e6;margin-top:3px">${charBits}</div>` : '';
    const cmb = world.getComponent<Combat>(e, C_COMBAT);
    const combatLine = cmb && (cmb.scars > 0 || cmb.kills > 0)
      ? `<div style="color:#e0a0a0;margin-top:3px">⚔ a veteran${cmb.kills > 0 ? ` — ${cmb.kills} ${cmb.kills === 1 ? 'kill' : 'kills'}` : ''}${cmb.scars > 0 ? `${cmb.kills > 0 ? ',' : ' —'} ${cmb.scars} ${cmb.scars === 1 ? 'scar' : 'scars'}` : ''}</div>`
      : '';
    const crm = world.getComponent<Crime>(e, C_CRIME);
    const crimeBits = crm ? [
      crm.murders ? `${crm.murders} ${crm.murders === 1 ? 'murder' : 'murders'}` : '',
      crm.assaults ? `${crm.assaults} ${crm.assaults === 1 ? 'assault' : 'assaults'}` : '',
      crm.thefts ? `${crm.thefts} ${crm.thefts === 1 ? 'theft' : 'thefts'}` : '',
    ].filter(Boolean).join(', ') : '';
    const crimeLine = crimeBits ? `<div style="color:#ff8a8a;margin-top:3px">⚖ an outlaw — ${crimeBits}</div>` : '';
    const eq = world.getComponent<Equipment>(e, C_EQUIPMENT);
    const eqBits = eq ? [eq.weapon > 0 ? `a weapon (+${eq.weapon})` : '', eq.armour > 0 ? `armour (+${eq.armour})` : ''].filter(Boolean).join(', ') : '';
    const eqLine = eqBits ? `<div style="color:#9ec6e0;margin-top:3px">⚔ equipped — ${eqBits}</div>` : '';
    return `<hr style="${RULE}">
      <div style="${SECTION}">Body &amp; character</div>
      <div style="line-height:1.9">${score('STR', b.str)}${score('DEX', b.dex)}${score('CON', b.con)}<br>${score('INT', b.int)}${score('WIS', b.wis)}${score('CHA', b.cha)}</div>
      <div style="color:#9ab;margin-top:3px">${b.heightCm}cm · ${buildWord(b)} build · ${eyeColour(b)} eyes · ${hairColour(b)} hair</div>
      ${charLine}${combatLine}${eqLine}${crimeLine}`;
  }

  // Clan (M14/M20): the clan this person belongs to — both their kin-line (its name is their
  // surname) and their faction (with a government). Whether they lead it.
  private _allegianceBlock(world: World, e: EntityId, agent: Agent): string {
    const store = getOrgStore(world);
    const org = agent.orgId && store ? getOrg(store, agent.orgId) : undefined;
    if (!org) return '';
    const role = org.leader === e ? ' <span style="color:#ffd27a">· leads it</span>' : '';
    const seafaring = (org.effects?.seafaring ?? 0) > 0
      ? '<div style="color:#7fb8cf">⛵ seafaring — they cross the water by boat</div>' : '';
    // The clan's tech age (M17) — surfaces the tech system on the folk who live it.
    const tier = Math.max(1, Math.min(7, org.tier ?? 1));
    const arts = org.techs?.length ?? 0;
    const eraLine = `<div style="color:#c9b27a">⚒ ${ERA_NAMES[tier]}${arts > 0 ? ` · ${arts} ${arts === 1 ? 'art' : 'arts'} mastered` : ''}</div>`;
    return `<hr style="${RULE}">
      <div style="${SECTION}">Clan</div>
      <div><span style="color:${org.color}">${org.name}</span>${role}</div>
      <div style="color:#9ab">${org.government} · kin &amp; faction</div>
      ${eraLine}
      ${seafaring}`;
  }

  // Faith (M18): the religion this person follows — its deity, tenets, and their devoutness.
  private _faithBlock(world: World, agent: Agent): string {
    const store = getReligionStore(world);
    const r = agent.religionId && store ? getReligion(store, agent.religionId) : undefined;
    if (!r) return '';
    const parent = r.parent && store!.byId[r.parent] ? ` <span style="color:#889">⟵ ${store!.byId[r.parent].name}</span>` : '';
    const piety = r.fervor > 0.66 ? 'devout' : r.fervor > 0.4 ? 'observant' : 'lax';
    return `<hr style="${RULE}">
      <div style="${SECTION}">Faith</div>
      <div><span style="color:${r.color}">●</span> ${r.name}${parent}</div>
      <div style="color:#9ab;font-size:11px">venerates ${r.deity} · ${r.tenets.join(', ')} · ${piety}</div>`;
  }

  // Culture: the value axes that bias this person's behaviour (M7), shown as bars
  // with the high pole named, plus their practices.
  private _cultureBlock(world: World, agent: Agent): string {
    const store = getCultureStore(world);
    const c = agent.cultureId && store ? getCulture(store, agent.cultureId) : undefined;
    if (!c) return '';
    const axis = (label: string, v: number) => `<div>${label} ${bar(v)}</div>`;
    const parent = c.parent && store && store.byId[c.parent] ? store.byId[c.parent].name : null;
    return `<hr style="${RULE}">
      <div style="${SECTION}">Culture</div>
      <div><b>${c.name}</b>${parent ? ` <span style="color:#889">⟵ ${parent}</span>` : ''}</div>
      ${axis('Communal', c.values.communal)}
      ${axis('Martial', c.values.martial)}
      ${axis('Traditional', c.values.traditional)}
      ${axis('Open', c.values.open)}
      ${c.practices.length ? `<div style="color:#889;margin-top:3px">${c.practices.join(', ')}</div>` : ''}`;
  }

  private _business(world: World, e: EntityId, pos: Position): string {
    const biz = world.getComponent<Business>(e, C_BUSINESS)!;
    // Count current staff.
    let staff = 0;
    for (const a of world.query(C_AGENT, C_JOB)) {
      if (world.getComponent<Job>(a, C_JOB)!.employer === e) staff++;
    }
    // A fishery's catch depends on the fish nearby — show what swims in reach (M24).
    let fisheryLine = '';
    if (biz.fishery) {
      let nearFish = 0;
      for (const fe of world.query(C_FISH, C_POSITION)) {
        const fp = world.getComponent<Position>(fe, C_POSITION)!;
        if (Math.max(Math.abs(fp.x - pos.x), Math.abs(fp.y - pos.y)) <= 5) nearFish++;
      }
      fisheryLine = `<div style="color:#7fb8cf">🐟 ${nearFish === 0 ? 'fished-out waters — a poor catch' : `${nearFish} fish within the nets`}</div>`;
    }
    return `
      ${this.title(biz.fishery ? biz.professionName + 'y' : biz.professionName + ' house', biz.fishery ? 'fishery · by the water' : 'business · employer')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Business</div>
      <div><b>Trade</b> <span style="color:${biz.color}">${biz.professionName}</span></div>
      <div><b>Staff</b> ${staff} / ${biz.maxEmployees}</div>
      <div><b>Balance</b> ${biz.balance.toFixed(0)}g</div>
      ${fisheryLine}`;
  }

  private _home(world: World, e: EntityId, pos: Position): string {
    const home = world.getComponent<Home>(e, C_HOME)!;
    // Resolve the owner's name whether they're living (Agent) or remembered (Tombstone).
    const ownerName = world.hasComponent(home.owner, C_AGENT)
      ? world.getComponent<Agent>(home.owner, C_AGENT)!.name
      : world.hasComponent(home.owner, C_TOMBSTONE)
        ? `${world.getComponent<Tombstone>(home.owner, C_TOMBSTONE)!.name} (late)`
        : 'unknown';
    const builtYear = Math.floor(home.builtTick / (defaultConfig.ticksPerDay * defaultConfig.daysPerYear));
    return `
      ${this.title('Home', 'a dwelling · owned')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Home</div>
      <div><b>Owner</b> ${ownerName}</div>
      <div style="color:#889">Built in year ${builtYear}</div>`;
  }

  private _wonder(world: World, e: EntityId, pos: Position): string {
    const w = world.getComponent<WonderSite>(e, C_WONDERSITE)!;
    const builtYear = Math.floor(w.builtTick / (defaultConfig.ticksPerDay * defaultConfig.daysPerYear));
    return `
      ${this.title(w.name, 'a wonder of the age')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Wonder</div>
      <div style="color:#e8c674">🏛 ${w.name}</div>
      <div style="color:#9ab">a town-scale work, raised by the labour of generations</div>
      <div style="color:#889;font-size:11px">completed in year ${builtYear}</div>`;
  }

  private _ruin(world: World, e: EntityId, pos: Position): string {
    const r = world.getComponent<Ruin>(e, C_RUIN)!;
    const builtYear = Math.floor(r.sinceTick / (defaultConfig.ticksPerDay * defaultConfig.daysPerYear));
    return `
      ${this.title('Ruins', 'a site of the past · archaeology')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Ruin</div>
      <div style="color:#cbb89a">${r.what}</div>
      <div style="color:${r.discovered ? '#8fe0a0' : '#998'}">${r.discovered ? 'uncovered' : 'unexplored — a folk may yet stumble on it'}</div>
      <div style="color:#889;font-size:11px">appeared in year ${builtYear}</div>`;
  }

  private _civic(world: World, e: EntityId, pos: Position): string {
    const c = world.getComponent<Civic>(e, C_CIVIC)!;
    const fn = c.effect === 'heal'
      ? `<div style="color:#8fe0a0">🜨 Heals the sick &amp; wounded within ${c.radius} tiles.</div>`
      : c.effect === 'cheer'
        ? `<div style="color:#ffd27a">🍺 Lifts the spirits of folk within ${c.radius} tiles.</div>`
        : c.effect === 'ward'
          ? `<div style="color:#9ec6e0">⚖ Keeps the peace — crime is rarer within ${c.radius} tiles.</div>`
          : c.effect === 'trade'
            ? `<div style="color:#e0b97a">⚖ A cheaper living — provisions cost less within ${c.radius} tiles.</div>`
            : c.effect === 'hone'
              ? `<div style="color:#b9c0cc">⚒ Crafters within ${c.radius} tiles hone their skill faster.</div>`
              : `<div style="color:#9ab">A place the town holds in common.</div>`;
    return `
      ${this.title(c.name, c.effect ? 'a civic place · serves the town' : 'a civic place · shared by all')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Civic</div>
      ${fn}`;
  }

  // A special agent (M21): a monster or uncanny visitor — its menace, condition, and how long
  // before it fades back into the wilds.
  private _special(world: World, e: EntityId, pos: Position): string {
    const s = world.getComponent<Special>(e, C_SPECIAL)!;
    const health = world.getComponent<Health>(e, C_HEALTH);
    const clockEnts = world.query(C_CLOCK);
    const tick = clockEnts.length ? world.getComponent<Clock>(clockEnts[0], C_CLOCK)!.tick : 0;
    const daysLeft = Math.max(0, (s.despawnTick - tick) / defaultConfig.ticksPerDay);
    const guardian = s.behavior === 'guardian';
    const menace = guardian
      ? '<div style="color:#8fd8ff">A summoned guardian — it hunts and smites the beasts that menace its summoner\'s folk.</div>'
      : s.behavior === 'predator'
      ? '<div style="color:#ff8a8a">A predator — it hunts the folk, and a brave band must bring it down.</div>'
      : '<div style="color:#bcd">A haunt — it draws no blood, but its passing unsettles all who feel it near.</div>';
    const name = s.name.charAt(0).toUpperCase() + s.name.slice(1);
    return `
      ${this.title(name, guardian ? 'a conjured guardian · summon' : 'a special agent · monster')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">${guardian ? 'Nature' : 'Menace'}</div>
      ${menace}
      ${health ? `<div>Vigour ${bar(health.value)}</div>` : ''}
      <hr style="${RULE}">
      <div style="${SECTION}">Nature</div>
      <div style="line-height:1.9"><span style="display:inline-block;min-width:60px">STR <b style="color:#dde">${s.str}</b></span><span style="display:inline-block;min-width:60px">DEX <b style="color:#dde">${s.dex}</b></span><span style="display:inline-block;min-width:60px">CON <b style="color:#dde">${s.con}</b></span></div>
      <div style="color:#889">It will ${guardian ? 'endure' : 'haunt the land'} for about ${daysLeft.toFixed(1)} more days.</div>`;
  }

  private _fauna(world: World, e: EntityId, pos: Position): string {
    const fa = world.getComponent<Fauna>(e, C_FAUNA)!;
    const curse = world.getComponent<Curse>(e, C_CURSE);
    const curseLine = curse ? `<div style="color:#c98fe0">☠ cursed — its blows are sapped</div>` : '';
    return `
      ${this.title(fa.name, 'fauna · instinct (no LLM)')}
      <div><b>Colour</b> <span style="color:${fa.color}">${fa.color}</span></div>
      ${this.terrainLine(world, pos)}
      ${curseLine}
      <div><b>Age</b> ${fa.ticksAlive} ticks</div>
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Instinct</div>
      <div>Hunger ${bar(fa.hunger)}</div>
      <div><b>Breed in</b> ${fa.breedCooldownTicks} ticks</div>`;
  }

  // A fish (M24): aquatic life that swims the water — caught for food by the fishing trade.
  private _fish(world: World, pos: Position): string {
    return `
      ${this.title('A fish', 'aquatic life · instinct')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Aquatic</div>
      <div style="color:#9ab">It swims the water in shoals, and may be netted for food.</div>`;
  }

  // A bare tile (M24): clicking empty ground or water shows the terrain itself — land or water,
  // what biome it is, and (for water) the shoals swimming in it.
  private _tile(world: World, x: number, y: number): string {
    const mapEnts = world.query(C_TILEMAP);
    const map = mapEnts.length ? world.getComponent<TileMapData>(mapEnts[0], C_TILEMAP) : undefined;
    if (!map || !inBounds(map, x, y)) return this.title('Beyond the map', 'the unknown edge');
    const name = biomeNameAt(map, x, y);
    const water = isWater(map, x, y);
    if (water) {
      let fishHere = 0;
      for (const e of world.query(C_FISH, C_POSITION)) {
        const p = world.getComponent<Position>(e, C_POSITION)!;
        if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 1) fishHere++;
      }
      const stock = fishHere === 0 ? 'still, empty water' : `${fishHere} fish in these waters`;
      // Once any tribe has mastered Seafaring, boats can cross the water (M24).
      const store = getOrgStore(world);
      const boats = !!store && Object.values(store.byId).some(o => (o.effects?.seafaring ?? 0) > 0);
      const sub = boats ? 'water · boats can cross it' : 'water · folk cannot cross it (yet)';
      const crossLine = boats
        ? 'Deep water — but the folk have boats now, and cross it.'
        : 'Deep water — impassable on foot. A boat will one day cross it.';
      return `
        ${this.title(name, sub)}
        <div><b>Pos</b> (${x}, ${y})</div>
        <hr style="${RULE}">
        <div style="${SECTION}">Water</div>
        <div style="color:#9ab">${crossLine}</div>
        <div style="color:#7fb8cf">🐟 ${stock}</div>`;
    }
    return `
      ${this.title(name, 'open ground')}
      <div><b>Pos</b> (${x}, ${y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Terrain</div>
      <div style="color:#9ab">Passable land — folk walk, build, and forage here.</div>`;
  }

  private _flora(world: World, e: EntityId, pos: Position): string {
    const f = world.getComponent<Flora>(e, C_FLORA)!;
    const ripe = f.maturity >= f.edibleAt ? '<span style="color:#8f8">ripe</span>' : 'growing';
    return `
      ${this.title(f.name, 'flora · no brain')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Plant</div>
      <div>Maturity ${bar(f.maturity)}</div>
      <div><b>State</b> ${ripe}</div>
      <div><b>Food yield</b> ${f.foodYield.toFixed(2)}</div>`;
  }

  private _resource(world: World, e: EntityId, pos: Position): string {
    const r = world.getComponent<Resource>(e, C_RESOURCE)!;
    return `
      ${this.title(r.name, 'resource · no brain')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Node</div>
      <div>Amount ${bar(r.amount)}</div>
      <div><b>Type</b> ${r.renewable ? 'renewable' : 'finite'}</div>`;
  }
}
