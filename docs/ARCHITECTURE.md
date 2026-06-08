# ARCHITECTURE.md — Technical Constitution

This is the technical foundation. Follow these patterns; changing them is a `DECISIONS.md`-level event.

## Stack

- **Language: TypeScript**, for both the simulation core and the UI. One language keeps the surface area small for an AI maintaining the project across sessions, and TypeScript's type checker acts as a guardrail that catches a whole class of editing mistakes before they run. (At town scale — hundreds of agents — TypeScript is fast enough for the core; we deliberately avoid a separate high-performance language.)
- **Runtime:** Node for headless simulation and tests; the browser for the rendered view. The simulation code must run in both.
- **Rendering:** PixiJS or plain Canvas — a 2D grid of colored dots plus DOM/Canvas inspector panels. Kept dumb and replaceable.
- **AI:** local LLM served by **Ollama** (which speaks the OpenAI API). All access goes through one `AIProvider` interface; the model is a config string.
- **Content:** the world's flavor (species, creatures, biomes, flora, fauna, capabilities, seed cultures/languages) is **validated YAML data**, not code, loaded into typed registries at startup. A schema-as-type validator (Zod-style) guards every file. See `CONTENT_AND_DATA.md`.

## Core pattern: Entity-Component-System (ECS)

ECS is the backbone because it lets each session add a feature as an isolated unit without disturbing the rest.

- **Entity** — an id. An agent, a building, an organization, an item.
- **Component** — plain data attached to an entity (`Position`, `Needs`, `Wallet`, `Relationships`, `Health`, `Memory`, `Goals`, `Lineage`, ...). No logic.
- **System** — logic that runs each tick over entities with the components it cares about (`MovementSystem`, `HungerSystem`, `EconomySystem`, `ReproductionSystem`, ...).

**Rule:** new features = new Components + new Systems. Don't bolt logic onto existing systems unless the feature genuinely belongs there.

## The simulation loop

- A fixed-timestep **tick** is the unit of simulation. Systems run in a defined, deterministic order each tick.
- **Simulation time is decoupled from real time.** The renderer can run the sim at 1×, fast-forward, or pause. Tests run it as fast as the CPU allows.
- The loop is **headless-capable**: it runs fully without any renderer attached.

## Determinism (non-negotiable)

- **One seeded RNG** for the entire simulation. No `Math.random()` anywhere in sim code. A given seed produces an identical run.
- This is what makes emergent bugs reproducible and makes save/replay possible.
- **LLM nondeterminism is handled by recording, not by trusting the model.** Every LLM response is written into the event log. Deterministic replay reads the recorded response instead of re-calling the model. So even though live generation varies, a replay of a given seed + recorded responses is exact.

## The agent brain (three layers)

Never call the LLM for every agent every tick. Behavior is layered by cost:

1. **Utility / needs (every tick, pure code, no LLM).** Each agent scores its needs (hunger, energy, hygiene, social, fun, money/security) and picks the highest-utility action. Handles the moment-to-moment: eat, sleep, work, wander, socialize.
2. **Goal planning (pure code).** For multi-step goals ("broke → find job → earn → buy home"), use behavior trees or **GOAP** (Goal-Oriented Action Planning — the agent searches for a sequence of actions that reaches a goal). Still no LLM.
3. **LLM "soul" (rare, async, throttled).** Reserved for *interesting moments only*: dialogue between agents, occasional major life decisions, generating backstory, dreams, and periodic **reflection** (summarizing recent memories into higher-level beliefs). Always off the hot path.

Detailed in `SIMULATION_MODEL.md`.

**Brain tiers (a performance invariant).** Not every living thing gets the full brain. Sapient folk get all three layers including the rare LLM soul; **fauna** (animals) get instinct-only utility AI with **no LLM**; **flora and resources** have no brain at all (rule-driven state). This tiering is what keeps the expensive LLM layer touching only a minority of agents. See `WORLD_AND_ENVIRONMENT.md`.

## `AIProvider` interface

All LLM use hides behind one interface so the model is swappable and the rest of the code never knows which model is running.

```
interface AIProvider {
  complete(prompt, opts): Promise<string>;
  embed(text): Promise<number[]>;   // for memory retrieval
}
```

Default implementation targets Ollama at the URL/model set in `config/simulation.yaml`. Calls are queued with a concurrency cap; on timeout/failure the agent falls back to a non-LLM default so the sim never stalls.

## Performance budget (guidance, tune in config)

- Target: simulate **up to ~500 active agents** smoothly on a typical laptop.
- Core systems (everything except the LLM): aim for a tick well under a few milliseconds at that population. If a system blows the budget, profile and fix *before* adding more.
- LLM calls: rare and throttled (cooldowns per agent), capped concurrency, always async.
- A secondary lever if needed: agents that are off-screen or indoors may tick at a reduced frequency. This is a light optimization, **not** the aggregate-population abstraction we ruled out in `VISION.md`.

## Project structure (proposed; the agent finalizes in M0)

```
/src
  /sim         # pure simulation: ecs, systems, components, rng, world
  /ai          # AIProvider, prompts, memory retrieval
  /render      # PixiJS/Canvas renderer + inspector UI (reads sim only)
  /history     # compression pipeline: importance, rollups, chronicle, strata
  /content     # YAML loader + schemas (Zod-style) -> typed registries
  /world       # world-gen, biomes, flora/fauna/resources
  /capability  # the unified magic/technology engine (effect-tag behaviors)
  /lang        # culture & language evolution + naming
/content       # authored YAML data (species/, biomes/, capabilities/, cultures/, languages/, ...)
/test          # unit + invariant/soak tests
/config        # simulation.yaml
/docs
```

Note: `/src/content` is the *loader and schemas* (code); top-level `/content` is the *authored data* (YAML). Shared objects like languages, cultures, and capability definitions are referenced by agents, not copied per-agent.

## Testing approach (expanded in CLAUDE.md's loop)

- **Unit tests** per system.
- **Invariant / soak tests:** run many ticks headless and assert the world stays sane (population bounded, no negative wallet without a debt record, an agent that never eats dies, etc.).
- **Golden / seed tests:** fixed seed → identical outcome, catching unintended behavior changes.
- **World-health metrics:** population, wealth distribution, birth/death rates, average mood over time — surfaced so regressions are visible even when no assertion fires.

## CI

GitHub Actions runs the full suite on every push. Main stays green. GitHub Issues track the backlog alongside `ROADMAP.md`.

## Domain models (where the detail lives)

This file is the engine constitution. The "what" of each domain lives in its own doc, all consistent with the rules here:

- `SIMULATION_MODEL.md` — the deep agent and history compression.
- `CONTENT_AND_DATA.md` — the validated-YAML content layer and the data/behavior boundary.
- `WORLD_AND_ENVIRONMENT.md` — biomes, flora, fauna, resources, world-gen, brain tiers.
- `MAGIC_AND_TECHNOLOGY.md` — the unified capability system (magic & technology as traditions).
- `CULTURE_AND_LANGUAGE.md` — evolving cultures, languages, and naming.
