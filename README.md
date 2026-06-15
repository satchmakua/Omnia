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
| **Click** anyone or anything | Open the **inspector** (right-side panel) for that thing |
| **C** | Open / close the **Chronicle** — the world's invented backstory |
| **Live feed** (lower-left) | The **Town Happenings** ticker — births, weddings, deaths, new jobs, spells, spent veins, as they happen |
| **✕** (top-right of the inspector) | Close the inspector |

> Things feel too fast? Drag the speed slider down, or pause with **Space** and
> click at your leisure. The starting speed is intentionally gentle.

**What you're looking at**

- **Biome regions** tint the map: ash-green *plains*, phosphor-green *fungal forest*,
  amethyst *crystal flats*, ochre *irradiated wastes*, and deep-blue *drowned ruins*.
  The blue water is **impassable** — nothing spawns or walks on it, and creatures
  route around it.
Each kind of thing has its own **silhouette**, so the world reads at a glance:

- **Folk = little "pawns"** (a head over a body) — your townspeople. The **body
  colour** is their species (warm sand = human, slate-blue = dwarf), the **outline
  colour** is what they're doing (white = wandering, orange = seeking food, blue =
  sleeping, gold = working, pink = socialising), and they're drawn **smaller as
  children, larger as adults**. A small **violet pip** marks the rare **mage**.
- **Triangles = fauna** (moth grazers, dust hoppers). Instinct-only — they graze
  plants, breed when well-fed, and die if they starve.
- **Sprouts (stem + leaf) = flora** (plants/fungi). They grow taller/brighter as
  they ripen; folk and fauna forage them.
- **Blocks = resource nodes** (timber, ore, reactive crystal); they dim as they're
  worked down.
- **Houses = businesses** — employers (laborer, farmer, miner, artisan, merchant,
  and the rare hedge-witch), coloured by trade. Folk take jobs there.
- **The HUD** (top bar) shows the day, a ☀/☾ that flips each half-day, live counts
  of **Folk / Mages / Graves** and **Fauna / Flora**, and the town's **Gini**
  (wealth inequality).
- Folk **age, befriend each other, marry, have children, fall ill, and die** —
  the dead leave a grave (the **Graves** count climbs over time). Click someone to
  see their age, sex, social need, health, and family (partner + children).
- The town **grows toward a cap and then holds steady** as births balance deaths,
  sustaining itself across many lifetimes. Magic **runs in families** (a mage's
  children are likelier to be gifted).
- **Miners and labourers gather resources** — they walk out to ore and timber
  nodes and work them down. A finite **ore vein eventually runs dry** (and the
  block vanishes, noted in the feed); renewable timber regrows.
- **Watch the lower-left feed** for the running story: who was born, who wed, who
  died and of what, who took a job, who cast a spell.

**Things worth trying**

- Press **C** to read how this particular world ended and began — a different story
  for every seed.
- **Pause** (Space), then **click a moth grazer** (a triangle) and watch its hunger
  bar. Click a **sprout** to see its maturity and food yield.
- Watch the HUD **Fauna** count climb as animals breed, then settle as the land
  reaches its carrying capacity.
- **Click a person** to see their job, gold, and (if any) debt; click a **business**
  to see its trade, staff, and balance. Watch the HUD **median wealth / Gini** —
  the town stratifies into richer and poorer folk over the first few days.
- **Find the mage.** The HUD shows how many **Mages** the town has (the default
  seed has one — look for the violet pip). Click them to see their mana, and
  watch it drain when they cast. No mage in your town? Magic is deliberately rare
  — change `seed` in `src/sim/config.ts` for a different draw.
- **Watch generations turn over.** Fast-forward with the speed slider: couples
  pair off and have children (small dots), elders pass into **Graves**, and the
  town refills itself. Click a long-lived elder and a child to see the family
  links between them — the town sustains itself across many lifetimes.

> Want a different world? Edit `seed` in **`src/sim/config.ts`** (the authoritative
> config) and restart. The same seed always produces the same town, backstory, and
> run. *(`docs/simulation.yaml` mirrors these knobs as readable reference, but is
> not loaded yet — wiring it as the live config is on the roadmap.)*

## Other commands

Run these the same way (inside the `Omnia` folder):

```
npm test               # run the full test suite (vitest)
npm run test:coverage  # tests + a coverage report (gated 90%/85% in CI)
npm run soak           # 10,000-tick headless run printing world-health metrics
npm run lint           # TypeScript type-check (no output = all good)
```

**`npm run soak`** is a quick confidence check with no browser: it runs ~42 sim-years
and ends with **`PASS`**. Watch `invalid=0` on every line (no impossible states),
`folk` climbing to the population cap and holding (births balancing deaths),
`born`/`graves`/`married` rising as generations turn over, and `nodes` dropping as
finite ore veins are mined out.

---

# For the AI agent building this

This repository is built to be developed **incrementally by an AI agent over many
sessions.** A human checks in occasionally; most of the time the instruction is
simply "keep going," and the agent should know what to do.

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

`src/sim/config.ts` (`defaultConfig`) is the **authoritative** set of simulation constants (world size, tick rate, need-decay, economy, life cycle, capability rarity, LLM/reflection settings) — edit there and restart. `docs/simulation.yaml` mirrors these as human-readable, commented reference; a YAML loader that makes it the live config is on the roadmap (it is not loaded today).

## Content

`/content` holds the authored YAML that defines the world's flavor — species, creatures, biomes, flora, fauna, resources, buildings, professions, capabilities, cultures, languages. See `docs/CONTENT_AND_DATA.md`.

## Legend (what's on screen)

| On screen | Meaning |
|-----------|---------|
| Coloured tile | Biome (deep blue = impassable water) |
| Pawn (head + body) | Sapient folk — body = species, outline = action, small = child |
| Triangle | Fauna (animal, instinct-only) |
| Sprout (stem + leaf) | Flora (plant; taller/brighter = riper) |
| Block (square) | Resource node (timber / ore / crystal); dims as it's worked |
| House | Business (employer; colour = profession) |
| Violet pip on a pawn | Magic aptitude (rare — a mage) |
| **Graves** (HUD count) | Folk who have died and left a tombstone record |

## Stack at a glance

- **Language:** TypeScript (simulation core *and* UI).
- **Pattern:** Entity-Component-System (ECS); content as validated data.
- **AI:** local LLM via Ollama, behind a swappable `AIProvider` interface.
- **Tooling:** GitHub (Issues as backlog, Actions for CI).
