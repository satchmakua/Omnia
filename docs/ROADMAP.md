# ROADMAP.md — Ordered, Bounded Backlog

"Keep going" = do the next unchecked task in the **current milestone**. Finish a milestone before starting the next. New ideas go to the Backlog at the bottom, not built on sight.

Each milestone has a **Goal** and a **Definition of Done (DoD)**. A milestone is complete only when its DoD holds and the build is green.

> Ordering rationale: foundation first, then the content layer (everything flavorful depends on it), then the world the agents inhabit, then economy, then the social life cycle, then the LLM soul, then history compression, and finally the deep generational systems (culture/language) that need history to exist. Magic ships *with* the capability system (it's just the rare tradition), not as its own milestone.

---

## ✅ Milestone 0 — Foundation & Heartbeat  *(done — 2026-06-08)*

**Goal:** a running, tested skeleton that proves the whole loop end to end.

- [x] Scaffold the TypeScript project; choose and wire an ECS implementation (hand-rolled is fine).
- [x] Single **seeded RNG**; ban `Math.random()` in sim code.
- [x] Headless fixed-timestep **tick loop** with deterministic system ordering.
- [x] Test runner + first **unit**, **seed**, and **soak** tests; GitHub Actions CI.
- [x] Tiny world: a grid, ~20 agents (one hardcoded "human" type for now) with `Position`, `Needs` (hunger, energy), `Wallet`; `MovementSystem`, `HungerSystem`, a day/night clock.
- [x] **Utility action selector** (no LLM): seek food when hungry, sleep when tired, else wander. Agents die if hunger bottoms out.
- [x] Minimal renderer: dots on a grid + click-to-open inspector panel.
- [x] Fill in the command list in `CLAUDE.md` and the Run section in `README.md`.

**DoD:** `test` green (33 tests); 10,000-tick headless `soak` passes (37 ms, 0 violations); renderer shows moving dots and inspector opens on click.

---

## ✅ Milestone 1 — Content Framework & Species  *(done — 2026-06-08)*

**Goal:** stand up the data-driven content layer; make agents data, not code.

- [x] YAML loader + **schema validation** (Zod, schema-as-type), building typed **registries**. Bad content fails loud at startup (per `CONTENT_AND_DATA.md`).
- [x] Convert the hardcoded human into a data-driven `human` **species archetype**; add `dwarf` as content.
- [x] Spawn agents from archetypes (weighted species roll + rolled values, species tags).
- [x] A *simple* per-species **name generator** (curated sound pools) — placeholder until M7.
- [x] First capability **effect tag** (`forage` → `restore_hunger`) wired end to end as a proof of the data/behavior boundary.

**DoD:** content loads and validates (Zod `.strict()`); a deliberately broken file aborts startup with a clear, file-named message (8 fail-loud tests); 2 species defined purely in YAML produce visibly distinct agents (verified: dwarves' lower hunger multiplier lets them outlast humans in soak; distinct ring colour + dot size in the renderer). 66 tests green.

## ✅ Milestone 2 — World & Environment  *(done — 2026-06-12)*

**Goal:** the world agents live in, and the entity/brain tiers.

- [x] Biomes, terrain, the tile grid (from content). *(S4: 5 biomes; seeded Voronoi tile grid; passability in movement + spawning.)*
- [x] **Flora** (grow/spread/harvest), **fauna** (instinct-only light agents), **resources** (renewable + finite). *(S5: 4 flora, 2 fauna, 3 resources as YAML; FloraSystem grow/spread, FaunaSystem graze/breed/starve, ResourceSystem regen; biome spawn tables with load-time referential integrity.)*
- [x] Formalize the **brain tiers**: sapient (full), fauna (instinct, no LLM), flora/resources (no brain). *(S5: `src/sim/tiers.ts`; mutually-exclusive component markers so the LLM layer can only ever attach to sapient folk.)*
- [x] Seeded **world generation**. *(S4 terrain; S5 flora/fauna/resource placement.)*
- [x] Invent the post-apocalyptic backstory as the first Chronicle entries. *(S5: `src/history/` Chronicle + deterministic backstory; viewable in-app with the C key.)*

**DoD:** a generated world with biomes, growing flora, roaming fauna, and harvestable resources runs stably for many sim-years (10k-tick soak, 0 violations) — met; an overgrazed fauna population **can crash** and it's detectable by counting (tested in `ecosystem.test.ts`). 102 tests green.

## ✅ Milestone 3 — Economy, Work & Capabilities  *(done — 2026-06-13)*

**Goal:** agents make a living; the unified magic/technology system lands.

- [x] Jobs, employers, wages; `EconomySystem`; spend on food/shelter; debt when broke; businesses as org entities. *(S7: 5 professions; businesses at world-gen; hiring; wages from business balance; daily upkeep → debt; per-agent wealth goal bounds accumulation.)* — supply/demand **market** deferred (backlog).
- [x] The unified **Capability system**: invoke → prerequisites → cost → effect. *(S8: `canInvoke`/`invokeCapability` — one code path for both traditions; checks aptitude + mana/energy cost, then applies effect tags.)*
- [x] **Technology** tradition (common, knowledge-gated). *(S8: `forage` is the common, ungated tech capability.)* — resource-consuming crafting deferred (backlog).
- [x] **Magic** tradition (rare, aptitude-gated): innate aptitude rolled per species; mana cost; magical professions. *(S8: `Magic` component on the rare aptitude-rolled agents; `conjure_meal`/`mend_vigor` cast via `CapabilitySystem`; `hedge_witch` profession hires only the gifted.)*
- [x] Wealth-distribution metric. *(S7: `src/sim/wealth.ts` — net-worth min/median/mean/max + Gini; in soak + HUD.)*

**DoD:** agents earn/spend and can prosper or go broke; capabilities of both traditions work through one engine; magic is visibly rare (most agents lack aptitude — ~8/300 in tests, often 0–1 per town); economy stable over many sim-years (Gini ~0.2–0.3, no runaway debt, 0 violations over 10k ticks); tested. **Met.** *(Deferred to backlog: supply/demand market, resource-consuming crafting, skill/knowledge gating.)*

## ✅ Milestone 4 — Relationships & Life Cycle  *(done — 2026-06-14)*

**Goal:** people connect, reproduce, age, and die across generations.

- [x] `Relationships` graph (sentiment + type); `SocialSystem`; social need. *(S9: proximity interactions build friend edges; social need decays and is met by company.)*
- [x] Courtship → marriage; reproduction, children, `Lineage`; aging. *(S9 marriage + aging; S10 reproduction: married opposite-sex couples bear children wired into `Lineage`; a matchmaking pass pairs unattached adults so households keep forming.)*
- [x] Illness, injury, death; **tombstone** records on death (`SIMULATION_MODEL.md`). *(S9: `HealthSystem` illness + age-ramped mortality; death strips living components and leaves a compact `Tombstone`, keeping the entity id so lineage pointers resolve.)*

**DoD:** the town sustains itself across several generations (no collapse/explosion); family trees form; deaths free agents into tombstones; tested. **Met** — population climbs to a carrying-capacity cap and holds there across 100+ sim-years (0 violations); grandchildren (3rd generation) appear; a dedicated multi-generation test asserts bounded population + a 3-deep lineage. Magic aptitude is heritable (runs in families, stays uncommon).

## ✅ Milestone 5 — The Soul (LLM layer)  *(done — 2026-06-15)*

**Goal:** an inner life via the local model, off the hot path.

- [x] `AIProvider` + Ollama; concurrency cap; timeout fallback. *(S12: `AIProvider` interface; deterministic `StubProvider` default (headless/reproducible); `OllamaProvider` opt-in; `AIRunner` queue with concurrency cap + timeout fallback, off the hot path.)*
- [x] Memory **stream + retrieval** (recency × importance × relevance); **reflection** into beliefs on a schedule. *(S12: `Memory` component; life events captured with importance; embedding-based retrieval; throttled `AISystem` reflection → beliefs.)*
- [x] LLM-driven **dialogue** at meaningful moments; major-decision prompting; dreams. *(S13: `AISystem` expression passes — co-located partners/friends exchange a themed line; a fresh turning-point memory (wedding/birth/bereavement, importance ≥ 0.65) prompts a first-person resolution; sleeping agents at night dream from their memories. All on the deterministic `completeSync` path (no RNG), recorded for replay, throttled by a shared per-tick budget + per-agent interval, bounded per agent. Pure flavour — never fed back into the trajectory. Shown in the feed (❝/☾/➜) + the inspector's Mind.)*
- [x] **Record LLM responses into the event log** for deterministic replay. *(S12: responses recorded to an `AIRecord` singleton; `RecordedProvider` replays; a test proves a non-deterministic run replays identically — now covering utterances as well as beliefs.)*

**DoD:** agents converse and reflect believably within budget (rare, throttled); the sim never stalls on a model call; seed-replay reproduces given recorded responses. **Met** — dialogue/dreams/resolutions appear, themed and bounded (40k-tick soak: 0 violations, `utters` climbs to ~287 across 60 folk and stays bounded); the soul runs only on the synchronous deterministic path so the tick never blocks; the replay test reproduces both beliefs and utterances of a non-deterministic run. *(Still deferred to backlog: wiring the async `AIRunner`/Ollama path into the live loop so a real model generates across ticks — the seam + recording are ready; the deterministic stub remains the default.)*

## ✅ Milestone 6 — History & Legends  *(done — 2026-06-15)*

**Goal:** the compression pipeline — rich history, bounded cost.

- [x] Importance scoring; scheduled **rollups & pruning** of agent memory (multi-resolution). *(S14: `remember()` is now pure-append; a scheduled `MemorySystem` rolls a working set past `workingMemorySize` down into bounded **episodic summaries** (`ai/consolidation.ts`) — high-importance events stay named/vivid, trivia dissolves into a count, and old summaries merge into coarser eras. Deterministic, no RNG, off the hot path. Three resolutions per agent: raw working memory → episodic summaries → beliefs (M5). Shown in the inspector's Mind (❧).)*
- [x] The **Chronicle** (notable events only, itself tiered); **statistical strata** feeding world-health charts. *(S15: `chronicleAdd` now gates on an importance threshold; a scheduled `HistorySystem` compresses the Chronicle (`consolidateChronicle`) — recent legends stay sharp, ancient ones roll into one-line **eras** where the founding cataclysm (importance 1.0) survives by name and ordinary births/weddings/deaths dissolve into a tally; eras merge to stay bounded. **Statistical strata** (`history/stats.ts`): a `WorldStats` singleton sampled yearly with a bounded time-series — population, births/deaths, marriages, mages, Gini, median wealth, avg age — plus a cumulative cause-of-death histogram, all derived from durable state (living agents + tombstones), no coupling, no RNG.)*
- [x] A **Legends view** UI to browse the town's history. *(S15: `legendsPanel.ts` (replaces the minimal chronicle panel, still the C key) — reads as a story: recent named legends, an "Ages past" section of compressed eras, then "The town in numbers" lo-fi SVG sparklines (population / median wealth / Gini / births-deaths) and a cause-of-death breakdown.)*

**DoD:** after many generations, total state stays bounded *and* Legends reads like a story, not a spreadsheet (the qualitative test in `SIMULATION_MODEL.md`). **Met** — 40k-tick soak: 0 violations, eras bounded (≤8, saw 3), strata samples bounded (≤80, saw 38), Chronicle/memory bounded; verified live that Legends opens with named recent legends + a founding-cataclysm era preserved by name + ordinary events as tallies + world-health charts.

## ✅ Milestone 6.5 — Visual & UI Overhaul  *(done — 2026-06-15; human-requested, inserted after M6)*

**Goal:** make the simulation *legible* — recognizable map symbols (map-legend clarity, not invisible per-race outlines), a camera you can zoom/pan, and a more sophisticated UI (menus + hotkey dashboards). Readability before lo-fi polish; D13's aesthetic pass still comes later.

- [x] **Readability core (slice 1):** a **category-first icon set** (dual-coded shape + accent colour, in `render/icons.ts`) replacing the per-race silhouettes — one folk icon (races not distinguished, per the human), folk **state badges** (mage ✦ / ill ✚ / action / child-as-smaller), distinct **animal / plant / ore / timber / crystal / building** icons, and a **dormant hostile** slot reserved for M8. A **camera**: wheel-zoom toward the cursor, drag + arrow-key pan (+/− zoom), clamped to the map; click-to-inspect made camera-aware. An on-screen **legend key** (`render/legend.ts`, `L`). *(S16)*
- [x] **Menus (slice 2):** a **start menu** (new simulation with a chosen seed, how-to-play) and an in-game **pause menu** (resume, restart-same-seed, quit to menu), via a `menu`/`running`/`paused` state machine in `main.ts` (Esc). The sim is now (re)created on demand, so seeds can be tried without reload. *(S17)*
- [x] **Liveliness + collision + minimizable panels** (S17, human-requested alongside slice 2): mobile creatures (folk + fauna) **never share a tile** (`Occupancy` in `movementUtil`; soak invariant), which also fixed the *stuck-coworkers-freeze* bug; **social/dialogue moved to adjacency** (the 8-neighbourhood) so company still meets the need under collision; a small **work fidget** keeps employed folk from looking frozen; the always-on overlays (legend, Town Happenings) are now **minimizable** via a shared collapsible header (`panelUtil`).
- [x] **Hotkey dashboards (slice 3):** a shared modal base (`modalPanel`) drives three live, mutually-exclusive dashboards — **Economy** (E: wealth distribution, employment, every business with staff/balance/wage), **Directory** (F: searchable roster of all folk; click a row to inspect + jump the camera there via `renderer.centerOn`), **Family tree** (T: four-generation lineage of the inspected person, resolving the dead through tombstones; click relatives to browse the line). Population/wealth **charts** already live in the Legends view (C). A basic **Settings** (seed) was added to the pause menu. Esc backs out of a dashboard before pausing. *(S18)*

**DoD:** at a glance you can tell folk from animals from plants from resources from buildings (and, later, hostiles); you can zoom into a household or pull back to the whole town and scroll around; menus and the dashboards make the sim's depth browsable. **Met** — verified live: readable category-first map + camera (slice 1), start/pause menus (slice 2), and the Economy/Directory/Family dashboards (slice 3), all green & no console errors. The aesthetic/audio polish (D13) remains M8.

*Future tweaks noted:* graves on the map (a visible cemetery — needs tombstones to keep a `Position`); distinguish animal species / pull the hostile treatment live in M8; a fuller settings panel + more menu options.

## ▶ Milestone 7 — Culture & Language (deep)  *(current)*

**Goal:** evolving cultures and languages that **causally shape behaviour** (D26) and are **visibly legible** to the player (D27) — names, dialects, value drift, divergence, schism (`CULTURE_AND_LANGUAGE.md`). The keystone of the "two loops" thesis (D25).

Slices land one at a time, holding the **D12 tenability line** (few shared objects, slow generational schedule, procedural not LLM, generate-on-demand lexicons, compress the dead, deliberately **light grammar** — never a full syntax engine):

- [x] **Slice 1 — Seed language model + language-derived naming.** A `languages` content type (phonemes, syllable shapes, name patterns, sound-change rate) + a deterministic, on-demand word/name generator (`src/lang/language.ts`; keyed by entity id, regenerates identically, consumes no sim RNG). Two seed tongues (soft **Old Vant** / hard **Drakhan**); species reference a language; **agents are named from their tongue** (given name + a **patrilineally-inherited surname**), the M1 placeholder namer retired (`names.ts` deleted); the inspector shows each person's **Tongue** (first legibility step). *(S19–S20)*
- [x] **Slice 2 — Seed culture model (CAUSAL).** A `cultures` content type (value axes communal/martial/traditional/open, practices, cohesion, language ref) + a runtime **`CultureStore`** singleton seeded from content (ready to grow daughters in slice 4). Agents reference a culture: founders take their species' culture, **children inherit the mother's** (surname stays patrilineal). **Causal coupling (D26), first axis:** `communal` value lowers an agent's wealth goal (`wealthGoalFactor`, bounded [0.7,1.3]) — verified live & by test that the communal **Vant-kin** end up with a lower mean wealth goal (61) than the individualist **Drakhan Clans** (78). Surfaced in the inspector (culture name + value bars + practices). *(S21)*
- [x] **Slice 3 — Evolution engine.** Languages & cultures are now live, mutable runtime stores (`LanguageStore` / `CultureStore`), seeded from content. A scheduled **`EvolutionSystem`** (every `evolutionIntervalDays` ≈ 5 sim-years, off the hot path, deterministic) drifts each tongue by a probabilistic **sound change** (`applySoundChange` — a phoneme systematically becomes its shifted form, e.g. Old Vant's *i → e*) and drifts each culture's value axes by a small random walk damped by `cohesion`. **Names of the later-born drift** (spawn resolves the *runtime* tongue). Sound changes are recorded as **Chronicle legends** ("The Old Vant tongue shifted: 'i' became 'e'") — visibly evolving (D27). *(S22)* — event-driven value response (famine→thrift, war→militarism) deferred until those events exist.
- [ ] **Slice 4 — Divergence → families & schism.** A population split / cohesion drop forks a daughter language/culture that accumulates *independent* drift → a **family tree**; the Chronicle records schisms and lost tongues. Contact/borrowing as a stretch.
- [ ] **Slice 5 — Compression + the legibility lens.** Dead tongues/cultures compress to compact descent records (like tombstones); a **"lineages of tongues & cultures" lens** (D27) lets the player *see* the evolution — the family tree, a name's then-vs-now, a culture's value bars shifting across the years.

**DoD:** from seed cultures/languages the sim produces a **language family tree** and **≥1 cultural schism** over deep time; **culture measurably changes behaviour** (a test shows a value axis shifting an action/outcome distribution); the evolution is **visible in-app**, not just in the data; within the performance budget; tenability tested (object counts + per-era cost bounded).

## Milestone 7.5 — Live Model Integration (the real soul, opt-in)  *(D28)*

**Goal:** wire the live local model (Ollama) through the existing `AIRunner` as an **opt-in mode** so dialogue, dreams, reflection, and language/culture **glosses** become genuinely novel — the deterministic stub stays the default for headless/CI/replay.

- [ ] Drive `OllamaProvider` async off the hot path; apply results across ticks; **record** every response (replay stays exact).
- [ ] A drain/apply step in `AISystem`; graceful timeout fallback to the stub.
- [ ] A toggle (config/menu) for stub vs. live; document the local-model setup.

**DoD:** with a model installed, agents converse/gloss in genuinely varied language within budget, never stalling the tick; the run records and replays identically via `RecordedProvider`; with no model installed, nothing changes (stub default).

## Milestone 7.7 — Science & Instrumentation  *(D29)*

**Goal:** cash in the perfect determinism as real experiment tooling — turn "it didn't crash" (verification) into "it reproduces a known pattern" (validation).

- [ ] **Measure** emergent structure: wealth/Pareto fit, social-network metrics (clustering, path length, small-worldness), demographic curves, Zipfian word/name frequency, language-family shape.
- [ ] **Sweep** parameters to locate phase transitions / tipping points (e.g. population-collapse and overgrazing thresholds).
- [ ] **Export/diff** runs: event-log/CSV export, run manifests (seed + config), a run-diff.
- [ ] Surface key metrics in the Legends / charts views.

**DoD:** a documented analysis showing ≥1 emergent statistical regularity (e.g. an approximately power-law wealth tail or a small-world social graph) and ≥1 located phase transition, reproducible from an exported manifest.

## Milestone 8+ — Economy Depth, Building, Social Structures, Vice, UI & Refinement

**Goal:** emergent groups, a deeper tactile economy, the messier side of life, and durability. *(The human-requested interactions are baked in here: resource gathering shipped early in M4.5; trade/market, building, and conflict/vice live below.)*

- [ ] **Economy depth** (completes M3's deferred economy): a supply/demand **market** — prices that move with supply/demand, agents buying food/goods, business revenue from real sales (not abstract productivity), and businesses that can go bankrupt and close. *(human pick: trade/market)*
- [ ] **Resource economy coupling**: gathered ore/timber/crystal feed **crafting** into goods and business revenue, so depletion has real consequences; **skill/knowledge gating** for technology (learn-by-doing / apprenticeship). *(completes M3 capability deferrals)*
- [ ] **Building**: agents construct homes and businesses from gathered resources over time, instead of being pre-placed — visible growth of the town. *(human pick: building)*
- [ ] **Social structures**: companies, gangs, families-as-institutions, factions, dynasties; reputation; succession.
- [ ] **Conflict & vice**: rivalries, **crime, theft, assault/fights**, gambling, drinking, affairs/betrayal. *(human pick: conflict/vice)*
- [ ] **UI depth:** rich inspector, relationship/**family-tree views** (browse ancestry + tombstones), charts (population, wealth, mood), event feed, time controls, search.
- [ ] **Aesthetic/audio:** pastel/lo-fi styling pass; lo-fi ambient music layer; smoother motion (interpolate entity positions between ticks).
- [ ] Save/load; scenario seeds; a **YAML config loader** (make `simulation.yaml` the live tunables); balance via the world-health dashboard; performance against budget.
- [ ] Optional: procedural regeneration of deep history (`SIMULATION_MODEL.md`, Mechanism 6).

**DoD:** open-ended; "refine" lives here once M0–M7 are done.

---

## Backlog (unsorted — promote into a milestone before building)

*(Append new ideas here with a date. Do not build directly from this list.)*

- **God-sim fork (future direction, D30):** give the player in-sim agency — nudges, triggered events, set goals. Designed-*for* now (a player intervention is just another recordable event in the deterministic log) but **not built**; the human may fork here once the observed world is compelling enough — date: 2026-06-15.
- More traditions for the capability system (alchemy, bio-engineering, ritual) — date: founding.
- Domestication of fauna; agriculture depth — date: founding.
- Renderer: interpolate entity positions between ticks for smooth gliding motion (currently entities snap a cell per tick) — date: 2026-06-13.
- Economy: a real supply/demand **market** (prices, goods, business revenue from actual sales rather than abstract productivity); businesses that can go bankrupt and close — date: 2026-06-13 (deferred from M3 part 1). *(Human-requested next after resource gathering.)*
- Agents **building** structures (homes/businesses) from gathered resources over time, instead of pre-placed — date: 2026-06-14 (human-requested).
- **Conflict / vice**: rivalries, crime, theft, fights (M8 theme) — date: 2026-06-14 (human-requested).
- Resource gathering **economic coupling**: gathered resources feed business revenue / crafting, so depletion has real consequences (currently gathering depletes nodes but wages are unaffected) — date: 2026-06-14.
- Capabilities: **skill/knowledge gating** for technology (learn-by-doing or apprenticeship) — date: 2026-06-13. *(Resource-consuming gathering done 2026-06-14; crafting that consumes them into goods remains.)*
- Capabilities: **lost arts** — a capability whose last knowledgeable/aptitude-holding practitioner dies becomes "lost" until rediscovered (`MAGIC_AND_TECHNOLOGY.md`) — date: 2026-06-13.
- Wealth metric: exclude (penniless) children, or weight by adults, so Gini reflects the working economy rather than demographics — date: 2026-06-14.
- **Wire a YAML config loader**: load `simulation.yaml` (moving it to `config/` per ARCHITECTURE) as the live, authoritative tunables. Today `src/sim/config.ts` is authoritative and the YAML is reference-only — found in the M0–M5 audit — date: 2026-06-14.
- Family-tree / lineage view UI (browse ancestry + tombstones); tie into the Legends view — date: 2026-06-14 (M6/M8).
- **Wire the async live-model path into the live loop**: drive `OllamaProvider` through the `AIRunner` (concurrency cap + timeout fallback) so a real model generates dialogue/dreams/reflections across ticks, applied + recorded off the hot path. The seam, runner, and recording are built & tested; only the live wiring + a results-drain step in `AISystem` remain. The deterministic stub stays the default (headless/CI/replay) — date: 2026-06-15 (deferred from M5 part 2).
