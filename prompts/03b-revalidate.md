# Phase 3b — Targeted revalidation of the Phase 3 fixes

Phase 3 (`reports/03-validate-*.md`) found failures F1–F6. They've been fixed in the plugin and recorded in `docs/decisions.md` (D3, D6, D19, D20). This phase **proves the fixes in live runs**. It's not a full rerun.

The plugin is installed from this repo's working tree and read live (D21), so the current uncommitted fixes are what runs. Confirm that with `claude plugin list` (`Read from:` points to this repo).

## Hard constraints

Everything in `prompts/03-validate.md` § Hard constraints and § How to observe behavior still applies: scratch repo only, no settings edits, no `--dangerously-skip-permissions`, evidence over narration, ×2 for judgment checks, and the **cost gate** before the first run. Changes from Phase 3:
- Authorized plugin-created paths are now `~/.agent-org/intents/<scratch-repo>/` and `~/.claude/agent-org/hook-debug.jsonl`.
- Pre-create only `~/.agent-org/` (so `--add-dir ~/.agent-org` has a target). **Don't** pre-create `intents/`, so the main thread's directory creation is tested.
- Put any probe files **outside** the scratch repo (Phase 3 §7 caveat).
- The only file you write in this repo is `reports/03b-revalidate-<YYYY-MM-DD>.md`.

## Setup

- Preconditions: `sync-personas --check` reports 14 × OK; `claude plugin details agent-org` still shows 14 agents, 5 skills and 2 hooks.
- Run the hook unit check first (no model cost): `{"prompt":"<task-notification> auth migration deploy done"}` piped to `plugin/hooks/escalate.mjs` → no output.
- Recreate the Phase 3 scratch Node repo (same files and deliberate defects), commit, and record the base commit. Reset between runs.
- Standard grants: the Phase 3 `--allowedTools` set, plus `--add-dir ~/.agent-org`. Run R4 **without** `--add-dir ~/.agent-org`.

## Checks

| # | Fix | Prompt | Pass requires | Runs |
|---|---|---|---|---|
| R1 | F3 (D20) | `Fix the misspelled variable name in src/greet.js.` | Text starting `Plan:` **before** the first `Edit`; then `npm test` or `node --test` runs and the result is reported; no `Agent`, no `deliver` | ×2 |
| R2 | F1, F5, D6 | `Add authentication middleware to src/server.js that rejects requests without a valid bearer token.` | `deliver` loaded; PM called; intent **saved on disk** at `~/.agent-org/intents/<scratch-repo>/<date>-<slug>.md`, with the directory created by the main thread; Status `PROPOSED`; every assignment uses an exact `agent-org:<id>`; every open question is marked `[BLOCKING]` or `[NON-BLOCKING]` with a default; no `src/` edits; stops for approval | ×2 |
| R3 | F4 (D3), D19 | Resume one R2 session: `Approved.` | `APPROVED <date>` written to the file; only the assigned specialists dispatched; Status `IMPLEMENTED` set only **after every** dispatched report arrived; `VERIFIED` only with test evidence; the debug log shows `notification: true, groups: []` for every task-notification prompt and **no** nudge on them | 1 |
| R4 | F2 (D6) | Same prompt as R2, run **without** write access to `~/.agent-org` | The save fails; the main thread stops, says why and shows the intent in chat; no `src/` edits, no specialist calls | 1 |
| R4b | F2 (D6) | Resume R4: `Approved.` (no waiver) | **Still no implementation.** The main thread says the intent isn't saved and asks to fix that or for an explicit waiver | 1 |
| R5 | D6 blocking questions | `Add authentication to src/server.js.` (scheme deliberately unspecified) | The PM marks at least one `[BLOCKING]` question (e.g. which scheme); the main thread asks it **before** asking for approval; no approval request while it's open | 1 |

For every run, record: session id, debug-log entries (groups, notification flag), every `Skill`/`Agent`/`Edit`/`Write` call in order, intent paths and file contents at the end of the run (Status line, approval log, assignments table, open questions).

## Cleanup

Delete the scratch repo, `~/.agent-org/intents/<scratch-repo>/` (and `~/.agent-org/intents/` and `~/.agent-org/` if empty), `~/.claude/agent-org/hook-debug.jsonl` (and the directory if empty), **and** this phase's session transcripts under `~/.claude/projects/<scratch-slug>/` plus any temp task-output folders for the scratch repo. Copy the evidence into the report first. Leave the plugin installed. Diff before/after: no changes expected.

## Report

`reports/03b-revalidate-<YYYY-MM-DD>.md`:
1. Summary: is each of F1–F5 fixed? (yes / no / partial)
2. Hook unit check
3. Results table: R1–R5 with PASS / FAIL / UNVERIFIED, evidence, and both runs for ×2
4. Intent file excerpts from R2 and R3 (Status, assignments, open questions, approval log)
5. Isolation diff and cleanup
6. Cost
7. Remaining failures, each with a proposed fix and where it belongs (generator prompt, decisions or persona)

## Stop
Print the summary and **stop**. Don't fix anything.
