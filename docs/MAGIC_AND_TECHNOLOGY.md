# MAGIC_AND_TECHNOLOGY.md — One System, Many Traditions

Magic and technology in Omnia are **not two subsystems** — they are two *traditions* expressed through a single underlying **Capability system**. Both are ways of producing effects in the world; they differ in flavor, in how they're learned, and in who can access them. This is simpler to build than two systems and richer in play (lost tech and emergent magic can be the same forces wearing different masks — a good fit for a post-apocalyptic world).

## The unified core

Every capability — a spell, a machine, a recipe, a ritual — has the same shape:

1. **Invoke** — an agent attempts to use the capability.
2. **Prerequisites** — what's required to attempt it: *knowledge/skill* (acquirable) and sometimes *innate aptitude* (rare, see below), plus tools/location where relevant.
3. **Cost** — what it consumes: materials, time, energy, or mana.
4. **Effect** — what happens, expressed as one or more **effect tags** (e.g. `heal`, `damage_fire`, `light`, `craft_item`, `transmute`). Code implements what each effect tag does; data only declares which tags a capability produces (the data/behavior boundary from `CONTENT_AND_DATA.md`).

Because the shape is shared, a single engine handles both a blacksmith forging a blade and a mage hurling fire.

## Traditions (defined as content)

A **tradition** layers flavor and access rules onto the core. The two main ones:

- **Technology** — *common and learnable.* Gated by acquirable knowledge/skill and materials, not by innate aptitude. Spreads through teaching, apprenticeship, and salvage. Most working professions touch it (smithing, building, machining, scavenging lost tech).
- **Magic** — *rare and gated.* Requires an **innate aptitude** most agents never have, on top of knowledge. Costs often involve mana/energy rather than raw materials. Magic users are a small minority, which makes magic feel scarce and significant — exactly the intent.

The system is **extensible**: more traditions (alchemy, bio-engineering, ritual) are just new content with their own access rules and costs. Nothing in the engine hard-codes "magic" or "technology."

## Aptitude & access (how magic stays rare)

- **Magic aptitude** is a rare innate trait rolled at agent creation, weighted by species, lineage, and culture (`magicAptitudeChance` per species in content; a global base rate in `config/simulation.yaml`). Most agents roll *no* aptitude and can never cast, no matter what they learn.
- **Technology** has no aptitude gate — anyone can learn it given knowledge and opportunity — so it spreads broadly across the population.

This single difference (aptitude-gated vs. knowledge-gated) is what makes one tradition rare and the other common, from the same machinery.

## Capability definitions

Capabilities are content files under `/content/capabilities`, each tagging its tradition, prerequisites, cost, and effect tags. Behavior for each effect tag is implemented once, in tested code.

```yaml
# content/capabilities/forge_blade.yaml   (technology — common)
id: "forge_blade"
tradition: "technology"
prerequisites:
  skills: ["smithing"]
  location: "forge"
cost:
  materials: [{ id: "ore", amount: 2 }]
  timeHours: 4
effects: ["craft_item:blade"]
```

```yaml
# content/capabilities/ember_bolt.yaml    (magic — rare)
id: "ember_bolt"
tradition: "magic"
prerequisites:
  aptitude: true            # only agents with innate magic aptitude
  skills: ["pyromancy"]
cost:
  mana: 15
effects: ["damage_fire"]
```

Both files feed the same `CapabilityRegistry` and the same invoke engine; only the access rules and costs differ.

## Professions

Professions reference capabilities. Craft/tech professions (smith, builder, scavenger) are common. **Magical professions** (healer-mage, pyromancer, warden) are rare by construction, because they require agents with aptitude — so a town might have one hedge-witch and no formal mage at all, which is as it should be.

## History & the post-apocalyptic hook

Capabilities tie into the Chronicle and the compression model:

- **Lost arts:** a capability whose last knowledgeable agent dies becomes *lost* — known to have existed, no longer practiced. A natural post-apoc texture (the ruins remember what the living forgot).
- **Rediscovery & secrets:** arts can be rediscovered, guarded by a guild, or hoarded by a lineage.
- The Chronicle remembers who pioneered an art, who lost it, and who brought it back — exactly the kind of legend the world should accrue.
