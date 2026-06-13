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
