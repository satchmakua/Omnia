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

## ▶ Milestone 2 — World & Environment  *(current)*

**Goal:** the world agents live in, and the entity/brain tiers.

- [x] Biomes, terrain, the tile grid (from content). *(Session 4: 5 biomes as YAML; seeded Voronoi tile-grid generation; passability wired into movement + spawning; biome backgrounds + terrain in the inspector.)*
- [ ] **Flora** (grow/spread/harvest), **fauna** (instinct-only light agents), **resources** (renewable + finite).
- [ ] Formalize the **brain tiers**: sapient (full), fauna (instinct, no LLM), flora/resources (no brain).
- [x] Seeded **world generation** (terrain layer). *(Session 4: deterministic biome map. Flora/fauna/resource placement + the backstory Chronicle still pending.)*
- [ ] Invent the post-apocalyptic backstory as the first Chronicle entries.

**DoD:** a generated world with biomes, growing flora, roaming fauna, and harvestable resources runs stably for many sim-years; tested (e.g. an overhunted species can crash — and that's detectable in metrics). *(Terrain substrate done; flora/fauna/resources/brain-tiers/Chronicle remain.)*

## Milestone 3 — Economy, Work & Capabilities

**Goal:** agents make a living; the unified magic/technology system lands.

- [ ] Jobs, employers, wages; `EconomySystem`; spend on food/shelter; debt when broke; businesses as org entities; a minimal supply/demand market.
- [ ] The unified **Capability system**: invoke → prerequisites → cost → effect (`MAGIC_AND_TECHNOLOGY.md`).
- [ ] **Technology** tradition (common, knowledge-gated) + crafting/tech professions tied to resources.
- [ ] **Magic** tradition (rare, aptitude-gated): innate aptitude rolled per species/lineage; mana cost; a few magical professions.
- [ ] Wealth-distribution metric.

**DoD:** agents earn/spend and can prosper or go broke; capabilities of both traditions work through one engine; magic is visibly rare (most agents lack aptitude); economy stable over many sim-years; tested.

## Milestone 4 — Relationships & Life Cycle

**Goal:** people connect, reproduce, age, and die across generations.

- [ ] `Relationships` graph (sentiment + type); `SocialSystem`; social need.
- [ ] Courtship → marriage; reproduction, children, `Lineage`; aging.
- [ ] Illness, injury, death; **tombstone** records on death (`SIMULATION_MODEL.md`).

**DoD:** the town sustains itself across several generations (no collapse/explosion); family trees form; deaths free agents into tombstones; tested.

## Milestone 5 — The Soul (LLM layer)

**Goal:** an inner life via the local model, off the hot path.

- [ ] `AIProvider` + Ollama; concurrency cap; timeout fallback.
- [ ] Memory **stream + retrieval** (recency × importance × relevance); **reflection** into beliefs on a schedule.
- [ ] LLM-driven **dialogue** at meaningful moments; major-decision prompting; dreams.
- [ ] **Record LLM responses into the event log** for deterministic replay.

**DoD:** agents converse and reflect believably within budget (rare, throttled); the sim never stalls on a model call; seed-replay reproduces given recorded responses.

## Milestone 6 — History & Legends

**Goal:** the compression pipeline — rich history, bounded cost.

- [ ] Importance scoring; scheduled **rollups & pruning** of agent memory (multi-resolution).
- [ ] The **Chronicle** (notable events only, itself tiered); **statistical strata** feeding world-health charts.
- [ ] A **Legends view** UI to browse the town's history.

**DoD:** after many generations, total state stays bounded *and* Legends reads like a story, not a spreadsheet (the qualitative test in `SIMULATION_MODEL.md`).

## Milestone 7 — Culture & Language (deep)

**Goal:** evolving cultures, languages, and names (`CULTURE_AND_LANGUAGE.md`).

- [ ] Language model (phonology, phonotactics, on-demand lexicon, light morphology) from seed YAML.
- [ ] Evolution on a generational schedule: sound change, drift, **divergence into families**, contact/borrowing.
- [ ] Culture model (value axes, practices) with drift, **schism**, and blend.
- [ ] Replace the M1 placeholder naming with **language-derived naming**; names drift over time.
- [ ] Dead languages/cultures compress to descent-trees; the Chronicle remembers schisms and lost tongues.

**DoD:** starting from seed cultures/languages, the sim produces a language family tree and at least one cultural schism over deep time, while staying within the performance budget; tested for tenability (object counts and per-era cost bounded).

## Milestone 8+ — Social Structures, Vice, UI Depth & Refinement

**Goal:** emergent groups, the messier side of life, and durability.

- [ ] Companies, gangs, families-as-institutions, factions, dynasties; reputation; succession.
- [ ] Gambling, drinking, crime, affairs/betrayal.
- [ ] **UI depth:** rich inspector, relationship/family-tree views, charts (population, wealth, mood), event feed, time controls, search.
- [ ] **Aesthetic/audio:** pastel/lo-fi styling pass; lo-fi ambient music layer.
- [ ] Save/load; scenario seeds; balance via the world-health dashboard; performance against budget.
- [ ] Optional: procedural regeneration of deep history (`SIMULATION_MODEL.md`, Mechanism 6).

**DoD:** open-ended; "refine" lives here once M0–M7 are done.

---

## Backlog (unsorted — promote into a milestone before building)

*(Append new ideas here with a date. Do not build directly from this list.)*

- More traditions for the capability system (alchemy, bio-engineering, ritual) — date: founding.
- Domestication of fauna; agriculture depth — date: founding.
