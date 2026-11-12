# Phase 10 — level consistency: the same job always gets the same level

v0.2.1 is tagged and installed (`8a77cdd`). This phase is the second accuracy precursor in `docs/v0.3-plan.md` § Context. Report 08 §4 found the same prompt landing on Level 1 in some runs and Level 2 in others ((b) 4/5 and 5/5, (c) 3/5 and 4/5). A job that lands on Level 1 when it needed Level 2 skips the PM, the intent, approval and re-verification. Accuracy is the priority, not cost: when a job is borderline, it goes **up**.

**Goal:** level choice is reproducible and explainable.
- **Same job, same level:** 10/10 runs of each test prompt land on one level.
- **Borderline goes up:** "unsure" counts as yes.
- **Hard triggers can't be argued down (D4).**
- **The audit shows why:** the level and the yes/no answers that produced it. Booleans only, never prompt or code text.
- **No needless escalation:** clearly Level 0–1 work stays there 10/10.

Nothing else: no memory, no templates, no feature work. If the fix starts turning into a redesign of `deliver` or the PM, stop and ask.

Work in four parts and **stop after each**:
1. Inspect: where the level is decided today, a measured baseline, and what each hook can see
2. Generate: the chosen design, tests, version bump
3. Validate: the repeat-run test, cost-gated
4. Release checklist: interactive, I run it

Read first:
- `docs/decisions.md` D1, D2, D4, D5, D6, D28, D31–D33
- `prompts/02-generate.md`: `escalate.mjs`, `session-start.mjs` and the rule card, `guard.mjs` (scope guard), `deliver` step 1, the PM binding
- `reports/08-memory-value-v0.3-2026-11-09.md` §2 (fixtures (b) and (c)) and §4 (the level split)
- `docs/v0.3-plan.md` § Context, precursor 2
- `reports/09-validate-v0.2.1-2026-11-11.md`, for how headless validation was run and costed

## Hard constraints

- **Mirror every plugin change in `prompts/02-generate.md`,** then confirm the code matches the spec. A change only in `plugin/` is a defect.
- Develop and test with `claude --plugin-dir ./plugin`. Don't install, update or uninstall the plugin.
- No commits, pushes, tags or marketplace changes. I commit. Repo files you may write: `prompts/02-generate.md`, `plugin/**`, `tests/**`, `docs/decisions.md`, `docs/release-checklist.md` (Part 4), `docs/v0.3-plan.md` (a status note on precursor 2 only), and the reports named below.
- Scratch repos and a scratch home only. Never touch real data under `~/.agent-org`.
- **Every live part shows a plan and a cost estimate first, then waits for my go-ahead. Hard cap per part: $10.** Stop at the cap and report what you have.
- Evidence over narration: every claim cites a run, a test or `file:line`.
- Tests live in `tests/` and run with `node tests/run.mjs`, alongside the v0.2.1 suite.

## Part 1 — Inspect

### 1a. Where the level is decided today (read-only)
List every place that influences the level, with `file:line`: the rule card, `escalate.mjs`'s nudge, `deliver` step 1, the PM binding (D5), and the scope guard (D1/D2). For each, say whether it is **enforced** by a hook or is **instruction only**. In particular: is Level 1's "Plan:" line before the first edit checked by any hook, or only asked for? (A grep finds no hook that checks it.)

### 1b. Baseline (cost-gated)
Build a prompt set in scratch repos. Use generic fixtures (rebuild report 08's (b) and (c) from its §2 descriptions if the originals are gone), each prompt given verbatim:
- **Controls, clear-cut:** one Level 0 (a question), two Level 1 (a one-file fix with tests), two Level 2 (a schema change; a new dependency plus code), one Level 3 (auth redesign). The expected level is fixed in advance, from D5.
- **Borderline:** report 08's (b) and (c) tasks, plus two more that sit on a D5 line (for example, a 3-file change in one module; a user-visible copy change in two files).
- Run each prompt **5 times** headless with the current plugin. Record per run: the level reached (Level 2 = `deliver` loaded; Level 1 = edits without `deliver`; Level 0 = no edits), turns, cost, and the files actually edited. Stop each run at the first approval question, so Level 2 runs don't implement.
- Report the split per prompt and whether the scope guard (D1/D2) fired on Level 1 runs that grew.

### 1c. What can see what (docs plus a probe)
The checklist can only be scored by something that can see it. For each candidate point, say what it receives and whether it can **block or ask**:
- `UserPromptSubmit`: prompt text only? Can the hook read the repo (`cwd`, `git ls-files`) within its 5 s budget?
- `PreToolUse` on the first `Edit`/`Write`/`NotebookEdit`: can it read the transcript and find a structured block in the latest assistant message (claim-check already reads transcripts; reuse `lib/transcript.mjs`)?
- The main thread itself, as instruction.

### 1d. Recommend a design
Evaluate at least these, against the goal above:
- **A. Checklist gate at the first edit.** Before its first file edit in a repo with no approved intent, the main thread writes a fixed `Level check:` block: the D5 Level 2 and Level 3 triggers as one-line yes / no / unsure answers. `guard.mjs` reads it on the first edit, a script maps the answers to a level (any Level 3 trigger yes or unsure → 3; any Level 2 → 2; else 1), and if the result is 2 or more without an approved intent, it **denies** with "load agent-org:deliver". No block → ask once, then deny. Record the level and answers in the audit.
- **B. Stronger prompt-only triggers** in `escalate.mjs`.
- **C. Only the existing edit-time floors** (D1 file count, D2 risky paths), tightened.
- Say which you recommend, what it costs per Level 1 job in turns, and what it can't catch (for example, a model that answers "no" to everything). Note where it overlaps D1/D2 and the rule card's ~190-word budget.
- **Report:** write `reports/10-inspect-level-<YYYY-MM-DD>.md`: 1a table, baseline table, 1c answers with doc URLs or probe evidence, the recommendation. **Stop.**

## Part 2 — Generate (after I pick the design)

- Implement the chosen design in `plugin/`, mirrored in `02-generate.md`.
- **The mapping is code, not prose:** a pure function (answers → level) with unit tests for every trigger, `unsure` as yes, the D4 floor, and malformed or missing blocks.
- **Audit:** a `level` event with the level, the source (`checklist`, `deliver`, `pm`, `floor`) and the yes/no/unsure answers as booleans. No text.
- **Decisions:** a new decision for deterministic level choice; notes on D4, D5 and D28 if they change.
- **Version:** bump `plugin.json` to `0.2.2`.
- **Checks:** `node tests/run.mjs` passes, `claude plugin validate ./plugin` passes, `sync-personas --check` reports 14 × OK.
- **Report:** `reports/02-generate-v0.2.2-<YYYY-MM-DD>.md`. **Stop.**

## Part 3 — Validate (cost-gated, ≤ $10)

- Rerun the Part 1 prompt set, **10 runs per prompt**, same stop rule.
- **Pass criteria:**
  - every prompt lands on one level in 10/10 runs;
  - every control lands on its expected level;
  - every borderline prompt lands on the **higher** of its two observed baseline levels;
  - the audit has one `level` event per job, with answers and no text;
  - a model that skips the block is asked once, then denied.
- **Regression:** `node tests/run.mjs`, plus the Phase 9 headless checks for V21-10 and the claim check.
- If a prompt still splits, report its answers per run: which question flipped. Don't tune the prompt set to make it pass.
- **Report:** `reports/10-validate-level-<YYYY-MM-DD>.md`: per-prompt level counts, before and after, cost, cleanup. **Stop.**

## Part 4 — Release checklist (I run it)

- Add a permanent step to `docs/release-checklist.md`: one borderline prompt run three times interactively lands on the same level, and the audit shows its `level` events.
- Print the interactive script the way Phase 9 did, wait for my notes, then write `reports/release-checklist-v0.2.2-<YYYY-MM-DD>.md` ending in **GO or NO-GO for tagging v0.2.2**.
- Add a status note to precursor 2 in `docs/v0.3-plan.md`.
- **Stop.** Tagging and the release are mine (`docs/release-checklist.md` § Release).

## Stop
After each part, print a summary of five bullets at most, and stop.
