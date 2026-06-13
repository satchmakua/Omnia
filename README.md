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
npm install            # install dependencies (first time only)
npm run dev            # launch the live view → http://localhost:5173
npm test               # full test suite (vitest)
npm run test:coverage  # same, plus a coverage report (gated 90%/85% in CI)
npm run soak           # 10,000-tick headless run with world-health metrics
npm run lint           # TypeScript type-check (tsc --noEmit)
```

To watch the simulation, run `npm run dev` and open **http://localhost:5173** in a
browser. (Everything runs locally; no server, account, or model needed yet.)

### Exploring the live view

When the page loads you're looking at a small living world ticking in real time.

**Controls**
| Input | Effect |
|-------|--------|
| **Click** a dot, diamond, plant, or node | Open the **inspector** (right panel) for that thing |
| **Space** | Pause / resume (handy for clicking a specific creature) |
| **C** | Open / close the **Chronicle** — the world's invented backstory |
| **✕** (top-right of the inspector) | Close the inspector |

**What you're looking at**
- **Biome regions** tint the map: ash-green *plains*, phosphor-green *fungal forest*,
  amethyst *crystal flats*, ochre *irradiated wastes*, and deep-blue *drowned ruins*.
  The blue water is **impassable** — nothing spawns or walks on it, and creatures
  route around it.
- **Round dots = sapient folk** (your townspeople). Fill colour shows what they're
  doing — white = wandering, orange = seeking food, blue = sleeping — and the
  coloured ring + size shows their **species** (warm-sand/larger = human,
  slate/smaller = dwarf).
- **Diamonds = fauna** (animals: moth grazers, dust hoppers). Instinct-only — they
  graze plants, breed when well-fed, and die if they starve. **No LLM, ever.**
- **Soft circles = flora** (plants/fungi). They start small and grow; a brighter,
  larger circle is riper and edible. Folk and fauna forage them.
- **Small squares = resource nodes** (timber, ore, reactive crystal).
- **The HUD** (top bar) shows the day, a ☀/☾ that flips each half-day, and live
  counts of **Folk / Fauna / Flora**.

**Things worth trying**
- Press **C** to read how this particular world ended and began — a different story
  for every seed.
- **Click a moth grazer** (diamond) and watch its hunger bar; pause first if it's
  darting around. Click a **plant** to see its maturity and food yield.
- Watch the HUD **Fauna** count climb as animals breed, then settle as the land
  reaches its carrying capacity.

> The `world.seed` in `config/simulation.yaml` (mirrored in `src/sim/config.ts`)
> chooses the world; the same seed always produces the same town, backstory, and
> run. Change it for a brand-new world.

### Sanity-checking it headlessly

**Run the tests** — `npm test`: every file should pass (`Test Files N passed`).
Covers the RNG, ECS, every system, the content loader, seed-determinism, property
tests, and a 10,000-tick soak.

**Run the soak** — `npm run soak`. It prints a metrics line every 1,000 ticks and
ends with **`PASS`**. Watch for:
- **`invalid=0`** on every line — nobody is ever out of bounds, on water, or in an
  impossible state. A `*** VIOLATION ***` marker means a real bug.
- The **species mix** (e.g. `[human=12 dwarf=8]`): dwarves get hungry more slowly,
  so they tend to persist — proof archetypes change behaviour, not just looks.
- **`flora`/`fauna`/`res`** counts: flora fills in, fauna breed up toward the land's
  carrying capacity, then hold steady — a stable ecosystem, not a runaway one.

## Legend

| On screen | Meaning |
|-----------|---------|
| Coloured tile | Biome (deep blue = impassable water) |
| Round dot | Sapient folk — fill = action, ring = species |
| Diamond | Fauna (animal, instinct-only) |
| Soft circle | Flora (plant; bigger/brighter = riper) |
| Small square | Resource node (timber / ore / crystal) |

## Stack at a glance

- **Language:** TypeScript (simulation core *and* UI).
- **Pattern:** Entity-Component-System (ECS); content as validated data.
- **AI:** local LLM via Ollama, behind a swappable `AIProvider` interface.
- **Tooling:** GitHub (Issues as backlog, Actions for CI), built by Claude Code.
