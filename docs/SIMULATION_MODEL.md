# SIMULATION_MODEL.md — Deep Agents & The Compression of History

This is the heart of Omnia. Two halves: **(1)** what makes an agent a believable individual, and **(2)** how the town's history stays rich across generations without growing without bound. The second half is the project's signature problem — read it carefully.

---

## Part 1 — The Deep Agent

At town scale we fully simulate every living agent. "Deep" means each agent carries:

- **Identity:** name, age, sex, and a small set of **personality traits** (e.g. on axes like sociable↔solitary, cautious↔reckless, honest↔scheming, content↔ambitious). Traits bias utility scores and LLM voice.
- **Needs:** hunger, energy, hygiene, social, fun, and money/security. Needs decay over time (rates in `config/simulation.yaml`); low needs raise the utility of actions that satisfy them.
- **Mood/emotion:** a current affective state nudged by events (a death saddens, a windfall elates), feeding back into behavior.
- **Health:** condition, illness, injury, and mortality risk that rises with age and circumstance.
- **Economy:** a wallet, income, debts, possessions.
- **Relationships:** a graph of edges to other agents, each with sentiment and type (family, friend, rival, lover, employer...). Sentiment shifts with shared events.
- **Occupation/role:** job, employer, and standing within any organization.
- **Goals:** a small stack of active goals the planner is pursuing.
- **Memory:** the agent's stream of remembered events (see Part 2 — memory and history share one machinery).
- **Lineage:** parents, children, and ancestry pointers.

### How an agent decides (the three layers, recap)

1. **Utility (every tick):** score needs, pick the best available action. Cheap, deterministic.
2. **Planning (as needed):** behavior tree / GOAP to chase multi-step goals.
3. **LLM soul (rare):** dialogue, major decisions, backstory, dreams, reflection.

### When the LLM is allowed to fire

Only on *meaningful* moments, each gated by a per-agent cooldown and the global concurrency cap:

- two agents converse and the exchange matters (courtship, conflict, a deal);
- a major fork in a life (take the risky job? leave the marriage? join the gang?);
- end-of-day/season **reflection** (compress recent memories into beliefs);
- occasional dreams or inner monologue that color mood.

Everything else is handled by layers 1–2. This keeps LLM volume low enough to run locally.

### Memory: capture and retrieval

- Each salient happening is written to the agent's memory as an **event** with a timestamp and an **importance score** (mundane = low, life-changing = high).
- When the LLM needs context, memories are **retrieved** by a blend of *recency*, *importance*, and *relevance* (embedding similarity to the current situation). Only the top few are passed in — keeps prompts small.
- **Reflection** periodically reads recent memories and writes back higher-level **beliefs** ("distrusts the Thorne family", "proud of the bakery"). Beliefs are compact and durable.

---

## Part 2 — The Compression of History

The problem: a few hundred agents, each accruing memories every day, across many generations, plus a growing pile of dead agents and world events — left raw, this grows without limit and drowns the simulation. The town must *remember like history actually remembers*: a handful of vivid legends over an ocean of forgotten ordinary lives.

### The governing principle

> **Fidelity is proportional to importance × recency.**
> Recent + important → stored sharply. Old + trivial → dissolved into statistics. Everything ages toward the blur unless its importance keeps it sharp.

This single rule drives every mechanism below.

### Mechanism 1 — Multi-resolution memory (per agent)

Each agent's past is stored at three shrinking resolutions, like a time-series database downsamples old data:

- **Working memory (recent, high fidelity):** the last *K* events as raw detail. (*K* in config.)
- **Episodic summaries (mid-term):** older raw events are **rolled up** on a schedule into periodic digests ("a hard winter; lost the cart-horse; grew close to Mira"), and the raw events are **discarded**. High-importance events survive the rollup intact.
- **Beliefs/traits (long-term):** reflections — stable, compact facts that persist for life.

So an agent can have lived sixty years while storing only kilobytes: a little raw recent detail, a thread of summaries, a handful of beliefs.

### Mechanism 2 — Importance scoring & pruning

Every event and memory gets an importance score. The rollup/prune pass:

- keeps high-importance items at full fidelity (they may also be promoted to the world Chronicle);
- folds low-importance items into the nearest summary, then deletes the raw copy;
- lets the trivial decay out entirely, surviving only as a contribution to statistics.

### Mechanism 3 — The Chronicle (world-level legends)

An append-only log of **only notable events** — those above an importance threshold:

- births and deaths of significant agents, founding and collapse of companies/gangs/families, feuds and their resolutions, records broken, disasters.
- The Chronicle is itself tiered: recent chronicle entries are detailed; ancient ones compress to one-line legends.
- This is the "Legends mode" the player browses, and it is small by construction because most events never qualify.

### Mechanism 4 — Statistical strata (the forgotten, in aggregate)

Everything not individually remembered still *counts*: it feeds fixed-size running aggregates — population over time, wealth distribution, birth/death and marriage rates, cause-of-death histograms, organization lifespans. This is what powers the world-health charts. The cost is constant regardless of how much history has passed.

### Mechanism 5 — Tombstones (the dead)

When an agent dies, its full object is freed and replaced by a compact **tombstone**: name, lifespan, role, a one-line legacy, and edges to relations/descendants (the family tree). Living agents keep pointers to tombstones, so "your grandmother who founded the guild" remains referenceable without keeping her whole self in memory.

### Mechanism 6 — Procedural regeneration (optional, advanced)

For deep history that was compressed away, plausible detail can be **reconstructed on demand** from its summary + a deterministic seed if the player ever drills in. Because regeneration is seeded, it's stable (you get the same reconstructed detail every time). This makes the past feel bottomlessly deep while storing almost nothing — the same on-demand trick we use elsewhere, applied to time instead of space. *Build this last, only if the cheaper mechanisms leave history feeling thin.*

### What runs when

- Rollups, pruning, and reflection run on a **schedule** (e.g. end of day/season in sim time), not every tick, so compression cost is amortized and predictable.
- Thresholds, retention windows, and *K* all live in `config/simulation.yaml` so the balance between "rich" and "cheap" is tunable without code changes.

### The failure mode to watch

The flagged risk: compress so hard that history goes **flat** — every legend reduced to bloodless statistics. Guard against it by keeping importance scoring generous toward the dramatic (deaths, betrayals, foundings, ruin) and by preserving *named, sharp* Chronicle entries even when the surrounding detail is gone. A good test of this system is qualitative: open Legends after many generations and check that it reads like a *story*, not a spreadsheet.
