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
