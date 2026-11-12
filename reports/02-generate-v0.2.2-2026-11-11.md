# Phase 10, Part 2: Generate v0.2.2, the level check (2026-11-11)

Claude Code 2.1.322, macOS, Node 24.18.0. Plugin `./plugin` 0.2.1 → **0.2.2**, uncommitted on `development` (base `065c147`). This part made no model calls. The only live evidence is an offline replay of four Part 1 transcripts through the claim check.

## 1. Summary

- **Design A′ is built.**
  - **The check:** before each request's first file edit, the main thread answers 15 D5 trigger questions in one Bash call (`record.mjs --level-check "files=n …"`). A pure function, `plugin/hooks/lib/level.mjs` `levelFromAnswers`, maps the answers to a level.
  - **What the guard does:** it records the level for the payload's `prompt_id`, audits a `level` event with boolean answers only, and lets that one command run without a prompt.
  - **The gate:** a main-thread edit inside the cwd's repo is denied when the request has no check, when the check maps to Level 2+, at the request's 3rd file, or on a risky path. The last two raise the request to Level 2.
- **Your Part 1 decisions are all in.**
  - **Exemptions:** paths outside the repo are exempt, including `~/.agent-org/intents/`.
  - **Denies:** they're immediate and fail open.
  - **Decisions file:** a new **D34** amends D28 for the main thread.
  - **Counting:** files are counted per request, over 2.
  - **D5:** "user-visible behavior change" now means what the user can do or what the system returns, and copy-only changes are Level 1, in D5, the checklist question, the rule card, `deliver` and the README.
  - **The citation fix:** `path:line` seen in Grep or Read output counts as opened.
- **Checks:**
  - `node tests/run.mjs`: v021 111/111, **v022 125/125**, 6c replay 7/7.
  - `claude plugin validate ./plugin` passes.
  - `sync-personas --check` reports 14 × OK.
  - **Replay of the real C0 transcripts:** 4/4 blocked with the v0.2.1 code, **0/4** with v0.2.2.
- **One security fix during testing.**
  - **The problem:** `commandSegments` strips env prefixes, so `FOO=1 node …` and `NODE_OPTIONS=--require=… node …` would have matched the allowed shape.
  - **The fix:** the raw first word must now be `node` itself. Three rows test it.
- **Two things to look at:**
  - **The `allow`:** the level-check `allow` is the guard's first `allow` (D12 note). I added it so a Level 1 job doesn't raise a permission prompt each time. You didn't decide this explicitly.
  - **Word budget:** the rule card is **194 words** against the ~190 budget; the 15-key template takes 15 of them.

## 2. What changed

| File | Change |
|---|---|
| `plugin/hooks/lib/level.mjs` (new, 3.9 KB) | The 15 questions (9 Level 2, 6 Level 3, in D5 order), `TEMPLATE`, `parseAnswers` (every key exactly once; `y`/`n`/`?` and aliases), `levelFromAnswers` (unsure = yes; any L3 → 3, else any L2 → 2, else 1; malformed → null), `answerFlags` (booleans), `raise` (D4), `RISKY_KEY`, `questionList` |
| `plugin/hooks/guard.mjs` | **Rule 10:** `levelCheckCall` recognizes the exact command, records `levels[prompt_id]` (never lower), audits `level` and returns `allow`. **Rule 11, the level gate:** inside the scope-growth rule, after the approval check, for a cwd-repo file with a `prompt_id`. The deny reasons give the command and the questions. Floor raises are audited `level`/`floor`. A no-decision result may now carry state effects (`reqfile`), and `main()` applies them without printing |
| `plugin/hooks/lib/state.mjs` | `levels` and `reqFiles` in the state schema |
| `plugin/hooks/lib/audit.mjs` | `level` added to `EVENTS` |
| `plugin/hooks/record.mjs` | CLI `--level-check` prints the mapped level (or the questions); it writes nothing |
| `plugin/hooks/lib/transcript.mjs` | `filesSeenInOutput`: a single-file Grep whose output shows numbered lines makes its `path` seen; `path:line` pairs in Read output count |
| `plugin/hooks/rule-card.md`, `session-start.mjs` | D5 wording tightened; the "Plan:" rule replaced by the level-check command; `{{AGENT_ORG_ROOT}}` filled in at output time |
| `plugin/hooks/escalate.mjs` | The nudge points at the level check ("unsure counts as yes") instead of "if clearly Level 0–1, proceed normally" |
| `plugin/skills/deliver/SKILL.md` | Level table (2 files, copy-only, the behavior definition, unsure = yes). Step 1 uses the check (`--source deliver` if missing). Step 2 sends the check to the PM, and a PM raise is re-checked with `--source pm` |
| `plugin/agents/principal-project-manager.md` | Levels line: "triggers and the main thread's level check set the floor; unsure counts as yes" |
| `plugin/README.md` | Levels table, level check, scope guard (gate, exemptions, D28 for other repos), citation line, the guard's one `allow` |
| `plugin/.claude-plugin/plugin.json` | `0.2.2` |
| `docs/decisions.md` | **D34** (new). D5 table and a v0.2.2 note. Notes under D4, D12, D20 (superseded for "Plan:"), D25 and D28 |
| `prompts/02-generate.md` | Mirrors all of the above: header, §1, §3 PM, §4 `deliver`, §5 escalate, rule card, guard rules 10–11, §5b `level.mjs`, state and audit, §5c CLI, §5d citation, §7 README, §8 decisions, verification items 3, 4 and 20 |
| `tests/v022.test.mjs` (new), `tests/run.mjs` | 125 rows; added to the runner |

Diff: 15 tracked files, +368 −50, plus 3 new files: `level.mjs`, `v022.test.mjs` and the Part 1 report.

## 3. How the gate behaves

| Request state (main thread, cwd's repo, has `prompt_id`, no approval) | Edit → |
|---|---|
| No level check | **deny** `level-check-missing` (reason has the exact command and questions); audit `guard-deny` |
| Check → Level 2 or 3 | **deny** `level-gate` ("Level N (level check: <keys>). Load agent-org:deliver…") |
| Level 1, file 1 or 2, or a file already edited in this request | no decision (the file is counted) |
| Level 1, a 3rd distinct file | **deny** `level-floor-files`; request → Level 2; audit `level` `{source: floor, floor: [files]}` |
| Level 1, risky path (migration, CI, infra, auth) | **deny** `level-floor-path`; request → Level 2; audit `level` floor |
| A later check with lower answers | `allow` (the command prints its own mapping), but the stored level stays; no event |

Not gated:
- the scratchpad and `~/.agent-org/` (intents);
- files outside the cwd's repo, which keep the D28 session `ask` for other repos;
- payloads without `prompt_id` (D28 as before);
- specialists;
- any error or unreadable state (fail open).

## 4. Verification

| Check | Result | Evidence |
|---|---|---|
| `node tests/run.mjs` | **PASS** | v021 111 passed, 0 failed; v022 125 passed, 0 failed; replay-6c 7 passed (reconstruction; the real 6c evidence from Phase 9 isn't on this machine any more, so `--evidence` was **NOT RUN**) |
| Mapping unit rows | **PASS** | each trigger alone as `y` and as `?` (30 rows), all `n`, L2 + L3, aliases, case, 8 malformed shapes, unfilled template → 3, non-string or over-long, D4 `raise`, booleans-only flags |
| `levelCheckCall` | **PASS** | accepts the exact command with or without `--source deliver|pm`; **rejects 16 shapes** (`;`, `&&`, pipe, redirect, `$(…)`, backticks, newline, another `record.mjs`, malformed answers, bad source, extra argument, `python`, `--intent-path`, `FOO=1`, `NODE_OPTIONS=…`, `env node`) |
| Guard end to end (spawned hook, throwaway `HOME`) | **PASS** | 37 rows: every row of §3; per-request counts; `--source pm` 2 → 3 with events `2/checklist,3/pm`; migration and auth floors; three exemptions; the D28 ask in another repo at file 4; no `prompt_id`; specialists; outside git; approval; corrupt state and a bad payload fail open; one checklist `level` event per job |
| Audit has no text | **PASS** | `level` events carry only `level`, `source`, `prompt`, booleans and fixed keys; no `--level-check` or `record.mjs` string |
| Instruction text | **PASS** | rule card: root substituted, the command equals the guard's shape, 194 words (≤ 195), no "Plan:"; escalate nudge; `deliver` steps 1 and 2 and its table; PM binding; version |
| Phase 10 C0, unit | **PASS** | the C0-1 shape doesn't block. Four controls still block: an unopened file, a failed Grep, a `files_with_matches` Grep, and a bare path in Read output |
| Phase 10 C0, **real transcripts** | **PASS** | the four blocked C0 sessions from Part 1 (`2a875c0f`, `60f8a5bc`, `8ff5063b`, `4d348e2b`), cut before the blocked answer and run through `claim-check.mjs`: v0.2.1 code (`git archive HEAD`) blocks **4/4**; v0.2.2 blocks **0/4** |
| `claude plugin validate ./plugin` | **PASS** | "✔ Validation passed" |
| `node scripts/sync-personas.mjs --check` | **PASS** | 14 × OK, "result: 14 OK" (the PM binding edit is outside the persona markers) |
| Syntax and JSON | **PASS** | `node --check` on every hook and lib; `hooks.json` and `plugin.json` parse |
| Spec mirrors the code | **PASS (by review)** | every row of §2 has its `02-generate.md` counterpart; reason strings, rule names, state keys and CLI text were copied from the code |

## 5. Decisions (`docs/decisions.md`)

- **D34 (new):**
  - **What and why:** the check, the mapping, recording and audit, the gate and its exemptions, and fail-open. Why: report 10's 1a, B3, and the probe.
  - **Limits:** all-`n` answers; Bash edits; `prompt_id` on Stop continuations unverified.
  - **Cost:** about one tool call per Level 1 job.
- **D5:** "~2" → "2" files; "user-visible behavior change, meaning a change to what the user can do or what the system returns"; copy-only text changes are Level 1. A v0.2.2 note explains why, using B3 and B4.
- **Notes on other decisions:**
  - D4: the floor is enforced, and a level never goes down.
  - D12: the one `allow` and its exact shape.
  - D20: superseded for the "Plan:" line.
  - D25: Grep and Read `path:line` pairs.
  - D28: amended by D34 in the cwd's repo when a `prompt_id` is present.

## 6. Unverified, for Part 3

- **Following the card:** whether the main thread runs the check from the rule card before its first edit, and how often it needs the deny first (the cost per Level 1 job).
- **The `allow` in an interactive default-mode session:** whether it suppresses the permission prompt. Headless, `Bash(node *)` is allowed anyway, so Part 3 can't show it; the release checklist can.
- **Stop-hook continuations:** whether one keeps the same `prompt_id`. If it doesn't, the model re-runs the check.
- **`prompt_id` on `PreToolUse` and `UserPromptSubmit`:** observed in the Part 1 probe (3/3 each). On `PreToolUse` for Bash it was observed in report 03.
- **Plugin-root substitution in `deliver` step 1:** the step uses the same `${CLAUDE_PLUGIN_ROOT}` as step 3, which v0.2.1 already runs.

## 7. For Part 3

**Expected levels** (fixed before any run):

| Prompt | Expected level |
|---|---|
| C0 | 0 |
| C1a, C1b | 1 |
| C2a, C2b | 2 |
| C3 | 3 |
| B1, B2 | 2 |
| B3 | **2** (your call) |
| B4 | **1** (D5 as amended) |

**Same rig as Part 1:** fixtures, `bin/run.mjs`, `bin/analyze.mjs` and `prompts.json` in this session's scratchpad. The analyzer needs two additions:
- read the `level` audit events per run (one per job, with booleans);
- count `level-check-missing` denies (a model that skips the check is denied immediately: your decision 2 replaces Part 3's "asked once, then denied" criterion).

**Cost.** 10 runs per prompt (C3 at its 3? your call), at Part 1's per-run costs, comes to about **$17–19**. That's over the **$10 cap**. Part 3 needs a choice before it runs: fewer runs per prompt, a subset, or a higher cap.

## 7a. Repo state

- **Nothing committed, installed or pushed.**
- **Files written, all permitted by the Phase 10 constraints:** `plugin/**`, `prompts/02-generate.md`, `tests/**`, `docs/decisions.md`, and this report alongside `reports/10-inspect-level-2026-11-11.md`.
- **Scratch:** the replay used a scratch `HOME` (`…/scratchpad/p10/replayhome`) and a `git archive` copy of the v0.2.1 plugin (`…/scratchpad/p10/old-plugin`), both in this session's scratchpad. The real `~/.agent-org` wasn't touched in this part.
