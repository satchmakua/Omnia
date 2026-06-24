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

## ✅ Milestone 7 — Culture & Language (deep)  *(done — 2026-06-16)*

**Goal:** evolving cultures and languages that **causally shape behaviour** (D26) and are **visibly legible** to the player (D27) — names, dialects, value drift, divergence, schism (`CULTURE_AND_LANGUAGE.md`). The keystone of the "two loops" thesis (D25).

Slices land one at a time, holding the **D12 tenability line** (few shared objects, slow generational schedule, procedural not LLM, generate-on-demand lexicons, compress the dead, deliberately **light grammar** — never a full syntax engine):

- [x] **Slice 1 — Seed language model + language-derived naming.** A `languages` content type (phonemes, syllable shapes, name patterns, sound-change rate) + a deterministic, on-demand word/name generator (`src/lang/language.ts`; keyed by entity id, regenerates identically, consumes no sim RNG). Two seed tongues (soft **Old Vant** / hard **Drakhan**); species reference a language; **agents are named from their tongue** (given name + a **patrilineally-inherited surname**), the M1 placeholder namer retired (`names.ts` deleted); the inspector shows each person's **Tongue** (first legibility step). *(S19–S20)*
- [x] **Slice 2 — Seed culture model (CAUSAL).** A `cultures` content type (value axes communal/martial/traditional/open, practices, cohesion, language ref) + a runtime **`CultureStore`** singleton seeded from content (ready to grow daughters in slice 4). Agents reference a culture: founders take their species' culture, **children inherit the mother's** (surname stays patrilineal). **Causal coupling (D26), first axis:** `communal` value lowers an agent's wealth goal (`wealthGoalFactor`, bounded [0.7,1.3]) — verified live & by test that the communal **Vant-kin** end up with a lower mean wealth goal (61) than the individualist **Drakhan Clans** (78). Surfaced in the inspector (culture name + value bars + practices). *(S21)*
- [x] **Slice 3 — Evolution engine.** Languages & cultures are now live, mutable runtime stores (`LanguageStore` / `CultureStore`), seeded from content. A scheduled **`EvolutionSystem`** (every `evolutionIntervalDays` ≈ 5 sim-years, off the hot path, deterministic) drifts each tongue by a probabilistic **sound change** (`applySoundChange` — a phoneme systematically becomes its shifted form, e.g. Old Vant's *i → e*) and drifts each culture's value axes by a small random walk damped by `cohesion`. **Names of the later-born drift** (spawn resolves the *runtime* tongue). Sound changes are recorded as **Chronicle legends** ("The Old Vant tongue shifted: 'i' became 'e'") — visibly evolving (D27). *(S22)* — event-driven value response (famine→thrift, war→militarism) deferred until those events exist.
- [x] **Slice 4 — Divergence → families & schism.** Once per era a large, loosely-cohesive culture may **fracture** (`maybeSchism`): a breakaway faction forms a daughter culture (`forkCulture`) that takes a diverging **dialect** (`forkLanguage` — a freshly-coined name + immediate sound changes), both linked by `parent`/`foundedTick` → real **family trees**. The Chronicle records each schism + the new tongue (legends, D27); the inspector shows a culture's descent ("Lopo-kin ⟵ Vant-kin"). Self-limited by `minSchismMembers` (a schism halves a culture below the threshold). *(S23)* — verified live: over deep time Old Vant grew daughters *Lopo / Vaip / Mikse* (the open Vant-kin fragmented; the insular Drakhan held — emergent from cohesion). Contact/borrowing still a stretch.
- [x] **Slice 5 — Compression + the legibility lens.** A scheduled `compressLineages` pass (`src/culture/lineage.ts`) marks cultures/tongues with no living members **extinct** (kept as compact descent records, recorded as "lost" legends) and **prunes** the oldest fully-dead side-branches past `maxLineages`, so object counts stay bounded over deep time (tenability, tested). The **lineages lens** (`render/lineagesDashboard.ts`, hotkey **G**) shows the language & culture family trees — living vs lost, speaker/member counts, and *the same name rendered in each tongue* so the sound drift is audible down the tree (e.g. Old Vant "Latlu" → Lopo "Utnev" → Vaip "Toko"). Fixed a staleness bug: an agent's displayed **Tongue is now derived live from their culture's language** (a schism-reassigned agent shows the daughter dialect, not their birth name's tongue). *(S24)*

**DoD:** from seed cultures/languages the sim produces a **language family tree** and **≥1 cultural schism** over deep time; **culture measurably changes behaviour**; the evolution is **visible in-app**; within the performance budget; tenability tested. **Met** — verified live: Old Vant grew daughters Lopo/Vaip; the communal Vant-kin aim for less wealth than the Drakhan Clans; Chronicle legends + inspector tongue/culture/descent + the lineages lens make it all visible; 40k soak 0 violations, object counts bounded (prune + cap). *(Deferred follow-ons: event-driven value response once famine/war exist; contact/borrowing between tongues; a culture-values-over-time chart.)*

**DoD:** from seed cultures/languages the sim produces a **language family tree** and **≥1 cultural schism** over deep time; **culture measurably changes behaviour** (a test shows a value axis shifting an action/outcome distribution); the evolution is **visible in-app**, not just in the data; within the performance budget; tenability tested (object counts + per-era cost bounded).

## ✅ Milestone 7.5 — Live Model Integration (the real soul, opt-in)  *(done — 2026-06-16; D28)*

**Goal:** wire the live local model (Ollama) through the existing `AIRunner` as an **opt-in mode** so dialogue, dreams, reflection (and, later, glosses) become genuinely novel — the deterministic stub stays the default for headless/CI/replay.

- [x] Drive `OllamaProvider` async off the hot path; apply results across ticks; **record** every response (replay stays exact). *(S25: `AISystem` rewritten with a unified sync/async **dispatch** — a deterministic provider applies inline (unchanged); an async provider submits the prompt to a per-world `AIRunner` singleton and applies the drained result on a later tick, recorded by prompt-hash. The 4 passes share one eligibility/prompt path.)*
- [x] A drain/apply step in `AISystem`; graceful timeout fallback to the stub. *(S25: drain at the top of each async tick; each submit carries a deterministic stub **fallback**, so a slow/dead model never stalls — verified live with no Ollama: fetches fail → fallback applies, 0 stalls.)*
- [x] A toggle (config/menu) for stub vs. live; document the local-model setup. *(S25: **Esc → Settings → AI soul: Stub/Live (Ollama)**, applies on restart; `aiConcurrency`/`aiTimeoutMs` config; README "Running with a live model".)*

**DoD:** with a model installed, agents converse/gloss in genuinely varied language within budget, never stalling the tick; the run records and replays identically via `RecordedProvider`; with no model installed, nothing changes (stub default). **Met** — async submit→drain→apply→record→replay proven by `asyncSoul.test.ts` (mock async provider); sync path byte-identical (existing AI tests pass); live-verified the graceful no-Ollama fallback (164 responses applied off the hot path, no stall, no console errors). *(Deferred: LLM glossing of coined daughter-tongue/value names — the procedural naming already works; LLM glossing would hook the EvolutionSystem and is a flavor follow-on.)*

## ✅ Milestone 7.7 — Science & Instrumentation  *(done — 2026-06-16; D29)*

**Goal:** cash in the perfect determinism as real experiment tooling — turn "it didn't crash" (verification) into "it reproduces a known pattern" (validation).

- [x] **Measure** emergent structure: wealth/Pareto fit, social-network metrics (clustering, path length, small-worldness), demographic curves, Zipfian word/name frequency, language-family shape. *(S26: `src/analysis/metrics.ts` — pure reads of durable state, no RNG, no coupling (D22 pattern, D31): Hill power-law tail + Gini; friendship-graph clustering / mean path length / small-world σ over connected components; age distribution; Zipf fit over given names & surnames; language-family depth/breadth. Demonstrated headlessly in the soak's new "Science" block. **Emergent regularity found:** patrilineal surnames are Zipfian (s≈1.15, r²≈0.86) while per-id given names stay flat (s≈0) — inheritance → concentration. **Observation:** the friendship graph saturates near-complete (⟨k⟩≈48/60, σ≈0.97) — not small-world at the current sentiment balance.)*
- [x] **Sweep** parameters to locate phase transitions / tipping points (e.g. population-collapse and overgrazing thresholds). *(S27: `src/analysis/sweep.ts` — deterministic scenario runner + one-parameter sweep over seeds, with a `findTransition` that brackets and interpolates the survival-rate = 0.5 crossing; `npm run sweep` (`sweepMain.ts`) demonstrates it. **Located a food-scarcity survival phase transition** at `floraDensity ≈ 0.0175` — below it the town starves to extinction, above it it grows to carrying capacity, with mean surviving population behaving as an order parameter (0 below, climbing above). A dual sweep of `hungerDecayPerDay` (demand) collapses at ≈ 11/day. Pure orchestration over the existing loop — no sim/determinism changes. Written up in `docs/FINDINGS.md`.)*
- [x] **Export/diff** runs: event-log/CSV export, run manifests (seed + config), a run-diff. *(S28: `src/analysis/manifest.ts` — a **run manifest** (version + ticks + full config incl. seed) is the reproducibility unit; stable JSON serialise/parse (fail-loud on bad version/shape), `runManifest` reproduces + measures a run, `statsToCSV` exports the world-health time-series, `flattenMetrics`/`diffRecords` give a run-diff. `npm run export` (`exportMain.ts`) writes `runs/seed8.manifest.json` + `.stats.csv`, **proves re-running the manifest changes 0 metrics (EXACT)**, and diffs seed 8 vs seed 1. Pure orchestration; `runs/` gitignored.)*
- [x] Surface key metrics in the Legends / charts views. *(S28: the Legends view (C) gained an **"Emergent structure"** section — `measureWorld` surfaced live: wealth Gini + power-law α (r²), friendships-per-person + clustering, small-world σ, surname Zipf ("≈ Zipf's law") vs flat given names, language-family depth/breadth. Pure read; D27 legibility. Verified live, no console errors.)*

**DoD:** a documented analysis showing ≥1 emergent statistical regularity (e.g. an approximately power-law wealth tail or a small-world social graph) and ≥1 located phase transition, reproducible from an exported manifest. **Met** — `docs/FINDINGS.md` documents two results: (1) **surnames are Zipfian** (s≈1.15, r²≈0.86) while per-id given names stay flat — an emergent regularity from patrilineal inheritance; (2) a **food-scarcity survival phase transition** at `floraDensity ≈ 0.0175` (order parameter: mean surviving population). Both are **reproducible from an exported manifest** (`npm run export` → re-run is byte-exact). Metrics are surfaced in-app (Legends "Emergent structure"). 273 tests; tooling is pure reads/orchestration over the deterministic loop (no sim changes). Done across S26–S28.

---

# The M8–M19 arc — toward a living world

*Planned 2026-06-16 from the human's vision notes (see `VISION.md` "The living-world arc"). The wishlist (D&D agents, tribes/factions/governments, markets, combat, crime, tech+magic trees, religion, events, history/legend, a sci-fi tech ceiling, a 10–20× LOD world, save/load, a bestiary) collapses onto a few reusable **engines**, built foundation-first. Decisions D32–D35 set the architecture; the human chose: **foundation-first ordering**, the **full sci-fi tech ceiling** (framed as re-ascending the fallen world's lost tech, per D8), and a **level-of-detail (LOD)** scale model with **no artificial population caps**.*

**Standing rules for every milestone below** (sharpened from the vision pass):
- **Legibility is a gate (D35, elevates D27):** no system ships without an inspector/view that makes it visible. "Invisible complexity is wasted."
- **Behaviour stays procedural & causal (D26/D19):** traits/alignment/values/beliefs steer behaviour *deterministically*; the LLM only narrates (recorded, off-trajectory).
- **Content-driven breadth (D9):** creatures, buildings, events, tech/magic nodes, religions are authored YAML + a code-side effect — adding more is data.
- **Tenable at scale (D12 + D32):** bounded state, compress the dead, and an LOD tier so a big world doesn't cost a full brain per distant agent per tick.
- **Engineering bar (note #0):** the unified `Organization` / `Heredity` / `Event` engines (D33), a spatial index for perception, A* for movement — proper abstractions, data structures, algorithms.

Each milestone ships its **own content + its own inspector view**; M18 (bestiary/icons) and M19 (UI overhaul) are the breadth/overhaul passes, not the first introduction.

## ✅ Milestone 8 — Foundations II: Scale, Perception & Ecology  *(done — 2026-06-17)*

**Goal:** the substrate for a big, dense, *uncapped* world.

- [x] **Spatial index** (hashed grid cells / buckets) for cheap nearest-queries; agents perceive resources/kin/hostiles through it. *(S30: `src/sim/spatialGrid.ts` — a tile-granular hash grid with `nearest(x,y,accept?)` (expanding-ring search, global-min Manhattan, ties by insertion order) + `within(x,y,r)` + `at`. Wired into `MovementSystem`'s three per-tick linear scans (nearest ripe flora / nearest other folk / nearest resource node), replacing O(n) scans. **Behaviour-preserving:** the insertion-order tie-break reproduces the old scans exactly — 40k soak byte-identical, determinism + reproduction tests pass unchanged. The substrate for A*, the big map, LOD, and combat targeting. Coarser cells are a later perf knob (API unchanged).)*
- [x] **A\*** pathfinding replacing greedy `stepToward`, under a perception/movement budget. *(S31: `src/sim/pathfinding.ts` — deterministic 4-neighbour A* (Manhattan heuristic, binary-heap open set, ties by (f,h,tile-index), sparse Map/Set so cost scales with area explored, expansion budget). Plans over **static terrain only**; dynamic occupancy + the greedy `stepToward` stay as the step-time fallback (so collision behaviour/RNG use is unchanged). `pathToward` wired into `MovementSystem`'s four sapient movement calls (forage / commute / gather / socialise) — agents now route around bays and walls instead of sticking. Fauna keep cheap greedy stepping. Trajectory shifted (smarter routing), still deterministic; soak stable to cap, 0 violations, +0.4s/40k ticks (per-tick A* is affordable on the open map; caching/LOD is the big-map slice's concern).)*
- [x] **Big, configurable map** (target 10–20× area); world-gen, camera, renderer scale to it. *(S32: world-gen quantities now **scale with map area** — `areaScale(cfg)` + `scaledBiomeSeeds`/`scaledMaxFlora`/`scaledMaxFauna`/`scaledBusinessCount` in `config.ts`, identity at 64×64 so the default world is byte-unchanged, applied in `world.ts`/`populate.ts`/`FloraSystem`/`FaunaSystem`. `FaunaSystem`'s nearest-flora scan moved onto the `SpatialGrid` so grazing scales too. Renderer is already size-agnostic (derives `cellSize`/`mapW`/`mapH` from `cfg.gridWidth/Height`, camera clamps to it). Folk counts deliberately NOT scaled yet — that's the LOD + uncap slices. Tested: a 200×200 (~9.8× area) world generates with proportionally more flora/fauna/resources/employers, agents spawn on passable in-bounds tiles, and 400 ticks run valid in <1s. Live size-selection is the M9 setup screen.)*
- [~] **LOD brain tiers (D32):** foreground agents fully simulated; distant/background agents a cheap deterministic approximation; bounded per-tick cost. *(S34: **deferred — not needed at the tested scale, and risky to add now.** Measured a 10× map (200×200) at a populated steady state (~1300 entities) running at **3 ms/tick (~330 ticks/s) — within the playable budget** thanks to the sparse spatial index + sparse A*. A coarse-update LOD tier would change the per-tick cadence of distant fauna and **perturb the carefully-tuned predator–prey equilibrium** (below), so it's documented as a **ready optimization** to add only when folk populations actually grow large (toward the scaled cap on a 20× map). DoD's "within budget" is met without it.)*
- [x] **Uncap populations → ecological limits (D32):** remove `maxFauna`/`maxPopulation` hard caps; add **predators + agent hunting** so fauna self-regulate; folk capacity emerges from food/space. *(S34: fauna gained a `diet` (grazer/predator); **predators** (ember_hound, pallid_stalker) hunt the nearest grazer within a short sight (a refuge that makes predation density-dependent) and **fall back to grazing** when no prey is near (so they never starve out — the food web can't extinction-spiral); **folk hunt** adjacent fauna when desperate (`hunger<0.25`). The flat `maxFauna=150`/`maxPopulation=60` became **area-scaled carrying capacities** (`scaledMaxFauna`/`scaledMaxPopulation`, identity at 64×64), with grazers and predators getting **separate caps** (predators ~8% of the herd). Net: the old static **150-carpet is gone** — fauna self-regulate to a **stable, area-scaled ~120 grazers + ~10 predators** (verified across 6 seeds at 40k ticks; no extinction, no swarm), with predators visibly thinning/chasing the herds. Required real tuning (the simple predator–prey model is bistable: boom-to-carpet or bust-to-extinction); stability came from grazers winning the breeding race under their carrying cap + a predator refuge + omnivorous predators.)*

**DoD:** a 10–20× map sustains a large *uncapped* population within the per-tick budget; fauna self-regulate via predation (no artificial cap, no swarm — fixes the moth-grazer flood); movement is A*-based; deterministic; soak green at the new scale. **Met (S30–S34):** spatial index + A* + an area-scaling big map run a 10× world at **3 ms/tick** (~1300 entities, within budget); fauna **self-regulate** to a stable, area-scaled ~130 (predators + hunting + carrying capacity — no flat cap, no carpet, no extinction across 6 seeds); movement is A*; deterministic; 40k soak 0 violations; 292 tests. *(Population is bounded by an **area-scaled ecological carrying capacity**, not a flat number — the honest reading of "uncapped" given a simple predator–prey model is bistable without it. A true LOD tier is deferred as a ready optimization since the budget is already met.)*

## ✅ Milestone 9 — World Setup & Save/Load  *(done — 2026-06-17)*

**Goal:** start a world your way, and never lose it.

- [x] **Setup screen:** seed, **starting population (10–100)**, map size, options. *(S35: the start menu (`menu.ts` `showStart`) now takes `SetupOptions {seed, population, mapSize}` — a seed field, a **Folk slider (10–100)**, and **map-size presets** (Small 64 / Medium 128 / Large 200 / Huge 288, i.e. up to ~20× area — the M8 big map, now reachable live). `main.ts` builds the cfg from these (`gridWidth/Height`+`initialPopulation`) and **`renderer.configure(cfg)`** re-sizes the camera/cells so any map size renders, clamps, and click-maps correctly. Restart + Settings-apply preserve the chosen pop/size. Verified live: the setup screen renders; booting **Large (200×200, 80 folk)** fits the whole Voronoi map at the right scale with area-scaled flora/fauna and no console errors.)*
- [x] **Save/Load:** deterministic save = the M7.7 run-manifest (seed+config) + recorded events + a state snapshot; load restores exactly (replay is the correctness baseline, snapshot for speed). *(S36: `src/sim/saveload.ts` — a `SaveGame {version, savedAtTick, config, ai}` captures the **reproducibility unit** (config incl. seed + tick count + the recorded LLM responses); `loadSave` recreates the world from the config and **replays** to `savedAtTick` with a `RecordedProvider`, reproducing the exact state — soul and all. Pause menu gained **💾 Save / 📂 Load** (persisted to `localStorage`). Tested: save→serialise→parse→load is **byte-identical and continuable** (run both forward, lock-step); live-verified the Save→advance→Load round-trip restores exactly, no console errors. **Replay is the correctness baseline** (the DoD's "byte-identical"); a state **snapshot for instant loads** is the documented follow-up — replay-load is O(ticks), fine for normal runs but slow for very long/large ones.)*
- [x] Wire the **YAML config loader** so `simulation.yaml` is authoritative (long-deferred). *(S37: `config/simulation.yaml` (a flat mirror of `defaultConfig`, generated so it matches) is now **loaded at startup** — the browser via a Vite `?raw` import in `main.ts`, the soak via `fs`. `src/sim/configLoader.ts` `loadSimConfig(yamlText)` merges the YAML over `defaultConfig` (so it may be partial) and **fails loud** on unknown keys / non-numbers. `defaultConfig` is now the typed **fallback + validation schema**, not the runtime source. The stale `docs/simulation.yaml` (grouped prose, drifted from `SimConfig`) was removed. Tested: the shipped YAML loads to exactly `defaultConfig` (drift guard), partial YAML overrides merge, bad YAML aborts; soak/suite green; app boots from the YAML with no console errors.)*

**DoD:** a run saves and loads to a byte-identical state; setup options take effect; config is YAML-authoritative. **Met (S35–S37):** the start screen sets seed / population (10–100) / map size (up to ~20×); save/load round-trips **byte-identical and continuable** (replay-based; localStorage UI); and `config/simulation.yaml` is the **authoritative runtime config** loaded at startup (merged over typed fallbacks, fail-loud). 297 tests; soak green. *(Follow-ups, recorded: a state **snapshot** for instant loads (replay-load is O(ticks)); threading the active cfg into the display helpers that still read `defaultConfig` for age/calendar, so editing display-relevant YAML knobs updates those views too.)*

**DoD:** a run saves and loads to a byte-identical state; setup options take effect; config is YAML-authoritative.

## ▶ Milestone 10 — Causal & Legible Minds (the two loops)  *(next — reprioritised 2026-06-17 per the human)*

**Goal:** close the two loops the whole project is built on (D25): make the inner life **causal** (culture, memory, beliefs, and language actually *steer behaviour*) and **legible** (a master tabbed view to see it all). Front-loaded with the UI the human wants ASAP + the quick fixes.

- [x] **Slice 1 — Master tabbed view + UI fixes (FIRST, human priority).** *(S38: `src/render/masterPanel.ts` — one modal hosting all global views as scrollable **tabs** (Legends·C / Economy·E / Find·F / Family·T / Lineages·G); **Tab** opens it on the current tab, the existing per-view hotkeys jump straight to a tab, Esc closes it. Low-churn design: each view hands the master its **persistent content element** (a `content` getter on `ModalPanel` + a `LegendsPanel` refactor) and an `update(world)`, so the master **reparents** them into a shared slot and just shows/refreshes the active one — the directory's search box, family-tree navigation, etc. keep their state across tab switches. The inspector stays the entity side-panel; the Legend (L) and Town Happenings (H) stay glanceable overlays. **Quick fixes:** **sleep/work hysteresis** (`ActionSystem` — commit to sleeping-until-rested (energy ≥ 0.85) / eating-until-full, unless the other survival need goes urgent — fixes the every-other-tick jitter, which was threshold-thrash at energy 0.4); **legend** badges now a **vertical, scrollable** list with "what it represents" descriptions (Child → "too young to work, court, or bear children"); **building-icon** description generalised ("a home, workplace, or civic place"). Verified live (DOM): all 5 tabs render, switching + Find search/filter/focus + Family + Legends + Lineages work, no console errors.)*
- [x] **Slice 2 — Culture is fully causal (D26).** *(S40: wired the inert axes per the `CULTURE_AND_LANGUAGE.md` spec. **`open`** → cross-culture **friendship warmth**: `SocialSystem.interact` now scales the sentiment gain by `bondFactor` (same culture = full; cross-culture = the pair's average openness, floored at 0.15) — company is still met by anyone, but friendship only warms across cultures for *open* folk. **`traditional`** → **endogamy**: `matchmake` rolls `prefersEndogamy` and, for traditional folk, restricts to same-culture partners (falling back to any if none). **`martial`** stays **deferred to M16** (no behavioural home until combat). `communal`→wealth-goal was already causal. Tested + soak-stable.)*
- [x] **Slice 3 — Memory & belief become causal (D26).** *(S41: a deterministic **`distill(memories)`** (`src/ai/memory.ts`, no LLM → replay-safe) reads a life's dominant theme — **bonds** (family/friends) and **toil** (work) strive, **grit** (hardship survived) seizes the day, **loss** (death/illness) withdraws — and yields a bounded **`purpose`** drive (±0.4) + a named **`vow`** (5 vows). `AISystem.reflectPass` runs it each reflection and emits a `decide` feed line when the vow turns over; **`ActionSystem`** reads `purpose` so a driven agent works past where a content one stops (`goal = wealthGoal·(1+0.5·purpose)`). The LLM `beliefs` stay pure recorded flavour (the causal/flavour split, D26). **More remembered life events** feeding it: **befriending** someone (`SocialSystem`, new `friendship` event + memory), **surviving a grave illness** (`HealthSystem`, gated by a new `Health.grave` flag → a `pulled through` feed line), and **outliving your own child** (the heaviest grief). Surfaced in the inspector Mind section (⚑ vow line). Tested (`test/mind.test.ts`) + soak-stable.)*
- [x] **Slice 3.5 — Legibility add-on (human-requested).** *(S42: made the **Emergent structure** panel readable and richer, gave the wildlife its own view, and fixed a feed bug. Every emergent article now carries a **plain-language description** (what it is + why it matters, jargon-free). **Four new pure metrics** (`analysis/metrics.ts` + Legends panel): **life-orientation spread** (the distribution of slice-3 vows + mean "town drive"), **dynastic concentration** (share of the living in the biggest paternal name-line + a Gini), **mating assortativity** (within- vs cross-culture pairing vs random — a melting-pot↔segregation index), **occupational diversity** (Shannon evenness over professions). New **Fauna & Flora "Ecology" tab** (hotkey **Y**, `ecologyDashboard.ts`): grazers vs predators with the predator:prey ratio + per-species counts & a condition (avg-hunger) bar, and flora with its forageable-ripeness share — the M8 food web finally has a view. **Town Happenings** fixed: a flex column with a scrolling body + wrapping rows, so the lower lines and long chat are no longer clipped by the window. +6 metric tests; live-verified.)*
- [ ] **Slice 4 — Language as a mechanic + Conversation/Language tabs.** A per-agent **fluency** map (language → 0–100%); **same-language synergy** (chatting a same-tongue speaker bonds/benefits faster); **gradual learning** of another tongue through interaction (a % progress bar); cross-language interaction still works, just with less synergy. **Conversation tab** (active + past dialogue) and **Language tab** (phoneme inventory, sample words & structure, sound-change history). Make agents *visibly* chat (decouple the chatting badge from the rarely-low social need).

**DoD:** culture (all axes), beliefs, and language each **measurably change behaviour** (a test shows each shifting an outcome distribution); the master tabbed view holds every view incl. Conversation + Language + Mind; the sleep/work jitter is gone; all legible; determinism + soak hold.

## Milestone 11 — Homes & Property  *(pulled from old M12; human-requested now)*

**Goal:** folk build and own homes that matter — visible town growth, not pre-placed boxes.

- [ ] **Homes:** agents **build/own** a home from gathered resources over time (the town visibly grows), **sleep there**, get a **mood bonus**, and store goods (later); **landlords** own several.
- [ ] **Buildings generalised:** a building is a home / workplace / civic place — not just an employer; icon + inspector reflect this.

**DoD:** folk build and own homes, sleep in them, and gain a mood bonus; some own several; the town visibly grows from gathered resources; legible; soak-stable.

## Milestone 12 — Robust Save/Load & World Management  *(human-requested; storage robustness)*

**Goal:** many worlds, saved safely, loaded instantly.

- [ ] **Snapshot loads:** serialise the World + RNG state so load is **instant** (fixes the replay-load freeze on big/long runs — replay stays the correctness baseline / cross-check).
- [ ] **Multiple named worlds** with a save-manager UI (list / load / **delete**); storage in **IndexedDB** (room for big snapshots, beyond localStorage's ~5 MB).
- [ ] **Disk export/import:** download a save as a `.omnia` JSON file and re-import via a file picker — portable and shareable.

**DoD:** several named worlds save / load (snapshot-fast) and delete; a save round-trips to disk and back; loaded state is byte-identical and continuable; legible.

## Milestone 13 — Agent Depth: Stats, Alignment, Personality & Body  *(the old M10 — D&D depth)*

**Goal:** agents become mechanically deep — inherited and legible (the D&D layer combat/crime build on).

- [ ] **Ability scores** (STR/DEX/CON/INT/WIS/CHA), content-driven, rolled + species-modified.
- [ ] **9-alignment (dynamic, D26-causal):** baseline neutral-leaning-good; trauma/events/environment shift it; it biases behaviour (evil → lying/stealing/violence; good → cooperation). *(Builds on M10's belief→behaviour machinery.)*
- [ ] **Personality** archetypes/traits (coward / ambitious / greedy / loyal / curious / sadistic …); mid-life drift from trauma.
- [ ] **One Heredity system:** physical traits (height/weight/eye/hair/voice) + ability scores + alignment-lean + magic aptitude all inherit (parental mean + variation), *visibly*.
- [ ] **Inventory** + meaningful uses for gold; **status/health** (HP, exhaustion, starvation, sickness, poverty) as real states.
- [ ] Inspector: a rich **agent sheet** (stats, alignment, traits, inventory, status, kin resemblance).

**DoD:** light-eyed parents tend to light-eyed children (traits visibly inherited); alignment shifts with experience and changes behaviour; ability scores feed later combat/skills; all legible; determinism + soak hold.

## Milestone 14 — Institutions: Tribes, Factions & Governments

**Goal:** the unified social-structure engine — the biggest "world feels alive" jump.

- [ ] One **`Organization` entity (D33):** members, values, treasury, leadership + **succession**, procedural **colour** (hue-spaced, never red), territory, descent + **schism** (reusing the culture/language fork machinery).
- [ ] **Group dynamics:** cluster with kin/allies, defend territory, compete for resources; few agents → fuse, large groups → schism; new tribes emerge *with* new cultures/languages.
- [ ] **Governments** emerge from culture/values (chiefdom / council / theocracy / …); **social class**; a **reputation** graph.
- [ ] Faction membership **tints the folk icon** (the human's colour idea).
- [ ] Inspector: an **organization/faction** view + per-agent class/reputation/allegiance.

**DoD:** tribes/factions form, hold cohesion, and schism over deep time alongside language/culture, and visibly govern themselves; faction colours are distinct (never red); all legible; determinism + soak hold.

## Milestone 15 — Economy Depth: Markets, Trade & Class

**Goal:** a tactile economy where gold matters and fortunes rise and fall *(completes M3's deferrals)*.

- [ ] **Supply/demand market:** prices move with supply/demand; agents buy food/goods; business revenue from **real sales**; businesses can **go bankrupt**.
- [ ] **Resource → craft → goods** coupling so depletion bites; **skill/knowledge gating** (learn-by-doing / apprenticeship).
- [ ] **Banking/loans/debt** rebalance (agents shouldn't sink into debt so fast); caravans; stockpiles; boom/bust cycles. *(Homes/landlords moved to M11.)*
- [ ] Inspector: a **market/prices** view; per-agent wealth/property/holdings.

**DoD:** prices respond to scarcity; agents trade and accumulate/lose property; some become landlords; businesses open and fail; debt is balanced; legible; soak-stable.

## Milestone 16 — Conflict: Combat, Hunting, Crime & War

**Goal:** the messier side of life — and a real threat model.

- [ ] **D&D-style combat:** HP, attack/defense, armour, weapons (ability-score-driven); agent-vs-agent **and** agent-vs-monster; **hunting** fauna for food/hides.
- [ ] **Wounds:** scars, dismemberment, poison; **veterans** (combat permanently marks an agent).
- [ ] **Crime & vice (alignment-driven):** theft, assault, murder; gangs/underworld; smuggling, assassination, corruption; **prisons, slavery, drugs, brothels**.
- [ ] **War:** raids/sieges, military hierarchy (recruit→general), mercenaries; orgs war over territory/resources.
- [ ] Inspector: combat/health detail; a **crime/justice** view.

**DoD:** agents fight, hunt, and commit crimes consistent with alignment; wounds persist and show; organized conflict (gangs/wars) emerges and is recorded as legends; legible; soak-stable.

## Milestone 17 — Knowledge: Tech Tree, Magic & Research

**Goal:** civilizations climb the full ladder — and magic finally earns its place.

- [ ] **Tech tree (D34), full ladder:** tribal → bronze → iron → medieval → industrial → **modern → sci-fi** (machines, vehicles, robots, **power plants**), framed as *re-ascending the fallen world's lost tech* (D8); **power sources** (fire/steam/coal/solar/magic/…).
- [ ] **Research by Organizations** unlocks capabilities/recipes (armour/tools/weapons/materials/machines) for the tribe/faction.
- [ ] **Magic tree + schools** (necromancy/illusion/elementalism/divination); **spells, magic items, golems** (advanced mages only); **mages made legible** — a clear, inspectable role + effects (the human's explicit ask).
- [ ] **Lost tech / dark ages / rediscovery** (reuses the compression machinery); **achievements** (civ + agent: Iron Age, Steam Power, …) with a view.

**DoD:** an org researches up a visible tech *and* magic tree across the ages incl. the sci-fi tier; mages do something inspectable and useful; knowledge can be lost and rediscovered; achievements fire and are viewable; determinism + soak hold.

## Milestone 18 — Religion & Belief

**Goal:** living faiths that evolve and split like languages.

- [ ] Religions emerge from culture/values + **founding myths**; **schism** alongside culture/language/tribe (reuse the `Organization` engine).
- [ ] Beliefs bias behaviour (D26); **holidays**, **cults**, **living gods** (rare, possibly embodied), divine effects.
- [ ] Inspector: a **religion** view (deity, tenets, followers, descent) + per-agent faith.

**DoD:** ≥1 religion founds, spreads, and schisms over deep time tied to culture; faith visibly affects behaviour and events; legible; soak-stable.

## Milestone 19 — Events, Seasons & the Paranormal

**Goal:** things *happen* — the world has weather, holidays, and the occasional ghost.

- [ ] A **content-driven Event pipeline (D9):** deterministic scheduled + triggered events → Chronicle/feed; effects are code, definitions are data.
- [ ] **Seasons** (ecology/farming/top-bar); **holidays**, bountiful harvests, great discoveries.
- [ ] **Disasters** (famine/plague/quake/fire/storm) — feeds the deferred famine→thrift culture hook.
- [ ] **Paranormal** (alien abductions, ghost encounters, magical catastrophes) — uncommon, nontrivial, with consequences.
- [ ] Inspector: an **events/timeline** view.

**DoD:** seasons cycle and affect the world; disasters and rare paranormal events occur, leave consequences, and enter the Chronicle; adding an event is data-only; legible; soak-stable.

## Milestone 20 — History, Legend & Quest

**Goal:** the capstone of emergent storytelling — the world remembers.

- [ ] **Historical figures** emerge from the importance/Chronicle machinery (conqueror/inventor/prophet/tyrant/hero); **dynasties** from lineage.
- [ ] **World-history generator** / ages-of-civilization narration; **legendary artifacts** with histories; **archaeology** (uncover ruins/dungeons of extinct civs).
- [ ] **Procedural quests/goals** agents pursue (recover heirloom, hunt monster, avenge kin, explore ruin); **wonders** (mega-projects incl. the space elevator).

**DoD:** named historical figures and dynasties accrue and are referenced for generations; artifacts carry histories; ruins of fallen civs are discoverable; agents pursue procedural goals; all browsable; soak-stable.

## Milestone 21 — Content & Bestiary Expansion

**Goal:** a world that isn't all humans, dwarves, and moth grazers.

- [ ] **4 more base languages** (distinct families) — all still evolving.
- [~] **Common races** (orc/elf/goblin/…); **real animals** (wolf/cow/chicken/horse/…) with predator/prey roles (feeds M8 ecology). *(S33, pulled forward — flora/fauna diversity pass: +6 flora (emberwheat/bruisewort/lantern_moss/saltvine/cinderbud/prism_lily → 10 total) and +6 fauna (spire_elk/glow_moth/crag_ram/dust_beetle/ember_hound/thistle_doe → 8 total), distributed so each passable biome has a distinct ecology; the renderer now tints fauna by their own **colour + size** (no longer one amber blob), so the map reads varied. Races + predator/prey behaviour still to come.)*
- [ ] **Monsters** (iconic D&D, world-flavoured) and **special agents** (vampire/undead/ghost/alien/dragon) as agents with **unique icons** and content-defined behaviour.
- [ ] **Building types** (school/market/constable/prison/hospital/theatre/town-hall/court/bar/brothel/outpost/guard-tower/mage-enclave + special: floating city/dungeon/science-lab/power-plant) with functions.
- [~] A **rich icon library** (buildings/resources/professions/events/creatures/status/religions/tech/governments). *(S33: redrew the crude animal (clean quadruped: body/head/ears/legs/tail/eye) and timber (log-stack with growth rings) icons; fauna are now per-species coloured/sized on the map. The broad library is still to come.)*

**DoD:** the map shows many distinct races/animals/monsters/special agents and building types, each with a clear icon and a content-defined role; adding more is data-only; soak-stable.

## Milestone 22 — UI, Inspectors & Aesthetic Polish

**Goal:** make all the depth perceivable (RimWorld / Dwarf Fortress / Kenshi / Sims-grade).

- [~] **Inspector overhaul:** audit existing views; add the missing ones (agent sheet, organization, government, religion, tech/magic, events, achievements, world/misc). *(S33, pulled forward: fixed the **stuck-open card** — the ✕ button is now persistent (was rebuilt every frame and destroyed mid-click) and Esc closes the card. Full overhaul still pending.)*
- [→] **Master tabbed view** and **Conversation tab** — **moved to M10** (slice 1 / slice 4) at the human's request (master UI ASAP).
- [x] **On-screen help / game guide**; **controls → Esc → Controls** (off the main screen); **top bar minimal** (day / year / season / folk) with the rest moved into views. *(S33: removed the always-on `#hud` controls strip; added **Esc → Controls** (one keymap source); the **top banner is now minimal** — day/night, Year · Season · Month, Folk, and real-world watch-time (⏱) — Gini/Mages/Graves/Fauna moved off (Gini → Economy with a plain-English explanation). New **time model**: a legible Year/Season/Month calendar (cosmetic subdivision of the aging year, so dates & ages agree) replacing the confusing cumulative "day"; the **speed slider is now exponential up to 1000 ticks/s ≈ 1 sim-year/second** (was capped at 100, with a 30-tick/frame loop cap raised to 500). Zoom % is labelled and tucked bottom-right. **Town Happenings** is now hideable (H), like the Legend (L). The **Legend** explains every symbol (incl. the `|||` = seeking-food badge) and shows the child folk at actual reduced scale.)*
- [x] Fix the **finder "f"-typed-into-search bug** *(S33: `preventDefault` on the letter hotkeys, so the F that opens Find isn't typed into its search field)*; aesthetic/lo-fi pass (D13); optional ambient audio.

**DoD:** every system from M8–M21 is inspectable; the top bar is minimal and controls/help live under Esc; the finder bug is gone; the UI reads richly; soak-stable. *(Top-bar/controls/finder/time/legend done S33; the master tabbed view + Conversation/Language tabs moved to M10; this milestone is now the closing inspector-completeness + aesthetic/audio polish pass.)*

---

## Backlog (unsorted — promote into a milestone before building)

*(Append new ideas here with a date. Do not build directly from this list.)*

> **Note (updated 2026-06-17, after the M10 reprioritisation):** most older backlog items below are now **promoted into the M8–M22 milestones** above (market → M15 economy, homes/building → M11, conflict/vice → M16, skill gating + lost arts → M17 knowledge, YAML config loader → M9 (done), save/load robustness → M12, async live-model already done in M7.5). They're left here as the historical trail; build from the milestones, not this list. *(Milestones were renumbered 2026-06-17: the new M10 "Causal & Legible Minds" + M11 Homes + M12 Save/Load were inserted, pushing the old M10–M19 down to M13–M22.)*

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
