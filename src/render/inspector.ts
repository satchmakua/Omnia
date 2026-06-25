import type { World } from '../sim/ecs.ts';
import type { EntityId } from '../sim/ecs.ts';
import {
  C_AGENT, C_NEEDS, C_WALLET, C_POSITION, C_SPECIES, C_MAGIC, C_JOB, C_BUSINESS,
  C_HEALTH, C_LINEAGE, C_MEMORY, C_FAUNA, C_FLORA, C_RESOURCE, C_TILEMAP,
} from '../sim/components.ts';
import type {
  Agent, Needs, Wallet, Position, SpeciesComp, Magic, Job, Business,
  Health, Lineage, Memory, Fauna, Flora, Resource,
} from '../sim/components.ts';
import { biomeNameAt, inBounds } from '../world/tilemap.ts';
import type { TileMapData } from '../world/tilemap.ts';
import { ageInYears } from '../sim/config.ts';
import { defaultConfig } from '../sim/config.ts';
import { getCultureStore, getCulture } from '../culture/cultureStore.ts';
import { getLanguageStore, getLanguage } from '../lang/languageStore.ts';

function bar(v: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(v * 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${Math.round(v * 100)}%`;
}

const SECTION = 'color:#aac;font-size:11px;text-transform:uppercase;letter-spacing:1px';
const RULE = 'border-color:rgba(255,255,255,0.1);margin:8px 0';

export class Inspector {
  private readonly panel: HTMLDivElement;
  private readonly bodyEl: HTMLDivElement;
  private selected: EntityId | null = null;

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
    this.panel.style.display = 'block';
    this._render(entity, world);
  }

  /** The currently-inspected entity, if any (used by the family-tree dashboard). */
  get selectedEntity(): EntityId | null { return this.selected; }

  get isOpen(): boolean { return this.panel.style.display !== 'none'; }

  update(world: World): void {
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
    } else if (world.hasComponent(entity, C_FAUNA)) {
      body = this._fauna(world, entity, pos);
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
    const magicBlock = magic
      ? `<hr style="${RULE}">
         <div style="${SECTION}">Magic <span style="color:#d090f0">✦ aptitude</span></div>
         <div>Mana ${bar(magic.mana / magic.maxMana)}</div>`
      : '';

    const health = world.getComponent<Health>(e, C_HEALTH);
    const lin = world.getComponent<Lineage>(e, C_LINEAGE);
    const ageYears = Math.floor(ageInYears(agent.ticksAlive, defaultConfig));
    const sexGlyph = agent.sex === 'female' ? '♀' : '♂';

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
    const healthBlock = health
      ? `<div>Health ${bar(health.value)}${health.ill ? ' <span style="color:#f99">(ill)</span>' : ''}</div>` : '';

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
      ${this.title(agent.name, magic ? 'sapient · folk · mage' : 'sapient · folk')}
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
      ${healthBlock}
      <hr style="${RULE}">
      <div style="${SECTION}">Livelihood</div>
      ${jobLine}
      <div>Gold ${wallet.gold.toFixed(1)}</div>
      ${debtLine}
      <div style="color:#889">Goal ${Math.round(agent.wealthGoal)}g</div>
      ${family}
      ${this._cultureBlock(world, agent)}
      ${magicBlock}
      ${mind}`;
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
    return `
      ${this.title(biz.professionName + ' house', 'business · employer')}
      ${this.terrainLine(world, pos)}
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Business</div>
      <div><b>Trade</b> <span style="color:${biz.color}">${biz.professionName}</span></div>
      <div><b>Staff</b> ${staff} / ${biz.maxEmployees}</div>
      <div><b>Balance</b> ${biz.balance.toFixed(0)}g</div>`;
  }

  private _fauna(world: World, e: EntityId, pos: Position): string {
    const fa = world.getComponent<Fauna>(e, C_FAUNA)!;
    return `
      ${this.title(fa.name, 'fauna · instinct (no LLM)')}
      <div><b>Colour</b> <span style="color:${fa.color}">${fa.color}</span></div>
      ${this.terrainLine(world, pos)}
      <div><b>Age</b> ${fa.ticksAlive} ticks</div>
      <div><b>Pos</b> (${pos.x}, ${pos.y})</div>
      <hr style="${RULE}">
      <div style="${SECTION}">Instinct</div>
      <div>Hunger ${bar(fa.hunger)}</div>
      <div><b>Breed in</b> ${fa.breedCooldownTicks} ticks</div>`;
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
