# VISION.md — What Omnia Is (and Isn't)

## The one-sentence pitch

A small town of a few hundred genuinely distinct people whose ordinary and extraordinary lives — love, work, money, vice, family, death, and the rise and fall of the groups they form — accumulate into a believable history you can watch unfold and dig through.

## Pillars

1. **Agents are the point.** Every agent is an individual with needs, a personality, relationships, memories, and a life arc. Believability of behavior beats graphical fidelity or raw population count.
2. **A living, breathing world.** Things happen whether or not you're watching. Time passes, people age, businesses open and fail, feuds simmer. The world should feel like it has its own momentum.
3. **History matters.** Generations stack up. The town remembers its legends — the founder of the first guild, the gang war of the third generation, the family that rose and fell. Most ordinary lives blur into the background, exactly as in real history. (How we keep this rich but cheap is the subject of `SIMULATION_MODEL.md`.)
4. **Emergence over scripting.** Companies, gangs, dynasties, rivalries, and reputations should *emerge* from agents pursuing their needs and goals — not be hand-authored storylines.

## Setting & flavor

A weird, psychedelic, **post-apocalyptic fantasy**, lighter in tone than it sounds — closer to *Adventure Time* than grimdark. Something fell long ago; ruins and lost arts remain. The world is shared by many kinds of people:

- **Humans are dominant**, but **dwarves, orcs, elves, giants, dragons** and stranger creatures live alongside them. All of these are **flavors of agent** — data archetypes over the same engine (see `CONTENT_AND_DATA.md`), not special-cased systems. There's a spectrum from sapient folk (full minds) through animals (instinct only) to flora and resources (no mind) — see `WORLD_AND_ENVIRONMENT.md`.
- **Magic is real but rare**, and is the uncommon sibling of **technology** — both run on one underlying capability system, differing mainly in who can access them (`MAGIC_AND_TECHNOLOGY.md`).
- **Cultures and languages evolve** across generations into families, dialects, and schisms (`CULTURE_AND_LANGUAGE.md`).

Crucially, all of this flavor lives in **content** (YAML), so the world's texture can grow and change without re-engineering the simulation. The flavor is data; the engine is generic.

## The experience we're aiming for

You open Omnia and see a grid of moving icons. You click one: a panel reveals a person — their species, mood, job, who they love and hate, what they remember, their parents and children, whether they carry a rare spark of magic. You speed time up and watch them court, marry, struggle, prosper, scheme, fight, conquer, and die. You open the Legends view and read the town's history: who mattered, what they built, which arts were lost, how a culture split. It should give the unmistakable impression of a world that is alive and has a past.

## Aesthetic direction (deferred — do not build before the simulation is deep)

A **lo-fi, pastel** look — soft, muted color palette; calm, readable, unhurried. Eventually a **lo-fi ambient music** layer to match. This is *presentation*, the lowest priority: the interface stays minimal (icons + inspector) until the simulation has real depth. Captured here so the eventual UI work has direction; see the audio/aesthetic tasks in the final roadmap milestone.

## Touchstones

*The Sims* (needs and relationships), *Dwarf Fortress* (deep generational simulation and legends), *Cities: Skylines* (a world ticking on its own), Stanford's "Generative Agents" and Altera's "Project Sid" (believable LLM-driven social behavior), with an *Adventure Time* flavor coat.

## Non-goals (read this twice — these prevent rabbit holes)

We are explicitly **not** building, at least not now:

- **Not photorealistic or even pretty graphics.** Simple icons on a grid plus rich inspector panels. Pastel/lo-fi styling and music are *deferred* polish, not early work.
- **Not a massive-scale civilization.** Hundreds of agents, not millions. No aggregate off-screen population machinery. Changing scale is a deliberate future decision recorded in `DECISIONS.md`.
- **Not a multiplayer game or networked server.** Single-machine simulation.
- **Not an authored narrative.** No quests, no scripted plot, no win condition. Stories come from emergence.
- **Not a chatbot.** The LLM gives agents a "soul" (dialogue, reflection, occasional big decisions); it is never a user-facing assistant and never on the hot path.
- **Not a full generative grammar / linguistics engine.** Language evolution is deep but bounded (phonology, lexicon, light morphology) — full syntax evolution is out of scope (`CULTURE_AND_LANGUAGE.md`).
- **Not modder-scriptable behavior (yet).** Content is data; new *behaviors* are code. Player/modder scripting is a far-future maybe.

If a task seems to require crossing one of these lines, stop and flag it for the human rather than expanding scope.
