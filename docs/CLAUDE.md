# CLAUDE.md — Operating Manual for the Building Agent

You are the agent building **Omnia**. This file tells you how to work so that when the human says "keep going," "continue," "build more," or "refine," you do the right thing on your own and **do not fall into a hole.** Read this fully before acting.

If you ever feel unsure what to do, the answer is almost always: *run the tests, read `docs/PROGRESS.md`, and do the next unchecked item in `docs/ROADMAP.md`.*

---

## The Continue Loop

This is the exact procedure for an open-ended instruction ("keep going", "continue", "build more", "refine", or no specific task):

1. **Orient.** Read the top entry of `docs/PROGRESS.md`, the current milestone in `docs/ROADMAP.md`, and skim `docs/DECISIONS.md`.
2. **Establish a green baseline.** Run the full test suite. If it is **red**, fixing it *is* this session's task — stop the loop here and fix it. Never build on a broken build.
3. **Pick exactly one item.** Take the human's explicit request if given; otherwise take the next unchecked task in the current milestone. Do not skip ahead to later milestones.
4. **Implement in small steps**, following `docs/ARCHITECTURE.md` conventions. Add new behavior as new ECS Components/Systems; avoid touching unrelated systems.
5. **Test in the same change.** Every new system gets unit tests; behavior-level changes get or update an invariant test. Write the test, see it fail, make it pass.
6. **Soak it.** Run the headless soak (long simulated run) and confirm the world-health checks still hold (population doesn't explode or collapse, no impossible states).
7. **Leave it green.** The build must pass at the end of every session. No exceptions.
8. **Record.** Append a new entry to the **top** of `docs/PROGRESS.md` (what you did, what's next, any blockers). Log any non-obvious choice in `docs/DECISIONS.md`. If you thought of a feature, add it to `docs/ROADMAP.md` — do not build it now.
9. **Commit.** One coherent commit, conventional message (e.g. `feat(economy): add wages and wallets`). Open/close the relevant GitHub Issue.
10. **Report briefly** to the human: 2–4 sentences — what changed, what's next. Then stop.

---

## Definition of Done (every change)

A change is **not done** until all of these are true:

- [ ] Tests written and passing for the new/changed behavior.
- [ ] Full suite green; headless soak passes.
- [ ] No new impossible states introduced (see Invariants).
- [ ] `docs/PROGRESS.md` updated; any decision recorded in `docs/DECISIONS.md`.
- [ ] Any deferred idea written into `docs/ROADMAP.md` rather than left as a loose TODO.
- [ ] Committed with a clear message.

---

## Guardrails — how not to fall into a hole

These exist because the human wants to be hands-off. Follow them strictly.

- **One item per session.** Do a single roadmap item (unless it's trivially small). Resist sprawl. Finishing one thing cleanly beats half-finishing three.
- **No unrequested features.** If a good idea appears, append it to `docs/ROADMAP.md` and move on. Building things nobody asked for is the most common way this project rots.
- **No speculative refactors.** Don't restructure working code unless a task genuinely needs it — and if you do, record the reason in `docs/DECISIONS.md` first.
- **Don't relitigate decisions.** `docs/DECISIONS.md` is settled. If you believe one is wrong, write the concern into `docs/PROGRESS.md` for the human; do **not** silently reverse it.
- **Two-strike rule on blockers.** If you're blocked or genuinely ambiguous after two honest attempts, **stop.** Write the question into `docs/PROGRESS.md` for the human instead of thrashing. Wasting a session stuck is worse than ending it early with a clear question.
- **Simplest thing that passes.** Prefer the simplest implementation that satisfies the tests. Optimize only against the performance budget in `docs/ARCHITECTURE.md`, never speculatively.
- **Timebox scope creep.** If a task balloons past its milestone's intent, split it: do the core now, add the rest to the roadmap, and note the split.
- **Stay honest in PROGRESS.** Record what actually happened, including dead ends. The next session (possibly a fresh instance with no memory of this one) depends on it.

---

## Inviolable Invariants

Never break these, regardless of the task:

1. **Determinism.** All randomness flows through the single seeded RNG. A given seed replays identically. LLM responses are recorded into the event log so deterministic replay uses recorded outputs.
2. **Sim/render separation.** The simulation never imports or depends on the renderer. The renderer only reads simulation state.
3. **Headless-runnable.** The full simulation must run with no graphics (for tests and fast-forward).
4. **Never block the tick on the LLM.** LLM calls are async, rare, throttled, and off the hot path. A slow or failed model call must never stall the simulation.
5. **Green CI.** Main is always green.

---

## Commands

> Fill these in during Milestone 0, then keep them accurate.

```
install:  npm install
run:      npm run dev      # browser renderer at http://localhost:5173 (Space = pause)
test:     npm test         # full unit + seed + soak suite (vitest)
soak:     npm run soak     # 10,000-tick headless run with world-health metrics
lint:     npm run lint     # TypeScript type-check (tsc --noEmit)
```

## When to ask the human vs. proceed

- **Proceed** on anything on the roadmap or clearly implied by it.
- **Ask** (via a `docs/PROGRESS.md` note) for: scope changes, reversing a decision, or genuine ambiguity that survives the two-strike rule.
