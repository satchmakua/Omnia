# PROGRESS.md — Session Log

Append a new entry at the **TOP** after every session (reverse-chronological, newest first). Be honest, including dead ends — a future session may be a fresh instance with no memory of this one. Keep entries short.

**Entry template:**

```
## Session N — <date> — <one-line summary>
- Did: <what changed>
- State: <where things stand; is the build green?>
- Next: <the next item to pick from ROADMAP>
- Blockers/Questions for human: <none, or the question>
- Decisions logged: <DECISIONS.md ids, or none>
```

---

## Session 7 — 2026-06-13 — Milestone 3 (part 1): the Economy
- Did: First half of M3 — a stable, stratified economy. New `professions` content type (Zod schema + 5: laborer/farmer/miner/artisan/merchant, varied wages). New components: `Job`, `Business` (employer org entity with balance/capacity/wage/revenue); `Wallet` gained `debt`; `Agent` gained a per-agent `wealthGoal`; new `work` action. New `EconomySystem`: hires unemployed agents into businesses with openings, pays wages (business balance → wallet) to anyone choosing to work, books business revenue, and charges a daily cost of living that becomes tracked debt when broke. Pure money helpers in `economy.ts` (earn pays debt first; spend never goes negative). Wealth-distribution metric in `wealth.ts` (min/median/mean/max net worth + Gini). ActionSystem: survival (hunger/energy) first, else work when employed & below wealth goal, else wander. MovementSystem: agents commute toward their employer (visual). World-gen places businesses + rolls wealth goals. Renderer draws business buildings + the work action + HUD wealth; inspector shows livelihood (job/gold/debt/goal) for folk and a business panel; clicking a business works.
- Tuning notes (two real bugs found & fixed via soak): (1) a high survival gate (0.7) starved earning time → ran the gate at `actionThreshold` (0.4); (2) gating pay on standing exactly on the employer tile let greedy pathfinding strand workers in **runaway unbounded debt** — changed to pay any employee who chooses to work (commute is now visual only), and lowered upkeep 4→3. Result: wealth bounded & stable (min~19/median~58/max~105, Gini~0.20, inDebt 0 in steady state) over 10k ticks.
- State: **Green.** 117 tests (was 102) across 14 files; `tsc` clean; coverage 98.5%; build succeeds; soak 10k ticks 0 violations (added M3 invariant: gold≥0, debt≥0). Verified live: 8 businesses, 20/20 employed, agent & business inspectors work, HUD shows median wealth/Gini, no console errors.
- Next: **M3 part 2** — the unified **Capability system** (invoke→prereq→cost→effect), **technology** tradition (knowledge-gated, crafting tied to resources) + **magic** tradition (rare, aptitude-gated; the `magicAptitudeChance` already in species data; mana). Generalises the M1 `forage` effect-tag proof.
- Blockers/Questions for human: none. Note: in the stable config nobody is *permanently* broke (good for "stable over many sim-years"); the debt mechanic + "go broke" path is exercised by unit tests rather than the default soak. The supply/demand **market** and bankruptcy were deferred to the backlog to keep this chunk bounded.
- Decisions logged: none new (economy follows D9 data-driven content; businesses-as-entities per roadmap). Pay-not-gated-on-arrival + wealth-goal-bounding recorded here for the next session.

## Session 6 — 2026-06-13 — UX: decouple playback speed + speed slider (human request)
- Did: The render loop was ticking the sim once per animation frame (~60 ticks/s), so agents teleported a cell 60×/s — too fast to click. Rewrote `main.ts` to advance the sim on a real-time accumulator at `cfg.simSpeedTicksPerSecond` (default 6), drawing every frame regardless (the "sim time decoupled from real time" principle in ARCHITECTURE). Added `src/render/controls.ts` (`SpeedControl`): a bottom speed slider (0–40 ticks/s) + ▶/⏸ button; Space toggles pause through it. No simulation/determinism changes — render layer only. README controls table + index.html hint updated; `simSpeedTicksPerSecond` added to SimConfig and aligned in simulation.yaml.
- State: **Green.** 102 tests pass; `tsc` clean. Verified live: tick rate is now exactly 6/s (was ~60), slider sets it (0 = paused, 20 = 20/s, confirmed by measuring the clock), control bar visible bottom-center.
- Next: **Milestone 3 — Economy, Work & Capabilities** (unchanged).
- Blockers/Questions for human: none.
- Decisions logged: none (playback speed is a renderer concern; follows ARCHITECTURE's sim/real-time decoupling). Idea for later: interpolate entity positions between ticks for smoother motion — added to ROADMAP backlog.

## Session 5 — 2026-06-12 — Milestone 2 COMPLETE: living world (flora, fauna, resources, brain tiers, Chronicle)
- Did: Finished M2. **Content:** added `flora` (4), `fauna` (2), `resources` (3) content types + Zod schemas; biome spawn tables (`flora`/`fauna`/`resources` weighted lists) with **load-time referential integrity** (a biome referencing an unknown id fails loud). **Systems (new ECS):** `FloraSystem` (grow toward maturity, spread to adjacent open passable tiles, bounded by maxFlora), `FaunaSystem` (instinct-only: graze ripe flora, breed when fed + off-cooldown, starve and die — bounded by maxFauna), `ResourceSystem` (renewables regrow, finite don't). Replaced the abstract "food" entity with real **flora**: agents forage ripe flora via the existing `forage` capability (boundary intact). **Brain tiers** formalized in `src/sim/tiers.ts` (sapient/fauna/none as mutually-exclusive component markers; LLM can only ever attach to sapient). **History:** `src/history/` Chronicle (append-only legend log, singleton component) + deterministic `generateBackstory` seeded from world composition; viewable in-app via a Chronicle panel (C key). **Render/UI:** renderer draws biomes→resources→flora→fauna→folk; polymorphic inspector now handles folk/fauna/flora/resource (click any of them); HUD shows Folk/Fauna/Flora counts. Extracted shared movement helpers (`movementUtil.ts`) used by both MovementSystem and FaunaSystem. Fixed a latent click-mapping bug (canvas CSS-scale factor) + made the page layout non-clipping. Added a dev-only `window.__omnia` debug handle (stripped from prod).
- State: **Green.** 102 tests (was 66) across 13 files; `tsc` clean; coverage 98.3% (now gating src/world + src/history); `npm run build` succeeds; soak 10k ticks ~1.0 s, **0 violations**, world stable (folk survive, fauna 10→150 to carrying capacity, flora to cap). Verified live in-browser: biomes/flora/fauna/resources render, click-to-inspect works for every entity type (confirmed deterministically), Chronicle shows the seeded backstory, no console errors.
- Next: **Milestone 3 — Economy, Work & Capabilities** (jobs/wages/EconomySystem; the unified Capability invoke engine; technology + magic traditions; wealth metric).
- Blockers/Questions for human: none. Note: the default world reaches a stable carrying capacity (flora/fauna pinned near caps) rather than oscillating — this satisfies the "runs stably" DoD; the "can crash" clause is demonstrated by a dedicated overgrazing test, not the default soak.
- Decisions logged: none new (flora/fauna/resources as data archetypes and brain tiers as component markers follow D9/D10). Recorded the tilemap-as-singleton and shared-movement-util choices here for the next session.

## Session 4 — 2026-06-09 — Milestone 2 (part 1): World substrate — biomes, terrain, tile grid
- Did: Took the foundational first slice of M2 (one coherent item per the guardrails). New `biomes` content type (Zod schema + 5 authored YAMLs: ashen_plains, fungal_forest, crystal_flats, irradiated_wastes, drowned_ruins/water). Dense `TileMap` singleton component (`src/world/tilemap.ts`, flat typed arrays, self-contained colour/passable/name look-ups so systems/renderer don't need the registry). Seeded **Voronoi world-gen** (`src/world/worldgen.ts`): scatter weighted biome seeds, each tile takes its nearest seed → contiguous regions, deterministic. `createSimulation` generates terrain first and places food + agents only on passable tiles. MovementSystem now respects passability (steps blocked by water; food-seekers route around it; wander stays on land) — reads the TileMap singleton from the world, so no signature churn. Renderer draws biome backgrounds + brighter inset food markers; inspector shows the agent's terrain. New M2 invariant (no agent on an impassable tile) added to the soak runner, the soak test, and the property test.
- State: **Green.** 80 tests pass (+14: world.test.ts has worldgen determinism, tile accessors, movement-around-walls, and a createSimulation integration check). `tsc` clean, coverage 97.7% (now gating src/world too), `npm run build` succeeds, soak 10k ticks in ~74 ms with 0 violations. Verified live in-browser: all 5 biome colours + food markers render, no console errors.
- Next: continue **Milestone 2** — **flora** (grow/spread/harvest), **fauna** (instinct-only light agents, no LLM), **resources** (renewable + finite), then formalize the **brain tiers**, then the post-apocalyptic **backstory Chronicle**. (These were intentionally deferred to keep this session to one coherent item.)
- Blockers/Questions for human: none. (Population still trends down — reproduction is M4.)
- Decisions logged: none new. (Voronoi terrain + dense-array tilemap are implementation choices, not architectural reversals; noted here so the next session knows terrain is a singleton component, not per-tile entities.)

## Session 3 — 2026-06-08 — Test hardening + Milestone 1 complete: Content Framework & Species
- Did (test infra, on human request): added coverage reporting (`@vitest/coverage-v8`, gated 90% stmts/lines/funcs + 85% branches, scoped to src/sim+content+capability) wired into CI via `npm run test:coverage`; added `fast-check` property tests (RNG bounds/replay over arbitrary seeds, agents in-bounds + needs in [0,1] for any seed, seed→identical trajectory, ECS destroyed-never-queried). Property testing surfaced a float-rounding edge in a test assertion (fixed the test). Expanded README with a "sanity-checking it yourself" section.
- Did (M1): YAML loader + **Zod** schemas (schema-as-type, `.strict()` so typos fail) → immutable typed `Registry`. Pure `loadContent(Map<path,text>)` core with two sources: `fsSource.ts` (Node/tests/soak) and `import.meta.glob` (browser/main.ts). Two species authored purely in YAML (`content/species/human.yaml`, `dwarf.yaml`) with distinct needs multipliers, colours, sizes, spawn weights, and name-sound pools. Agents now spawn from weighted archetypes with generated names + a baked `Species` component. Per-species name generator (`names.ts`). First capability `content/capabilities/forage.yaml` (effect tag `restore_hunger`) wired end to end: data declares the tag, `src/capability/effects.ts` implements it, loader fails loud if a tag has no implementation; MovementSystem eats by invoking it. Renderer shows species via ring colour + dot radius; inspector shows species. Removed now-dead `foodRestoreAmount` config.
- State: **Green.** 66 tests pass, `tsc` clean, coverage 97.5% stmts / 95% branch, `npm run build` succeeds (YAML bundled), soak 10k ticks in ~59 ms with 0 violations. Verified the browser path live (canvas draws both species' rings; content loaded via glob; no console errors).
- Next: **Milestone 2 — World & Environment** (biomes, terrain/tile grid, flora/fauna/resources, formal brain tiers, seeded world-gen + backstory Chronicle).
- Blockers/Questions for human: none. (Population still trends down — reproduction is M4, as designed.)
- Decisions logged: none. (M1 followed D9/D11 directly. Note for the record: chose Zod for validation and the `yaml` package for parsing — both are the conventional TS choices implied by ARCHITECTURE/CONTENT_AND_DATA; not treated as new decisions.)

## Session 2 — 2026-06-08 — Milestone 0 complete: Foundation & Heartbeat

- Did: Scaffolded the full TypeScript project (Vite + Vitest + tsx). Hand-rolled ECS (World/EntityId/addComponent/query). Seeded Mulberry32 RNG — Math.random() banned from sim code. Headless fixed-timestep tick loop with deterministic system ordering (Clock → Hunger → Action → Movement). Tiny world: 20 agents on a 64×64 grid, `Position`, `Needs`, `Wallet`; 25 food sources; `MovementSystem`, `HungerSystem`, day/night clock. Utility action selector (seek_food > sleep > wander). Agents die when hunger bottoms. Canvas renderer: colored dots (white=wander, orange=food, blue=sleep) + HUD. Click-to-open inspector panel. 33 tests: 7 RNG, 9 ECS, 14 systems (ClockSystem, HungerSystem, ActionSystem, MovementSystem), 2 seed-determinism, 1 soak. GitHub Actions CI (lint + test + soak). Soak: 10,000 ticks in 37 ms, zero invariant violations, 4 of 20 agents alive at day 41. Filled in CLAUDE.md commands and README Run section.
- State: **Green.** All 33 tests pass, soak passes, tsc clean.
- Next: **Milestone 1 — Content Framework & Species** (YAML loader + schema validation, data-driven human archetype, second species, name generator, first capability tag).
- Blockers/Questions for human: Population drifts downward ~20→4 over 41 days (food regen outpaced by consumption with no reproduction). This is correct behavior for M0 (starvation works; no birth mechanic yet). If human prefers a stable population for demos, raise `foodRegenPerTick` in `src/sim/config.ts`.
- Decisions logged: none (all M0 choices follow D3/D5 directly).

## Session 1 — project founding — Flavor & content architecture defined
- Did: Added four design docs — `CONTENT_AND_DATA.md` (data-driven validated-YAML content), `WORLD_AND_ENVIRONMENT.md` (biomes/flora/fauna/resources + brain tiers), `MAGIC_AND_TECHNOLOGY.md` (unified capability system; magic & tech as traditions), `CULTURE_AND_LANGUAGE.md` (deep-but-tenable evolution + naming). Updated VISION (setting + deferred aesthetic), ARCHITECTURE (content layer, brain tiers), ROADMAP (reordered into M0–M8), DECISIONS (added D8–D13), README, and `config/simulation.yaml`. Still no code.
- State: Pre-code. Design foundation complete and internally consistent. Nothing to test yet.
- Next: Execute **Milestone 0 — Foundation & Heartbeat** (TS + ECS + seeded RNG + headless tick loop + first tests + ~20-agent world + minimal dot renderer). Stop and report after M0.
- Blockers/Questions for human: none.
- Decisions logged: D8–D13 (see DECISIONS.md).

## Session 0 — project founding — Foundation documents created
- Did: Wrote the initial document set (README, CLAUDE, VISION, ARCHITECTURE, SIMULATION_MODEL, ROADMAP, PROGRESS, DECISIONS) and `config/simulation.yaml`. No code.
- State: Pre-code. Repo held docs + config only.
- Next: Execute Milestone 0.
- Blockers/Questions for human: none.
- Decisions logged: D1–D7.
