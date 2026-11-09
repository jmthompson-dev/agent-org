# Phase 8 — Memory value test for v0.3 (before building anything)

v0.3's memory module (`docs/v0.3-plan.md`, `reports/07-inspect-v0.3-2026-11-09.md`) is feasible, but nobody has shown it helps. Claude Code's own auto memory is already on in this account and does most of the same job (a per-repo index plus notes, loaded every session; report 07 H2). This phase answers two questions cheaply, with hand-written lessons and no memory code:

1. **Does a correct lesson help at all?** If a hand-written, correct lesson placed in context doesn't measurably improve the benefit tasks, no filing machinery can make it help. v0.3 stops here.
2. **Does auto memory already get the same gain on its own?** If auto memory learns the lesson from the seeding task and the benefit task improves as much, agent-org memory adds review gating and screening but no performance. That's a much smaller v0.3, or none.

Read first: `docs/v0.3-plan.md`, report 07 (§2 G, H2; §4 item 12), `docs/decisions.md`, and `reports/06*` for how earlier live runs were set up and costed.

## Hard constraints

- The only repo file you write is `reports/08-memory-value-v0.3-<YYYY-MM-DD>.md`. No plugin, generator or plan changes.
- All runs happen in a scratch directory outside every real repo. **Every run uses a fresh copy of its fixture at a unique path**, so auto memory (keyed by repo) never carries over between runs, except where an arm says the seeding and benefit sessions share one path.
- Never write to `~/.agent-org/memory/`, `~/.claude/settings.json` or any real repo's auto memory. Load probe hooks only through `--settings <file>` or `--plugin-dir <dir>` in the scratch directory. Never use `--dangerously-skip-permissions`.
- The installed agent-org 0.2.0 plugin stays active in every arm, so it's the same for all. Set `AGENT_ORG_HOME` if supported, otherwise list every file v0.2 hooks write under `~/.agent-org/` during the runs and remove only those afterwards (as report 07 §7 did).
- **Cost gate:** before the first run, list the fixtures, arms, run counts and a cost estimate per stage, and wait for my go-ahead. Pass `--max-budget-usd` on every run. Stop and ask if a stage's actual cost passes its estimate by 50%.
- Evidence over narration: every number in the report comes from a run's final `result` object or a test command's exit status.

## Fixtures

Build the three fixtures from report 07 §4 item 12, each a small git repo with a real test suite. Write a **lesson** for each: one short paragraph, correct, in the M6 note format (header plus body), with `evidence` pointing at a real `file:line` in the fixture.

- **(a) Test-runner quirk:** tests pass only with `TZ=UTC`. Seed task: fix one date bug. Benefit task: fix a second, different date bug.
- **(b) Project convention:** errors must be thrown as `AppError` from `src/errors.js`, enforced by a test. Seed task: add one endpoint. Benefit task: add a different endpoint.
- **(c) Generated file:** `src/gen/schema.js` is produced by `npm run gen`, and direct edits are overwritten by a check. Seed task: change the schema. Benefit task: a second schema change.

Before any timed run, confirm each fixture behaves as designed: the trap actually catches a naive attempt, and the lesson actually avoids it. Show the commands and exit codes.

Task prompts are one line each, written the way I'd write them, with **no hint** of the lesson. Use the same prompt text in every arm.

## Arms

Run each benefit task with Sonnet as the main model, letting agent-org choose the level as it normally would.

- **None:** `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, no lesson. The baseline.
- **Seeded:** `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, plus the hand-written lesson delivered the way M8 would deliver it: a probe `SessionStart` hook injects a one-line index entry as `additionalContext`, pointing at the note file, which sits outside the fixture repo. This is the best case for agent-org memory.
- **Auto:** auto memory on (not disabled), no hand-written lesson. Run the seed task first, then the benefit task **at the same fixture path**, in a new session. Record what auto memory wrote after the seed session (path and content), and whether it captured the lesson.

## Stages

- **Stage 1: None vs Seeded.** 3 fixtures × 5 runs × 2 arms, benefit task only.
- **Stop after Stage 1** and report. Continue to Stage 2 only if Seeded beats None by more than run-to-run noise on at least two of three fixtures, on the pass rate or the median turns. If it doesn't, the recommendation is to drop memory from v0.3, and you say so plainly.
- **Stage 2: Auto.** 3 fixtures × 5 runs, seed then benefit. Runs only after I say go.

## Measures, per run

- **Outcome:** pass or fail, from the fixture's own test command run by you after the session, not the model's claim.
- **Trap hit:** did the run fall into the fixture's trap at any point (ran tests without `TZ=UTC`, threw a plain `Error`, edited the generated file)? Take it from the transcript's tool calls.
- **Cost and turns:** `total_cost_usd` and `num_turns` from the final `result` object.
- **Agents used:** the number of dispatches, from the transcript.

## Report

Write `reports/08-memory-value-v0.3-<YYYY-MM-DD>.md`:

1. **Verdict (three lines max):** does a correct lesson help, and (after Stage 2) does auto memory already get the gain?
2. **Fixture checks:** trap and lesson confirmed, with commands and exit codes.
3. **Results per fixture and arm:** pass rate, trap-hit rate, median and range of turns and cost.
4. **Noise:** the spread within each arm, and why a difference counts or doesn't.
5. **Auto memory (Stage 2):** what it wrote after each seed run, and whether that matched the lesson.
6. **Recommendation:** build v0.3 as planned, build a smaller version (say what to cut), or drop memory. Tie each part to a number above.
7. **Cost:** actual vs estimate, per stage.
8. **Cleanup and isolation confirmation:** scratch fixtures, `~/.claude/projects/<scratch slugs>/` (including auto memory folders), v0.2 state files, and confirmation that `~/.agent-org/memory/` was never created.

## Stop

Print the verdict and **stop** after each stage. Don't change the plugin, the generator or the plan.
