# DECISIONS.md — Decision Log

Settled decisions and *why*. **Do not relitigate these.** If you think one is wrong, write the concern into `PROGRESS.md` for the human — don't silently reverse it. Add new decisions as they're made, with date and status.

Format: **ID — title** · status · rationale.

---

**D1 — Working title is "Omnia — the everything simulator."** · accepted
The name reflects the ambition; scope is nonetheless bounded (see D2).

**D2 — Scale: a town of hundreds of deep agents.** · accepted
Not a city, nation, or world. Rationale: depth and believability per agent beat raw population. This keeps every living agent fully simulated and shifts the hard problem from spatial abstraction to *temporal* history compression (D4). Explicitly rules out aggregate off-screen population / "Schrödinger's citizens." Changing scale is a deliberate future decision, not something to build for preemptively.

**D3 — Language: TypeScript end-to-end (simulation core and UI).** · accepted
One language minimizes maintenance surface for an AI working across many sessions; the type checker guards against editing mistakes; the browser makes the UI easy and shareable. At town scale TS is fast enough for the core, so we deliberately avoid a second high-performance language (Rust/Python). Revisit only if scale (D2) changes.

**D4 — History model: smart lossy compression, "fidelity ∝ importance × recency."** · accepted
History is central to the concept but must stay cheap. Recent/important is stored sharply; old/trivial dissolves into statistics and one-line legends. Implemented via multi-resolution memory, importance scoring + pruning, a tiered Chronicle, statistical strata, tombstones, and optional procedural regeneration (see `SIMULATION_MODEL.md`). Chosen over both "keep everything raw" (unbounded growth) and naive aggressive forgetting (flattens the story). Guard against flattening — Legends must read like a story, not a spreadsheet.

**D5 — Engine architecture: ECS, deterministic seeded core, sim/render decoupled, layered agent brain.** · accepted
ECS lets each session add features as isolated Components/Systems. A single seeded RNG makes runs reproducible. The renderer only reads sim state. The agent brain is layered by cost: utility (every tick) → planning (as needed) → LLM (rare). LLM access hides behind one `AIProvider`. LLM responses are recorded into the event log so determinism survives nondeterministic generation. See `ARCHITECTURE.md`.

**D6 — Execution vehicle: Claude Code (agentic, in-repo).** · accepted
The agent reads the repo, runs the tests, and commits itself, which is what makes "keep going" genuinely self-directed rather than a copy-paste loop. The human checks in occasionally. (The earlier standalone "kickoff prompt" is retired; `CLAUDE.md` is now the agent's entry-point manual.)

**D7 — Document formats: Markdown for prose docs; YAML for tunable config; TypeScript types as the data schema; no XML.** · accepted
Markdown is the lingua franca for human- and agent-readable docs. YAML carries the tunable constants (it supports comments, which a tuning file needs). In a typed codebase the TS types *are* the save/state schema, so a separate schema doc would only rot. XML adds verbosity with no benefit here.

**D8 — Setting: weird, psychedelic, post-apocalyptic fantasy, Adventure-Time-ish in tone; humans dominant.** · accepted
The world is shared by many kinds of people — humans (dominant), dwarves, orcs, giants, dragons, and stranger creatures — plus animals and flora. Something fell long ago; ruins and lost arts remain. Tone is lighter than grimdark. All flavor lives in content (D9), so the engine is generic.

**D9 — Content is data-driven (validated YAML); behavior is code.** · accepted
Races, creatures, biomes, flora, fauna, buildings, professions, capabilities, and seed cultures/languages are authored YAML loaded into typed registries. The format is secondary; the load-time **schema validation** (Zod-style validator that is also the type) is the real safeguard and must fail loud/early. Data declares *what exists and its properties/capability-tags*; code implements *what tags do* — no logic in YAML. Evolving things (cultures, languages, history) are runtime state seeded by YAML, not authored content. The content tree doubles as the mod and worldbuilding surface. See `CONTENT_AND_DATA.md`.

**D10 — Entity & brain tiers.** · accepted
Sapient folk get the full brain incl. the rare LLM "soul"; fauna get instinct-only AI with **no LLM**; flora and resources have **no brain** (rule-driven state). This is a performance invariant, not just flavor. See `WORLD_AND_ENVIRONMENT.md`.

**D11 — Magic and technology are one unified Capability system, not two subsystems.** · accepted
Every capability shares one shape: invoke → prerequisites → cost → effect (effect-tags implemented in code). "Technology" and "magic" are **traditions** defined as content: technology is common and knowledge-gated; magic is rare and gated by an innate aptitude most agents never roll. Extensible to more traditions (alchemy, bio-engineering, ritual) as data. Rationale: simpler to build and richer in play; fits the post-apoc "lost tech ≈ magic" theme. See `MAGIC_AND_TECHNOLOGY.md`.

**D12 — Cultures and languages evolve deeply but tenably.** · accepted
Depth lives in rules and process (sound change, lexical/semantic drift, divergence into language families, cultural value drift and schism); stored state stays tiny via: few shared objects (not per-agent), a slow generational schedule (not per tick), procedural + generate-on-demand lexicons (rules + seed, not stored whole), compression of dead languages/cultures to descent-trees, and deliberately **light grammar** (no full syntax engine — the scope line that keeps it tenable). Mechanics are procedural/deterministic; the LLM is optional flavor only. Naming derives from language/culture. See `CULTURE_AND_LANGUAGE.md`.

**D13 — Aesthetic: pastel/lo-fi visuals + lo-fi ambient audio, deferred.** · accepted
The look is soft, muted, calm; eventually a lo-fi music layer. This is presentation and the lowest priority — the interface stays minimal (dots + inspector) until the simulation is deep. Lives in the final roadmap milestone. Recorded so eventual UI work has direction.

**D19 — LLM layer: deterministic stub is the default; reflection runs on a synchronous replayable path; live model is async + recorded.** · accepted (M5)
The default `AIProvider` is a **deterministic, offline `StubProvider`** so the sim stays headless, fast, reproducible, and CI-green with no model installed. The in-sim `AISystem` only uses the **synchronous** `completeSync` path (deterministic providers) so reflection never blocks the tick and never perturbs the seeded RNG (the AI layer consumes no RNG). The real model (`OllamaProvider`) is **async + opt-in**, driven off the hot path by `AIRunner` (concurrency cap + timeout fallback) and its responses **recorded** (`AIRecord`) so a replay via `RecordedProvider` reproduces a run exactly (proven by a test that replays a non-deterministic run). Beliefs don't yet feed back into behaviour (so generation can't change the trajectory) — that, plus dialogue/decisions/dreams, is M5 part 2.

**D18 — UI brought forward at the human's request: per-class visual vocabulary + a live event feed.** · accepted (post-M4)
D13 deferred presentation until the sim was deep; the human judged it deep enough and asked for a clearer, richer view now. So: every entity class has a distinct **silhouette** (folk = pawn, fauna = triangle, flora = sprout, resource = block, business = house) plus colour/size cues, and a live **EventLog** drives a "Town Happenings" feed (births, deaths, weddings, jobs, spells, spent veins) — separate from the durable Chronicle. This is *not* the full aesthetic/audio polish (still M8); it's making the existing drama legible. First new agent–world interaction also landed: **resource gathering** (miners/labourers deplete ore/timber nodes; finite veins run dry). Trade, building, and conflict/vice remain roadmapped.

**D17 — Reproduction holds a carrying capacity; marriage via a matchmaking pass; heritable aptitude.** · accepted (M4)
Births come from married opposite-sex couples (fed, healthy, fertile age, off a recovery cooldown) and **pause at a population cap**, so the town grows to a carrying capacity and holds there — the same bounded-equilibrium pattern used for flora/fauna, which keeps it stable over deep time (no collapse or explosion). Marriage is a reliable **matchmaking pass** over unattached adults (with an incest guard) rather than relying on two wanderers sharing a tile — the purely spatial courtship left the town slowly dying out. Magic aptitude is **heritable** (a mage's child has a much higher, but diluting, chance) so it runs in families while staying uncommon. Founders are pre-paired so households exist from day one.

**D16 — Death = strip-components-keep-id tombstone; time compressed via `daysPerYear`.** · accepted (M4)
On death an agent's living components are removed and a single compact `Tombstone` is attached to the **same entity id** (the entity stays "alive" in the ECS), so existing `Lineage` pointers keep resolving — the dead remain referenceable without keeping their whole self in memory (SIMULATION_MODEL Mechanism 5). Age/lifespan are measured in ticks via a configurable `daysPerYear` (default 4) so lifespans of decades turn over within a watchable/soakable run; mortality is a steep age ramp (`ageRatio^10`) plus a small base/illness chance. Relationships are an adjacency-built edge map (sentiment + type); the social need is met by proximity. Reproduction and multi-generation balance are deferred to M4 part 2.

**D15 — Capability engine: one `invokeCapability` path; magic gated by an optional `Magic` component; behaviour pay-not-gated-on-location.** · accepted (M3)
Both traditions run through a single `canInvoke`/`invokeCapability` (prerequisites → cost → effect tags); technology and magic differ only in data (aptitude gate, mana vs energy cost). Magic aptitude is modelled as an **optional `Magic` component** present only on the rare agents who rolled it — so the future LLM/capability layers find casters cheaply and most folk simply lack it (and it can never attach to fauna). Economy wages and capability use are **not gated on standing on an exact tile** (greedy pathfinding would otherwise strand agents); movement-to-workplace is visual only. Per-agent **wealth goal** bounds gold accumulation so the economy is stable over deep time without a money sink. Deferred: supply/demand market, resource-consuming crafting, skill gating, lost arts (all in ROADMAP backlog).

**D14 — Tooling: Vite + Vitest; Zod for content validation; `yaml` for parsing.** · accepted (M0–M1)
Vite is the dev server/bundler and Vitest the test runner (the conventional TS/Vite pair; Jest-compatible API). Content validation uses **Zod** with `.strict()`, deriving the TS type from the schema (the "schema-as-type" Rule 1 of `CONTENT_AND_DATA.md`); YAML is parsed with the `yaml` package. The content loader is a **pure** `loadContent(Map<path,text>)` with two thin file-discovery sources — Node `fs` (tests/soak) and Vite `import.meta.glob` (browser) — so it runs identically in both. Test quality bar: coverage gated at 90%/85% in CI, plus `fast-check` property tests for determinism-critical invariants. Conventional choices, recorded so they aren't relitigated.
