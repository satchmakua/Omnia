# CONTENT_AND_DATA.md — Data-Driven Content

Omnia's flavor lives in **content** — races, creatures, biomes, flora, fauna, buildings, professions, capabilities, cultures — defined as data files, not code. This is how moddable simulations stay extensible (RimWorld uses XML, Dwarf Fortress uses "raws," Cataclysm uses JSON). The content tree is both the **mod surface** and the **worldbuilding surface**: drop in a file, get new texture, no system revamp.

This doctrine answers "how do we keep it configurable without rewriting the engine."

## The three rules (these matter more than the file format)

### Rule 1 — Validate every file at load time; fail loud, early, helpful
The number-one failure of a large hand-authored data layer is a typo silently breaking the sim hours into a run. So: **each content type has a schema, and on startup every file is validated against it.** A bad file aborts startup with a precise message — `creatures/dragon.yaml: unknown field "siez" (did you mean "size"?); required field "diet" missing`. Never let malformed content reach the simulation.

In TypeScript, define the schema with a runtime validator (Zod-style) and **derive the TypeScript type from the schema** — one source of truth for both the shape and the check. Code that consumes content is then fully typed *and* the data is guaranteed valid.

### Rule 2 — Data declares; code implements (the boundary)
Data says **what exists and its properties**, including **capability tags** (e.g. `abilities: [flight, firebreath]`, `tags: [undead, nocturnal]`). Code implements **what those tags/capabilities do**. Do not smuggle logic into YAML — that way lies a half-baked scripting language living in your data files. Tags in data, behavior in tested code. (Truly modder-scriptable behaviors are a far-future add, recorded as a non-goal for now.)

### Rule 3 — Evolving things are runtime state, not authored content
YAML defines **starting palettes and rules**. Anything that *evolves* — cultures, languages, the town's history — is generated and mutated by the simulation at runtime and saved as state. You author the seeds and the rules; the sim authors the results. (See `CULTURE_AND_LANGUAGE.md`.)

## Format

**YAML** for authored content — it reads well by hand and supports comments. One footgun to respect: YAML coerces types loosely (`no`, `yes`, `on` become booleans; unquoted numbers become numbers), so **quote strings** in content files. JSON5 is the alternative if the footguns ever bite. The format is the *small* decision; Rule 1 is what actually protects modularity.

## Content tree

Authored content lives at the repo's top-level `/content`, one folder per type, one entry per file (or grouped files):

```
/content
  /species        # sapient folk: human, dwarf, orc, giant, ...
  /creatures      # monstrous/large: dragon, ...
  /fauna          # animals (light agents)
  /flora          # plants, trees
  /biomes         # terrain + climate + spawn tables
  /resources      # timber, ore, water, food, ...
  /buildings      # structures
  /professions    # jobs/roles
  /capabilities   # spells, devices, recipes, rituals (see MAGIC_AND_TECHNOLOGY.md)
  /cultures       # seed cultures (starting values + practices)
  /languages      # seed languages (phoneme sets + rules)
```

## Loading pipeline

On startup: discover files → parse → **validate against schema** (abort on failure) → build typed **registries** (e.g. `SpeciesRegistry`, `BiomeRegistry`, `CapabilityRegistry`). Systems read registries; they never read files directly. Registries are immutable after load.

## Archetypes (how content becomes entities)

A species/creature/etc. is a **data archetype**: it fills the same ECS components every agent has, with different defaults/ranges, plus a few type-specific tags. On spawn, an entity is instantiated from its archetype (fixed values plus rolled-from-ranges values). A dragon and a baker are both agents — they just carry different component values and tags. **No new ECS architecture is needed to add a race or creature.**

## Adding content (the workflow you wanted)

1. Copy an existing file in the right `/content` folder, edit the fields.
2. Run the sim — validation tells you immediately if anything's wrong.
3. The new content appears in-world. If it needs a *new behavior* (a new effect tag), that's a small code change in the relevant system, gated and tested.

## Example (species)

```yaml
# content/species/dwarf.yaml
id: "dwarf"
name: "Dwarf"
lifespanYears: { min: 180, max: 260 }
size: "small"
tags: ["sapient", "subterranean"]
needs:                      # multipliers on the base need-decay rates
  hunger: 0.9
  social: 1.2
traits:                     # bias ranges for rolled personality
  industrious: { min: 0.4, max: 0.9 }
magicAptitudeChance: 0.02   # rarer than average (see MAGIC_AND_TECHNOLOGY.md)
preferredProfessions: ["smith", "miner", "brewer"]
```

A matching Zod-style schema validates every field above and produces the `Species` type the code uses.
