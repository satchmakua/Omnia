# FINDINGS.md — Science & Instrumentation results (M7.7, D29)

What the instrumentation has actually *measured* about the simulated world. The point
of the science track (D29): turn "it didn't crash" (verification) into "it reproduces a
known pattern" (validation). Everything here is deterministic — reproducible from the
listed command + seed. Measurement is a pure read of durable state (D31), so observing
never perturbs a run.

Tools: `npm run soak` (one long run + a measured "Science" block, `src/analysis/metrics.ts`)
and `npm run sweep` (parameter sweeps that locate phase transitions, `src/analysis/sweep.ts`).

---

## Finding 1 — Surnames are Zipfian; given names are flat *(emergent regularity)*

Measured from `npm run soak` (seed 8, 40k ticks), final state:

| name kind | Zipf exponent s | r² | vocab | top share |
|-----------|-----------------|-----|-------|-----------|
| **surnames** | **≈ 1.15** | ≈ 0.86 | 20 | 17% |
| given names | ≈ 0.00 | — | 75 | — |

Surname frequency follows Zipf's law (freq ∝ rank⁻ˢ with s ≈ 1, the natural-language
value) with a good log-log fit. Given names, generated per-entity-id with no inheritance,
stay essentially uniform (flat rank-frequency, s ≈ 0).

**Why it's a real finding, not a plant:** nothing in the code aims for a Zipf
distribution. It *emerges* from the mechanism — surnames are inherited patrilineally, so a
lineage that out-reproduces others multiplies its surname, concentrating frequency into a
power-law tail. The given-name control (same generator, no inheritance → no concentration)
isolates inheritance as the cause. This is the kind of statistical regularity the milestone
DoD asks for.

Reproduce: `npm run soak` → the "Science — emergent structure" block (`names:` line).

---

## Finding 2 — A food-scarcity survival phase transition *(located tipping point)*

Measured from `npm run sweep` (seeds 1, 2, 8; 4000 ticks each). Sweeping **`floraDensity`**
(starting flora per passable tile — the food supply), survival is an order parameter:

```
floraDensity   survival   mean final population
      0.0          0%            0.0      ┐
    0.0075         0%            0.0      │  collapse phase (food can't sustain the town)
     0.01          0%            0.0      ┘
     0.02         67%            1.3      ← critical region (seed-dependent: finite-size effect)
     0.04        100%           23.7      ┐
     0.06        100%           32.3      ┘  survival phase → carrying capacity
```

**Located transition: `floraDensity ≈ 0.0175`** — below it the town starves to extinction;
above it the population grows to its carrying-capacity equilibrium. The mean surviving
population behaves like an order parameter, rising from 0 only above the critical density.
The crossing is bracketed and linearly interpolated from the survival-rate = 0.5 level.

A complementary sweep of **`hungerDecayPerDay`** (food *demand*) shows the dual: carrying
capacity erodes smoothly (final pop 32 → 22 → 7 → 3 …) and then survival collapses past a
critical decay rate (≈ 11/day). Near both boundaries different seeds disagree (e.g. 67% at
one step) — expected finite-size fluctuation in a town of dozens, not noise in the method.

Reproduce: `npm run sweep`.

---

## Still open (milestone DoD)

The M7.7 DoD wants the documented analysis to be **reproducible from an exported manifest**
(seed + config). Manifests / run export + diff are the next bullet; once they land, each
finding above gets a one-file manifest that regenerates it exactly. Surfacing key metrics in
the in-app Legends/charts views is the final bullet.
