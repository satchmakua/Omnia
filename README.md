# Omnia — The Everything Simulator

Omnia simulates a small living, breathing **town** of a few hundred unique agents who live and die, sleep, eat, work, earn and lose money, fall in love, marry, cheat, have children and grandchildren, get sick, get happy and sad, and — over generations — form families, companies, gangs, and small empires. The town is the stage; **the agents are the point.** The graphics are deliberately minimal (colored dots on a grid, in the spirit of Dwarf Fortress), but the inspector and history UIs are rich.

The setting is a weird, psychedelic, post-apocalyptic fantasy (think *Adventure Time* in tone) where humans are dominant but share the world with dwarves, orcs, giants, dragons, and stranger things — all of which are just different *flavors* of agent. Magic is real but rare; technology is its common cousin. Cultures and languages **evolve** across the generations.

This repository is built to be developed **incrementally by an AI agent over many sessions.** A human checks in occasionally; most of the time the instruction is simply "keep going," and the agent should know what to do.

## Read order

**If you are an AI agent picking this up, read these in order before doing anything:**

1. `CLAUDE.md` — your operating manual. The "continue" loop, the definition of done, and the guardrails that stop you wandering off. **Start here.**
2. `docs/VISION.md` — what we're building, the setting, and what we are **not** building.
3. `docs/ARCHITECTURE.md` — the technical constitution: stack, ECS, determinism, the agent brain, the content layer.
4. `docs/SIMULATION_MODEL.md` — how agents think and how history is compressed across generations.
5. `docs/CONTENT_AND_DATA.md` — the data-driven content system (validated YAML). How flavor is added without revamps.
6. `docs/WORLD_AND_ENVIRONMENT.md` — biomes, flora, fauna, resources, world-gen, and the entity/brain tiers.
7. `docs/MAGIC_AND_TECHNOLOGY.md` — the unified capability system; magic and technology as traditions.
8. `docs/CULTURE_AND_LANGUAGE.md` — evolving cultures, languages, and the naming system.
9. `docs/ROADMAP.md` — the ordered, bounded backlog. "Keep going" means: do the next unchecked item here.
10. `docs/PROGRESS.md` — the session log. Read the top entry to see exactly where the last session left off.
11. `docs/DECISIONS.md` — settled decisions and their rationale. Do not relitigate these; flag them if you disagree.

## Tunable knobs

`config/simulation.yaml` holds the simulation constants (world size, tick rate, need-decay, history thresholds, capability rarity, culture/language evolution, LLM settings). Tune behavior here without touching logic.

## Content

`/content` holds the authored YAML that defines the world's flavor — species, creatures, biomes, flora, fauna, resources, buildings, professions, capabilities, cultures, languages. See `docs/CONTENT_AND_DATA.md`.

## Running it

```
npm install       # install dependencies
npm run dev       # open http://localhost:5173 — moving dots + click inspector
npm test          # 33 unit / seed / soak tests (vitest)
npm run soak      # 10,000-tick headless run with health metrics (~40 ms)
npm run lint      # TypeScript type-check
```

**Controls:** click any dot to open the inspector panel; Space to pause/resume.

**Legend:** white = wandering, orange = seeking food, blue = sleeping.

## Stack at a glance

- **Language:** TypeScript (simulation core *and* UI).
- **Pattern:** Entity-Component-System (ECS); content as validated data.
- **AI:** local LLM via Ollama, behind a swappable `AIProvider` interface.
- **Tooling:** GitHub (Issues as backlog, Actions for CI), built by Claude Code.
