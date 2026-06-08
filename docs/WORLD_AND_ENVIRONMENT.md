# WORLD_AND_ENVIRONMENT.md — The World Agents Live In

The town sits in a world of biomes, plants, animals, and resources. This world is mostly **content** (see `CONTENT_AND_DATA.md`); the systems that run it are generic, so the weird post-apocalyptic/psychedelic flavor is all data.

## Entity & brain tiers

Not everything alive needs a full mind. Tiering by *what a thing is* keeps the simulation believable and cheap:

- **Sapient folk** (humans, dwarves, orcs, giants...) — the full agent brain: utility scoring + goal planning + the **rare LLM "soul"** (dialogue, reflection, big decisions). These are the agents the project is really about.
- **Fauna** (animals) — **instinct-only AI**: a small utility brain (hunger, flee, breed, migrate) and simple behaviors (graze, hunt, herd). **No LLM, ever.** Cheap enough to have many.
- **Flora & resources** — **no brain**: environment entities with state that changes by rule (grow, spread, ripen, get harvested, deplete, regrow).

This tiering is an inviolable performance lever: the expensive layer (LLM) touches only a minority of sapient agents, occasionally.

## Biomes

A biome is a content definition: climate, terrain type, and **spawn tables** for which flora, fauna, and resources occur there and how densely. The post-apoc/psychedelic flavor (irradiated wastes, fungal forests, crystal flats, drowned ruins) is expressed purely as biome + flora/fauna content — the growth/harvest/depletion systems don't care.

## Terrain & the grid

The world is a grid (size in `config/simulation.yaml`). Tiles carry a biome, terrain (passable/blocked, water/land), and any resource nodes or flora rooted there. Terrain affects movement and what can be built or grown.

## Flora

Plants and trees are environment entities that **grow** over time, may **spread**, and are **harvestable** — a tree yields timber; a crop yields food. Harvesting depletes; growth replenishes. Flora connects the environment to both the economy (raw materials) and needs (food).

## Fauna

Animals are light agents with instincts: graze/hunt, flee predators, breed, sometimes migrate. They form the food chain (predator/prey), can be **hunted** by sapient agents for food/materials, and can be domesticated later. Their populations rise and fall and should be watched in the world-health metrics (an overhunted species can crash).

## Resources

Resources (timber, ore, water, food, and weirder post-apoc finds like salvage or reactive crystals) are either **renewable** (regrow/refill on a schedule) or **finite** (deplete permanently). They are extracted by agents, feed production and construction, and are a core driver of where agents settle, work, and fight. Depletion and regrowth rates live in content/config.

## World generation

At world creation (seeded, deterministic): lay out terrain and biomes, place flora/fauna/resource nodes from biome spawn tables, seed the starting population (from species content, with starting cultures/languages — see `CULTURE_AND_LANGUAGE.md`), and **invent the post-apocalyptic backstory** (what fell, how long ago, what ruins and lost arts remain) as the first entries of the Chronicle. Unless a fixed premise is later authored, each town gets its own invented history.

## How the environment feeds the rest

- **Economy:** resources → production and construction (timber → buildings, ore → tools, food → sustenance). Scarcity drives prices and conflict.
- **Needs:** food (flora, fauna, farming) satisfies hunger; materials enable shelter (energy/safety needs).
- **History:** a famine, a resource boom, a beast that terrorizes a district — environmental events become notable Chronicle entries.

## Example (biome)

```yaml
# content/biomes/fungal_forest.yaml
id: "fungal_forest"
name: "Fungal Forest"
climate: "humid"
terrain: "forest"
flora:                          # weighted spawn table
  - { id: "glowcap_tree", weight: 5 }
  - { id: "spore_fern", weight: 3 }
fauna:
  - { id: "moth_grazer", weight: 4 }
  - { id: "stalker", weight: 1 }   # predator
resources:
  - { id: "timber", renewable: true }
  - { id: "spore_silk", renewable: true }
```
