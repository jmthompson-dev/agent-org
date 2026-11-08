# Phase 2b: generate v0.2.0, incremental fixes (2026-11-08)

Applied on top of the v0.2.0 build in commit `0aa5a34` (report `reports/02-generate-v0.2-2026-11-08.md`). Only the six changes listed in the prompt were made. Every other file is byte-identical to `0aa5a34`.

## 1. Summary

- **The PM is exempt from the report contract.** `claim-check.mjs` audits the PM's `result` with outcome `plan` and never blocks it. The PM binding no longer asks for an `Outcome:` line, and `deliver` saves the PM's reply as is.
- **Same-group deny with a fallback.** When either agent's dispatch record has no `promptId`, an agent that hasn't finished counts as the same group. `SubagentStop` records `finished[agent_id]`. The audit flag says which method decided (`group: prompt_id` or `group: concurrent`).
- **Risky paths ask once per kind, per repo, per session.** `record.mjs` keeps `riskySeen[<repo>]`. The kinds are `migration`, `ci`, `infra` and `auth`.
- **Rotated audit files are now named `<repo>.jsonl.<n>`,** so `foo` and `foo-1` can't clash. The PM binding is now 293 words (limit 300) and includes the team cases. The `AGENT_ORG_BLOCK_FORM` override is documented in the README.
- **Verification: every check passed, none skipped.** 47 v0.1 checks and 117 v0.2 checks passed (17 of the v0.2 checks are new), plus validate, sync and speed. Nothing was installed or committed.

## 2. Pin and preconditions

| Check | Result |
|---|---|
| `~/git/agent-personas` exists, tracked files clean, branch `main` | PASS |
| `PIN` | `6d13ca61f0b556c53623bf056a4ff272024ce046` (unchanged; already in `plugin.json`) |
| No `60 seconds` in the PM persona at `PIN` | PASS (0 hits) |
| All 14 persona files at `PIN` | PASS |

## 3. Files changed (sizes after the change)

| File | Bytes | Change |
|---|---|---|
| `plugin/hooks/claim-check.mjs` | 14,761 | PM exemption (outcome `plan`). `NO_SHELL` no longer lists the PM. Records `finished[agent_id]` |
| `plugin/hooks/guard.mjs` | 25,778 | `riskyKinds()` returns kind ids, and `riskySeen` suppresses repeat asks for a kind. Same-group fallback (`concurrent`) and the `group:` audit flag |
| `plugin/hooks/record.mjs` | 9,853 | A main-thread risky edit adds its kind to `riskySeen[<repo>]` |
| `plugin/hooks/lib/state.mjs` | 6,422 | Adds `finished` and `riskySeen` to the state shape |
| `plugin/hooks/lib/audit.mjs` | 10,137 | Rotated files named `<repo>.jsonl.<n>`. Discovery and `listRepos` updated |
| `plugin/agents/principal-project-manager.md` | 6,857 | Binding: the team cases, and a return with no `Outcome:` line |
| `plugin/skills/deliver/SKILL.md` | 12,458 | Steps 2–3: the PM returns only the intent, saved as is |
| `plugin/README.md` | 11,216 | PM exemption, the fallback, rotation names, incremental vs full check, once-per-kind risky asks, state contents, the `AGENT_ORG_BLOCK_FORM` note |
| `reports/02-generate-v0.2b-2026-11-08.md` | — | this report |

Not changed: `docs/decisions.md`, because D25–D30 already match `docs/v0.2-plan.md` § "Decisions to add" word for word and the plan's edits since `0aa5a34` are outside that section. Also unchanged: `hooks.json`, the other hooks, the other 13 agents, the other skills, `plugin.json`, `marketplace.json`, `scripts/` and `LICENSE`.

## 4. Agents

Tools, models and descriptions are unchanged (the prompt's defaults; no `Agent`, no `inherit`). The binding word counts in the v0.2 report still hold, except the PM:

| Agent | Model | Tools | Binding words |
|---|---|---|---|
| principal-project-manager | opus | Read, Grep, Glob, WebFetch, WebSearch | 293 including the heading (288 body), under 300 |

PM binding changes:
- **Mode bullet:** now lists the five typical team cases.
- **Return bullet:** "only the intent markdown, no `Outcome:` line (the report contract doesn't apply to you); the main thread saves it as is."

This resolves Q1 and part of Q2 from the v0.2 report.

## 5. Enforcement gaps

These are the same as the v0.2 report §5, with three changes:
- **Specialist reports:** the PM is outside the report contract. Its reply is audited (`plan`) and scanned for refused edits, but its content isn't checked.
- **Parallel collisions:** the same-group deny no longer switches off when `prompt_id` is missing. Under the fallback, two agents running at the same time are one group. An agent finishing doesn't reopen its files to agents that were already running. That's correct for sequential tasks, but a parallel sibling that outlives it could then edit its files without a deny. The ledger and the `deliver` collision check still catch that.
- **Scope growth:** after the first `ask` for a kind is approved and the edit succeeds, later edits of that kind don't ask. The file counter still applies.

## 6. Verification results

The harness lives in the session scratchpad (`t/test-v01.mjs`, `t/test-v02.mjs`, `t/speed.mjs`, `t/helpers.mjs`), copied from the previous run and extended. Every run used a throwaway `HOME`.

| # | Check | Result |
|---|---|---|
| 1 | `claude plugin validate ./plugin`, `claude plugin validate .` (marketplace) | PASS: "✔ Validation passed" for both |
| 2 | `node scripts/sync-personas.mjs --check` | PASS: 14 × OK. `main: at pin`. `production: local branch not found` (reported, not an error). Exit 0 |
| 3 | escalate.mjs samples (10) | PASS (all 10) |
| 4 | session-start prints the rule card (182 words) | PASS |
| 5 | guard v0.1 table (every row) + debug log with no commands, paths or prompts | PASS (`test-v01.mjs`: 47 passed, 0 failed) |
| 6 | Skill frontmatter: only `deliver` lacks `disable-model-invocation: true` | PASS (the 5 other skills have it) |
| 7 | Agent frontmatter: 4 fields, no `inherit`, no `Agent` in `tools` | PASS. The grep flagged the PM's description word "Agent-org"; its tools line is clean |
| 8 | grep for absolute home paths, `secret=`, `token=`, bucket URLs in `plugin/`, `scripts/`, `.claude-plugin/`, `LICENSE` | PASS: no hits |
| 9 | claim-check Stop table | PASS |
| 10 | claim-check SubagentStop, plus new rows: PM reply without `Outcome:` → no block; audit `result` with outcome `plan`; `finished` recorded; PM with no tool call → no block; architect PASS backed by a Read → no output; architect PASS with no tool call → block; specialist stop → `finished` recorded; blocked stop → `finished` not recorded | PASS |
| 11 | guard v0.2 table, plus new rows: `group: prompt_id` flag; both `promptId: null` with A not finished → deny with `group: concurrent`; A finished → no output; only B lacking `promptId` → deny; a second migration after `riskySeen` → no output; a first CI edit after a migration → ask (CI/CD); seen kind plus a 4th file → file-counter ask only; `riskySeen` for another repo → ask | PASS |
| 12 | record.mjs, plus new rows: non-risky edits → no `riskySeen`; two main-thread migration edits → `riskySeen.app = ["migration"]`; a subagent CI edit isn't counted | PASS |
| 13 | audit lib + audit-verify: 40 parallel appenders, middle edit, last-line edit, truncation, rotation now to `rot.jsonl.<n>` (every file matches `^rot\.jsonl(\.\d+)?$`), chain across files, tamper in `rot.jsonl.1` reported, **`foo` and `foo-1` rotating side by side: no shared file, each verifies OK with 30 lines**, checkpoint, stale lock, held lock | PASS |
| 14 | session-start: intact or absent log; broken chain → `systemMessage`; one JSON object | PASS |
| 15 | team-audit: 3 team payloads + SendMessage → one audit line each, no stdout | PASS |
| 16 | Privacy: marker strings across all tests; grep of the throwaway `HOME` | PASS: 0 hits |
| 17 | Speed: 3.28 MB transcript, 50k-line audit log | PASS (below) |
| 18 | `hooks.json`: all 9 events, both PreToolUse matchers, the PostToolUse matcher, every command through `"${CLAUDE_PLUGIN_ROOT}"`, timeout 5 | PASS |

`test-v02.mjs`: **117 passed, 0 failed.**

**Speed.** With the default 10 MB limit, the 16.9 MB synthetic log rotates on the first append to `app.jsonl.1` plus a 1-line active file. So the run was repeated with `AGENT_ORG_AUDIT_MAX_BYTES=100000000` to keep a 50,001-line active file. Worst case across both runs:

| Hook | ms |
|---|---|
| claim-check Stop | 193 |
| claim-check SubagentStop | 147 |
| session-start, first (full verify of 50k lines) | 571 |
| session-start, incremental | 121 |
| guard Edit | 119 |
| record Edit | 120 |
| team-audit | 106 |
| escalate | 84 |
| audit-verify full | 533 |

## 7. UNVERIFIED items for Phase 6

1. **Whether the main thread follows `deliver`'s steps:**
   - unnamed dispatch;
   - relay wording;
   - the `record.mjs --ledger` collision check;
   - Level 3 claim reproduction (and the fresh-QA variant);
   - the one-Edit `**Status:** APPROVED` change;
   - **new:** saving the PM's reply as is, and whether the PM really returns no `Outcome:` line.
2. **The `additionalContext` block form,** selectable with `AGENT_ORG_BLOCK_FORM=additionalContext`, now documented in the README as temporary.
3. **`systemMessage` visibility** at session start.
4. **Teammates (P5 F3–F5):**
   - teammate identity in hook payloads;
   - which hooks fire inside teammates;
   - teammate transcripts;
   - the team event fields;
   - teammate spawns through `PostToolUse(Agent)`;
   - **new:** whether teammates fire `SubagentStop` (if not, `finished` is never recorded for them, and the fallback treats them as running until the session ends).
5. **`prompt_id` on `PostToolUse(Agent)`.** If it's absent, the same-group rule now uses the `concurrent` fallback instead of switching off. Phase 6 should record which method its collision run used (the audit `group:` flag).
6. **`tool_response.agentId`** on foreground dispatches.
7. **The plugin-root reference in skills:** VERIFIED in the docs, but this will be its first live use.
8. **`CLAUDE_CODE_SESSION_ID` in the Bash environment:** VERIFIED in the docs, but this will be its first live use.
9. **The claim check's false-block rate.**
10. **`SubagentHandback` `tool_input.message`** with a real payload.
11. **The exact refused-edit text.**

## 8. `docs/decisions.md` changes

None in this run. D25–D30 and the D7 status line were added in `0aa5a34` and still match the plan.

## 9. Open questions for you

1. **`finished` on a blocked stop.** I record `finished[agent_id]` only when the claim check doesn't block that stop. A blocked agent keeps working and may still edit, so marking it finished early would let a sibling edit its files without a deny. The prompt says to record it "for every agent-org agent". Keep the refinement?
2. **The fallback's edge case.** When agent A has finished but a parallel sibling B is still running, B can edit A's files without a deny under the `concurrent` fallback. The `prompt_id` method would deny it. The `deliver` collision check still catches it as "a file changed by two agents". Accept that, or keep a finished agent's files protected until the main thread's next turn?
3. **The prompt's file list.** "Hard constraints" names the report `reports/02-generate-v0.2-<date>.md`, but § Report says `02-generate-v0.2b-<date>.md`. I wrote `v0.2b`, so the earlier report isn't overwritten. Worth aligning in the prompt.
4. **Existing logs in the old `<repo>-<n>.jsonl` format** aren't recognized as rotated files anymore. A file like `app-1.jsonl` now shows up as its own repo, `app-1`, with no head record; I didn't test how verify reports it. No real installs exist yet (the plugin was never installed), so I added no migration. OK?
