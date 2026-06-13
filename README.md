# Omnia — The Everything Simulator

Omnia simulates a small living, breathing **town** of a few hundred unique agents who live and die, sleep, eat, work, earn and lose money, fall in love, marry, cheat, have children and grandchildren, get sick, get happy and sad, and — over generations — form families, companies, gangs, and small empires. The town is the stage; **the agents are the point.** The graphics are deliberately minimal (colored dots on a grid, in the spirit of Dwarf Fortress), but the inspector and history UIs are rich.

The setting is a weird, psychedelic, post-apocalyptic fantasy (think *Adventure Time* in tone) where humans are dominant but share the world with dwarves, orcs, giants, dragons, and stranger things — all of which are just different *flavors* of agent. Magic is real but rare; technology is its common cousin. Cultures and languages **evolve** across the generations.

---

# ▶ Run it yourself

Follow these steps exactly. They take about a minute the first time.

### 1. Make sure Node.js is installed

You need **Node.js version 18 or newer** (it comes with `npm`). Check by opening a
terminal and running:

```
node --version
```

If you see something like `v20.x` or `v24.x`, you're good. If you get a "command
not found" error, install Node from <https://nodejs.org> (the "LTS" download), then
close and reopen your terminal.

### 2. Open a terminal in the project folder

Any terminal works — **Windows PowerShell**, **Command Prompt**, or **Git Bash**.
The one rule: you must be **inside the `Omnia` folder** (the folder that contains
`package.json`), *not* its parent.

Navigate into it with `cd`:

- **PowerShell or Command Prompt:**
  ```
  cd C:\Users\satch\Projects\Omnia
  ```
- **Git Bash:**
  ```
  cd /c/Users/satch/Projects/Omnia
  ```

Confirm you're in the right place — this should list `package.json` among the files:

- PowerShell / CMD: `dir`
- Git Bash: `ls`

> **If you see `npm error … Could not read package.json … ENOENT`**, you are in the
> wrong folder (probably `C:\Users\satch\Projects`, the parent). Run `cd Omnia`
> first, then retry. That single mistake is the most common reason `npm` fails here.

### 3. Install dependencies (first time only)

```
npm install
```

This downloads the libraries into a `node_modules` folder (~10–30 seconds). You only
need to do this once (or after the dependencies change).

### 4. Start the live view

```
npm run dev
```

You'll see output ending in a line like:

```
  ➜  Local:   http://localhost:5173/
```

Open **that exact URL** in your web browser (in most terminals you can Ctrl-click
the link, or just copy-paste it). It's usually `http://localhost:5173`, but if that
port is busy Vite will pick another (e.g. `5174`) — always use the URL it actually
prints. You should see a colored grid with moving dots — the town.

**To stop the server**, click back in the terminal and press **Ctrl+C**.

---

## Exploring the live view

When the page loads you're looking at a small living world ticking in real time.

**Controls**

| Input | Effect |
|-------|--------|
| **Speed slider** (bottom of the screen) | Drag to set how fast time passes (ticks/second); the ▶/⏸ button pauses |
| **Space** | Pause / resume (easiest way to click a specific creature) |
| **Click** a dot, diamond, plant, or node | Open the **inspector** (right-side panel) for that thing |
| **C** | Open / close the **Chronicle** — the world's invented backstory |
| **✕** (top-right of the inspector) | Close the inspector |

> Things feel too fast? Drag the speed slider down, or pause with **Space** and
> click at your leisure. The starting speed is intentionally gentle.

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
  graze plants, breed when well-fed, and die if they starve.
- **Soft circles = flora** (plants/fungi). They start small and grow; a brighter,
  larger circle is riper and edible. Folk and fauna forage them.
- **Small squares = resource nodes** (timber, ore, reactive crystal).
- **The HUD** (top bar) shows the day, a ☀/☾ that flips each half-day, and live
  counts of **Folk / Fauna / Flora**.

**Things worth trying**

- Press **C** to read how this particular world ended and began — a different story
  for every seed.
- **Pause** (Space), then **click a moth grazer** (a diamond) and watch its hunger
  bar. Click a **plant** to see its maturity and food yield.
- Watch the HUD **Fauna** count climb as animals breed, then settle as the land
  reaches its carrying capacity.

> Want a different world? Edit `seed` under `world:` in `config/simulation.yaml`
> (mirrored in `src/sim/config.ts`) and restart. The same seed always produces the
> same town, backstory, and run.

## Other commands

Run these the same way (inside the `Omnia` folder):

```
npm test               # run the full test suite (vitest)
npm run test:coverage  # tests + a coverage report (gated 90%/85% in CI)
npm run soak           # 10,000-tick headless run printing world-health metrics
npm run lint           # TypeScript type-check (no output = all good)
```

**`npm run soak`** is a quick confidence check with no browser: it prints a metrics
line every 1,000 ticks and ends with **`PASS`**. Watch for `invalid=0` on every line
(no impossible states), the species mix (dwarves persist longer — they get hungry
more slowly), and the `flora`/`fauna` counts settling into a stable ecosystem.

---

# For the AI agent building this

This repository is built to be developed **incrementally by an AI agent (Claude Code)
over many sessions.** A human checks in occasionally; most of the time the instruction
is simply "keep going," and the agent should know what to do.

**If you are that agent picking this up, read these in order before doing anything:**

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

## Legend (what's on screen)

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
