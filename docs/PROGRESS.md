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
