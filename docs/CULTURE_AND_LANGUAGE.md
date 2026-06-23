# CULTURE_AND_LANGUAGE.md — Evolving Cultures, Languages & Names

The goal: cultures and languages that genuinely **evolve** across generations — dialects diverging into language families, cultural values drifting and schisming — *as deep as possible without becoming untenable.* The tenability comes from **where the depth lives**: rich rules and processes, tiny stored state.

## Tenability strategy (read this first — it governs everything below)

1. **Few shared objects.** Languages and cultures are not per-agent; they are shared objects each agent merely *references*. A town has a handful (single digits to low dozens even across deep history). So the object count is tiny and bounded.
2. **Slow schedule.** Evolution (sound change, drift, schism) runs per *era/generation* — e.g. evaluated every N sim-years — never per tick. Cost is infrequent and predictable.
3. **Procedural, not LLM.** The mechanics are deterministic procedural rules (seeded). The LLM is *optional flavor only* (occasionally gloss a coined word or name a new value for the player), and its outputs are recorded into the event log so determinism holds.
4. **Generate on demand; don't store whole lexicons.** A language is mostly *rules + a small cache of important words*. Names, place-names, and remembered phrases are generated from the language's phonology + rules + seed when needed and cached if notable. Forgotten words regenerate identically from the seed.
5. **Compress the dead.** When a language or culture dies out, it collapses to a compact **descent record** (its place in the family tree + key features), like an agent's tombstone — not a full historical corpus.
6. **Light grammar deliberately.** We track a few typological features, not a full generative grammar. Full syntax evolution is a research project and is explicitly out of scope; this is the line that keeps "deep" from becoming "untenable."

## Language model

A language is defined by rules at three levels (seeded in YAML, then evolved at runtime):

- **Phonology** — the inventory of sounds (phonemes) the language uses.
- **Phonotactics** — the rules for combining sounds into syllables and words (e.g. allowed syllable shapes).
- **Lexicon** — a mapping from concepts to word-forms. Generated on demand from phonology + phonotactics; only notable words are cached. Light **morphology** (a few inflection/compounding patterns) sits here.

### How a language evolves

- **Sound change:** probabilistic rules shift phonemes over time (real historical linguistics works this way — e.g. one sound systematically becomes another across the whole language). Applied each era.
- **Lexical & semantic drift:** words are coined, fall out of use, and shift meaning over generations.
- **Divergence → families:** when a population splits (migration, schism), its language is copied and then accumulates *independent* sound changes and drift, growing into a distinct daughter language. Repeated, this yields a **language family tree** — a centerpiece for the Legends view.
- **Contact:** trade, conquest, and intermarriage cause **borrowing** (loanwords mark historical contact), occasional creoles, and language death.

## Culture model

A culture carries:

- **Value axes** — positions on a handful of dimensions (e.g. communal↔individual, pious↔secular, martial↔mercantile, traditional↔innovative, insular↔open).
- **Practices** — customs, taboos, naming conventions, preferred professions, religious beliefs, art/aesthetic leanings.

### How a culture evolves

- **Drift:** values shift slowly, and in response to events (a famine pushes toward thrift; a war toward militarism; a golden age toward openness).
- **Schism:** a faction whose values diverge enough breaks off into a daughter culture (often taking a diverging dialect with it — culture and language co-evolve).
- **Blend:** intermarriage, conquest, and trade produce syncretism — cultures merging practices and values.

(Cultural traits spread and mutate like memes; a culture's cohesion is essentially how strongly it resists drift.)

### How values steer behaviour (causal coupling — D26)

The four value axes are **causal**: they bias what agents actually *do*, deterministically (procedural, no LLM — so seed-replay holds). The coupling is introduced **small and soak-gated** (each axis gets a test + a soak check), and an axis only lands once it has a behavioural home — `martial` waits for conflict (M16).

| Axis | Pole (1.0) | How it biases behaviour | Hooks into | Status |
|---|---|---|---|---|
| **communal** | communal / sharing | Lowers the agent's personal **wealth goal** — communal folk prize modest wealth, individualists accumulate. *(Later: share food/gold with needy kin.)* | spawn / economy | **causal** (M7) |
| **open** | open to outsiders | Scales **friendship warmth toward other cultures**: same-culture pairs bond fully, cross-culture warmth is damped by how *insular* the pair is. *(Later: willingness to learn another tongue — M10 slice 4.)* | `SocialSystem.interact` | **causal** (M10) |
| **traditional** | clings to the old ways | **Endogamy** — traditional folk prefer to marry within their own culture; innovative folk intermarry freely. *(Later: inherit a parent's profession, slow to adopt new tech — M17.)* | `SocialSystem.matchmake` | **causal** (M10) |
| **martial** | martial / warlike | Conflict propensity — raid, defend territory, settle disputes by force; prefer warrior over merchant professions. | combat | **deferred to M16** (no behavioural home yet) |

*Distinct from `cohesion`:* `cohesion` is a **culture-level** knob (how fast the culture's *values* drift); `traditional` is an **agent-level** behaviour (folk preserving the old ways). Company (the social *need*) is met by anyone — `open` only governs whether that company warms into *friendship* across cultures, so insular folk still aren't lonely, they just stay socially segregated.

## Naming

Names are generated from a culture's language — phonology + phonotactics + the culture's naming conventions and morphology. Consequences that make the world feel alive:

- Names *sound right* for their culture, and a name can betray someone's origin.
- As languages drift, **names drift** — an old name reads as archaic; a region's names mark its history.
- Covers agents (personal + family names), places (settlements, landmarks), and organizations (companies, gangs, dynasties).

> **Phasing:** a *simple* per-species name generator ships early (Milestone 1, small curated sound pools) so agents have names from the start. It is *replaced* by this language-derived generator when the language system lands (Milestone 7).

## Authored vs. evolved vs. compressed

- **Authored (YAML):** seed languages (starting phoneme sets + rules) and seed cultures (starting values + practices). A small palette to begin from.
- **Evolved (runtime state):** everything that grows from the seeds — daughter languages, drifted lexicons, schismed cultures. Saved as state.
- **Compressed (history):** dead languages/cultures → descent-tree + key features. The Chronicle remembers the *story* (which culture split, which language died, who the loanwords came from).

## Example (seed language)

```yaml
# content/languages/old_vant.yaml
id: "old_vant"
name: "Old Vant"
phonemes:
  consonants: ["p", "t", "k", "v", "n", "r", "s", "l"]
  vowels: ["a", "i", "u", "e"]
syllableShapes: ["CV", "CVC", "VC"]   # C=consonant, V=vowel
namePatterns:
  personal: ["{syl}{syl}", "{syl}{syl}{syl}"]
  family: ["{syl}-{syl}"]
soundChangeRate: 0.15                  # per era; higher = faster drift
```

## Example (seed culture)

```yaml
# content/cultures/vant_kin.yaml
id: "vant_kin"
name: "Vant-kin"
language: "old_vant"
values: { communal: 0.7, martial: 0.4, traditional: 0.8, open: 0.3 }
practices: ["ancestor-veneration", "guild-apprenticeship"]
cohesion: 0.6                          # resistance to value drift
```
