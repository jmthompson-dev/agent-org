# Phase 2c: v0.2.0 Phase 6 fixes (2026-11-08)

## 1. Summary

- Applied the Phase 6 fixes in place to the v0.2.0 build. 20 files changed (251 insertions, 118 deletions). Nothing was added or removed. `hooks.json`, `escalate.mjs`, `rule-card.md`, the other skills, `plugin.json`, `marketplace.json`, `scripts/`, the five agents with no shell, and `LICENSE` are byte-identical.
- **Teammate identity (F1):** `effectiveType()` and `isTeammate()` in `lib/state.mjs`. Guard, record, claim-check and team-audit now resolve a teammate's `agent-org:*` type through the dispatch record. A teammate's ask-list command is now **denied** instead of asked.
- **False blocks (F2):** the citation check covers only `path:line` citations. Negated and future-tense sentences are skipped, and paths seen in Grep, Glob or Bash output count as seen. A turn with no tool calls can be backed by the previous turn. The block form is now `additionalContext` only, and `AGENT_ORG_BLOCK_FORM` is removed.
- **Audit (F3, F5):** session start now fully verifies the active file. The checkpoint is gone, and line numbers are correct for both same-length and length-changing edits. There is no `conflict` event. Intent edits after approval are audited (F6). The PM is exempt on `SubagentHandback` (F9). In `deliver`: "in one Edit" is dropped (F8), and the F6 and BLOCKED-on-optional rules are added. Bindings get the one-command test rule (F11).
- Verification: 159 of 159 hook unit tests pass. `claude plugin validate` passes for the plugin and the marketplace, with one plugin-directory warning (no icon). `sync-personas --check` reports 14 × OK. Nothing was installed, committed or launched.

## 2. Pin and preconditions

| Check | Result |
|---|---|
| `~/git/agent-personas` exists, tracked files clean, on `main` | PASS |
| `PIN` | `6d13ca61f0b556c53623bf056a4ff272024ce046` (branch `main`), unchanged from v0.2/v0.2b |
| No `60 seconds` in the PM at `PIN` | PASS (0 hits) |
| All 14 persona files at `PIN` | PASS |

## 3. Files changed (sizes after the change)

| File | Bytes | Change |
|---|---|---|
| `plugin/hooks/lib/state.mjs` | 7,531 | `effectiveType`, `isTeammate`; `teammate` in the dispatch schema comment |
| `plugin/hooks/guard.mjs` | 26,723 | Identity through `effectiveType`; teammate ask-list → `deny` |
| `plugin/hooks/record.mjs` | 12,281 | Ledger by effective type; `teammate` on dispatch; `intent-edited-after-approval`; PM exempt on `SubagentHandback` |
| `plugin/hooks/claim-check.mjs` | 16,347 | `path:line`-only citations; future-tense skip; `nothing` added to the negations; seen-in-output; previous-turn backing; `additionalContext` only; teammate `SubagentStop` resolved |
| `plugin/hooks/lib/transcript.mjs` | 9,261 | `toolCallsInPreviousTurn`, `filesSeenInOutput` |
| `plugin/hooks/lib/audit.mjs` | 9,691 | Checkpoint removed; `verify(repo, {full:false})` walks the whole active file; `conflict` removed from `EVENTS` |
| `plugin/hooks/session-start.mjs` | 1,909 | Header comment (full active-file verify) |
| `plugin/hooks/audit-verify.mjs` | 2,081 | `readOnly` option dropped (verify never writes now) |
| `plugin/hooks/team-audit.mjs` | 3,211 | `agent_type` resolved through the dispatch record; header comment updated with the Phase 6 results |
| `plugin/skills/deliver/SKILL.md` | 13,382 | Step 5: one or two Edits; the F6 rule. Step 6: BLOCKED on an optional item. Re-plan: no `conflict` event |
| `plugin/agents/*.md` (9 agents with Bash) | — | Test-command-alone rule (F11); see §4 |
| `plugin/README.md` | 11,917 | `AGENT_ORG_BLOCK_FORM` paragraph removed; claim, citation and block-form text; teammate identity and deny; full active-file verify; conflict record; gaps |
| `reports/02-generate-v0.2c-2026-11-08.md` | — | This report |

## 4. Agents

Models, tools and descriptions are unchanged (the defaults: no `Agent`, no `inherit`).

The `- **Bash:**` line of each of the 9 agents with Bash now ends: "Run tests alone: no pipes, `;`, `&&`, heredocs, `echo $?`."

Two agents needed trims to stay under 250 words:
- **Return bullet** (cloud, devops, platform, QA): "A `SubagentStop` hook blocks a missing outcome line or a PASS without a successful command in your transcript: fix or retract." became "A hook blocks a missing outcome line or an unbacked PASS: fix or retract."
- **QA:** the test-path examples `(test/, *.test.*, …)` were dropped from the Enforced bullet. The guard deny itself is still stated.

| Agent | Binding words (`wc -w`, including the heading) |
|---|---|
| ai-engineer | 241 |
| cloud-engineer | 249 |
| devops-engineer | 246 |
| full-stack-developer | 230 |
| information-security-architect | 219 |
| ml-engineer | 243 |
| platform-engineer | 246 |
| quality-assurance-architect | 249 |
| technical-product-manager | 220 |
| PM and the 4 agents with no shell | unchanged (PM 293, under 300) |

## 5. Enforcement gaps

The gaps are as in the v0.2b report §5, with these changes:
- **Teams:** a teammate with a dispatch record now gets every subagent check: the ledger, the QA test-path deny, the same-group deny, the report contract, and the audited type. Teammate ask-list commands are denied, so teammates can't commit, push or deploy even in auto mode. A teammate without a dispatch record falls back to v0.1 checks.
- **Citation check is narrower by design.** Bare-path mentions are no longer checked, and anything that appears in successful Grep, Glob or Bash output counts as seen. That includes path-like tokens anywhere in the output, not only at a line start (see §9 Q2). An invented `path:line` citation is still caught.
- **Previous-turn backing:** in a turn with no tool calls, a claim can rest on the previous turn's command, even if the files changed in between. This is accepted as the Phase 6 trade-off.
- **Intent edits after approval** are detected and audited, not blocked (B6). A `Write` that replaces a whole approved intent isn't checked: the spec covers `Edit` only.
- **Unchanged:** the approval gate and blocking questions are instruction-only. QA can write through Bash, and Bash edits aren't counted. The guard can't see aliases, scripts, interpreter one-liners or commands built from variables. Headless `ask` means deny.

## 6. Verification results

Harness: a session-scratchpad `t.mjs` (not in the repo) with a throwaway `HOME` and `AGENT_ORG_HOOK_DEBUG` unset at start. Every piped hook ran as its own process. Result: **159 passed, 0 failed.**

| # | Check | Result |
|---|---|---|
| 1 | `claude plugin validate ./plugin` → "✔ Validation passed" (directory warning: no icon). `claude plugin validate .` (marketplace) → "✔ Validation passed" | PASS |
| 2 | `node scripts/sync-personas.mjs --check` → 14 × OK, "main: at pin", "production: local branch not found", exit 0 | PASS |
| 3 | escalate: all 10 rows plus an idempotence check | PASS |
| 4 | session-start prints the rule card (182 words) | PASS |
| 5 | guard v0.1 table: every row. Debug log: no command text or paths | PASS |
| 6 | `deliver` is the only skill without `disable-model-invocation: true` (the other five have it) | PASS |
| 7 | All 14 agents have `name`, `description`, `tools`, `model`; no `inherit`; no `Agent` | PASS |
| 8 | grep for `/Users/`, `/home/<user>`, `secret=`, `token=`, bucket URLs in `plugin/`, `.claude-plugin/`, `scripts/`, `LICENSE` | PASS: 0 hits |
| 9 | claim-check Stop: all v0.2 rows, all v0.2c rows, plus "a mid-line file name in Bash output" and "an `isMeta` feedback entry keeps one turn" | PASS |
| 10 | claim-check SubagentStop: all rows. Plus: a teammate `dev` with a dispatch record gets the report contract and is audited as `agent-org:full-stack-developer`; a teammate without a record is skipped | PASS |
| 11 | guard v0.2 rules: every row, including all six v0.2c teammate rows and a piped teammate `git push` → deny | PASS |
| 12 | record.mjs: all rows, including the v0.2c rows. An Approval log edit → no flag | PASS |
| 13 | audit lib + audit-verify: 40 parallel appends; middle edit → "between lines 19 and 20"; last-line edit; truncation → head mismatch; rotation to `<repo>.jsonl.<n>` with the chain carried across; `foo`/`foo-1` kept apart; stale lock removed; held lock → proceeds after 3,007 ms; exit 1 on a break; the head record has no `checkpoint`. **"Incremental verify moves the checkpoint" is retired** (superseded by v0.2c §5b, F3) | PASS |
| 14 | session-start: intact → no `systemMessage`. **Same-length** edit of line 50 → "between lines 49 and 50". Length-changing edit of line 50 → 49 and 50. Truncation → head mismatch. 10 MB active file (26,955 lines) in 278 ms. One JSON object | PASS |
| 15 | team-audit: 4 payloads → 4 audit lines, no stdout; a teammate's `agent_type` is resolved | PASS |
| 16 | Privacy: marker in commands, `new_string`, message bodies, `task_subject`, prompts, final texts and intent evidence; grep of the throwaway `HOME` (`.agent-org/` and the debug log) | PASS: 0 hits |
| 17 | Speed, 3 MB transcript + 50k-line log, in ms: Stop 173, SubagentStop 127, session-start 335, guard 83, record 96, team-audit 99, audit-verify 335 | PASS |
| 18 | `hooks.json`: all events and matchers, timeout 5, every command through `"${CLAUDE_PLUGIN_ROOT}"` (file unchanged) | PASS |

Two harness bugs were fixed during the run; neither was a hook defect:
- The shell exported `AGENT_ORG_HOOK_DEBUG`, so the debug-log line count was off.
- An intent fixture's text didn't contain its own `new_string`.

The relayed-claim fixture follows the spec ("final text contains 'Tests: PASS'"). A report line like "Tests: PASS (6/6)" relayed as "X reports: Tests: PASS" isn't recognized as relayed: 2 of 6 tokens overlap, and the rule needs 80%. That behavior is unchanged from v0.2b; see Q3.

## 7. UNVERIFIED items for the release checklist

1. **Does `additionalContext` on `SubagentStop` continue the subagent?** Phase 6 verified the form only on the main thread's `Stop`. `finished` is now withheld on any blocked subagent stop, as it was for `decision`.
2. **Teammate checks, live.** The F1 resolution has only been unit-tested with Phase 6's observed payload shapes:
   - the QA deny for a `qa` teammate;
   - the same-group deny between teammates;
   - teammate ledger rows and `result` lines;
   - the teammate `git push` deny.
3. **The false-block rate after F2,** re-measured as Phase 6 §8 item 4 recommends.
4. **`intent-edited-after-approval`:** whether the main thread now sends conflicts back to the PM, and how often the flag fires on legitimate edits.
5. **`deliver`'s BLOCKED-on-optional rule:** whether it records the item, the reason and the evidence.
6. **F11:** whether specialists now run the test command alone.
7. **Still open from Phase 6:** the live stale-read refusal text, `TaskCreated`/`TaskCompleted` payloads, and the specialist-`BLOCKED` conflict path.

## 8. `docs/decisions.md`

No change. D25–D30, the D7 "Superseded by D30" status and the Phase 6 change notes were already in the file (commit `2722e1f`). They match this run.

## 9. Open questions for you

1. **Inconsistencies inside the prompt, resolved in favor of the v0.2c text.** If you meant otherwise, tell me and I'll change them back.
   - §5b still lists `conflict` among the audit events, and says "incremental mode starts from `checkpoint`". Check 13 says "incremental verify moves the checkpoint". README §7 says the session-start check is incremental. All four conflict with the v0.2c F3 and F5 bullets. I removed `conflict` and the checkpoint, retired the check-13 row, and wrote the README for a full active-file verify.
2. **Seen-in-output is wider than the spec.** The spec says `path:line:` or a path at a line start. I also count path-like tokens with an extension anywhere in successful Grep, Glob or Bash output. Phase 6's T1c false block had the file name mid-line ("BROKEN repo: <file> between lines…"), which the line-start rule would still have blocked. Keep it wider, or narrow it to the spec?
3. **Relay matching with extra detail.** "Tests: PASS (6/6)" relayed as "Tests: PASS" isn't matched (see §6). Should the relay rule also accept a specialist sentence that *starts with* the claim sentence? It's not changed here because it's outside this prompt.
4. **"Skip tokens inside quotes"** is implemented as double quotes and blockquotes, not inline backticks. Models usually backtick `path:line`, so skipping backticks would disable the check.
5. **Plugin icon:** `claude plugin validate` warns `ICON_MISSING`. This only matters for a directory submission. Add one, or ignore?
