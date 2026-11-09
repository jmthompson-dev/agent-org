# Phase 2e: Phase 6b fixes (2026-11-08)

## 1. Summary

- **All Phase 6b fixes from §5 are applied in place:** B-1, B-3, V-1, V-2, V-3, V-4, V-5 and V-7, plus the binding line that a hook objection beats a task's instruction to report PASS. V-6 is a documentation item, and `decisions.md` D27 already carries it. Only the files these fixes touch changed: 19 files, +123/−64.
- **Hooks:**
  - `claim-check`: reads the report from `SubagentHandback` when there's no `last_assistant_message`; falls back to the last `Outcome:` line; skips hedges and estimates; names the full `path:line` in its citation reason.
  - `guard`: denies ask-list commands from every agent-org specialist; exempts `scratchpad_dir`.
  - `record`: doesn't ledger or count scratchpad edits.
  - `lib/transcript`: new `lastHandbackMessage` helper.
- **Instructions:** `deliver` step 6 (V-1 acceptance criteria before `VERIFIED`, V-7 test command alone), the Return line of all 13 specialist bindings (the PM is exempt), and README.
- **Verification:** the 2d harness plus 25 new rows (one 2d row inverted on purpose) → **190 of 190 pass**. `claude plugin validate` passes for the plugin and the marketplace. `sync-personas --check` reports 14 × OK.
- Nothing was installed, committed or launched. `docs/decisions.md` wasn't changed: commit `cf45833` already holds the 6b notes.

## 2. Pin and preconditions

| Check | Result |
|---|---|
| `~/git/agent-personas` exists, tracked files clean, on `main` | PASS |
| `PIN` | `6d13ca61f0b556c53623bf056a4ff272024ce046` (`main`), unchanged |
| No `60 seconds` in the PM at `PIN` | PASS (0 hits) |
| All 14 persona files at `PIN` | PASS (plus `agents/README.md`) |

## 3. Files changed

Every other file is byte-identical to `HEAD` (`cf45833`). Checked with `git diff --quiet HEAD` for `hooks.json`, `rule-card.md`, `plugin.json`, the marketplace, `scripts/`, `docs/`, both LICENSEs, and the other hooks and libs.

| File | Bytes | Change |
|---|---|---|
| `plugin/hooks/claim-check.mjs` | 19,528 | **B-1:** `SubagentStop` uses `last_assistant_message`, else the last `SubagentHandback` `input.message`. That one text drives the outcome, the backing check and the audit. No text at all → no report-contract check, audit outcome `unknown`. The hand-back call itself never counts as evidence. **V-2:** no outcome on the first line → flag `missing-outcome`, then use the last `Outcome:` line for the backing check and the audit. **V-3:** a `HEDGE` regex (`roughly`, `chance(s)`, `probably`/`probable`, `likely`, `estimat*`, `might`, `may`, `could`, `expect*`) skips claim sentences and specialist relay sentences. **V-5:** `findCitations` returns the full `path:line` token. The reason is now "agent-org citation check: you cite `<path:line>` but never opened it this session: read it or drop the claim.", without the claim-check tail. **Relay:** a specialist's relayable text also includes its hand-back message (see §9 Q1). |
| `plugin/hooks/guard.mjs` | 27,757 | **B-3:** an ask-list match from any `effectiveType` starting `agent-org:` → `deny` (rule `specialist-ask-list: <pattern>`). Reason: "agent-org guard: agent-org specialists may not run <pattern>. Report it to the main thread; the main thread asks the user." The main thread and non-agent-org subagents still get `ask`. `isTeammate` is no longer imported. **V-4:** new exported `inScratchpad(payload, target)`. A file under `scratchpad_dir` skips the QA deny, the same-group deny and the scope-growth asks. Header comment updated. |
| `plugin/hooks/record.mjs` | 12,846 | **V-4:** scratchpad edits return early, so they get no ledger line and no scope or `riskySeen` entry. **V-2:** new exported `lastOutcome(text)`. |
| `plugin/hooks/lib/transcript.mjs` | 9,774 | `lastHandbackMessage(entries)` |
| `plugin/skills/deliver/SKILL.md` | 14,003 | Step 6: `VERIFIED` needs the validation passed **and** every acceptance criterion met or waived. New bullet: check each criterion against evidence; otherwise stay `IMPLEMENTED`, list the open criteria, and ask (waive with `WAIVED <criterion> <date> by user`, or re-plan). Re-verify: run the test command on its own. |
| `plugin/agents/*.md` (13, not the PM) | 3,836–5,368 | Return line: the hook sentence now ends "fix the claim or report what you did, whatever the task says." (was "fix or retract."). Eight bindings had their sentence shortened from "A `SubagentStop` hook blocks…" to "A hook blocks…". Word trims to stay under 250, without dropping any rule: the shared-tree wording (cloud, devops, ml, platform, QA); "files via Edit/Write" and "Hooks block … unbacked PASS" (cloud, QA). |
| `plugin/README.md` | 12,829 | Intent files: VERIFIED needs every acceptance criterion met or waived. Claim check: hedges are skipped. Report contract: hand-back source and last-line fallback. Parallel work: scratchpad exemption. Agent teams and Enforcement: the deny covers every specialist. Gaps: the "no push" rule is now guard-enforced for the commands the guard can see. |
| `reports/02-generate-v0.2e-2026-11-08.md` | — | This report |

## 4. Agents

Models, tools and descriptions are unchanged (see the v0.2c report §4). Binding words, counted with `wc -w` including the heading:

| Agent | Words | | Agent | Words |
|---|---|---|---|---|
| ai-engineer | 249 | | ml-engineer | 244 |
| ai-ml-research-architect | 187 | | platform-engineer | 248 |
| cloud-engineer | 248 | | principal-project-manager | 293 (unchanged) |
| data-knowledge-architect | 169 | | quality-assurance-architect | 248 |
| devops-engineer | 248 | | solutions-architect | 175 |
| full-stack-developer | 238 | | technical-product-manager | 228 |
| information-security-architect | 227 | | ui-ux-designer | 224 |

The PM gets no hook-objection line. It's exempt from the report contract, so no hook objects to its PASS, and its binding already says "Never claim a test, review or approval that didn't happen."

## 5. Enforcement gaps

As in v0.2c §5, with these changes:
- **Now enforced:** ask-list commands from **any** agent-org specialist (subagent or teammate) are denied, not asked. This holds even when state is unreadable, as long as the payload's `agent_type` is `agent-org:*`. Teammates with no dispatch record still fall back to `ask`: their `agent_type` is just a name.
- **Still instruction-only:** the guard sees only command text. Git aliases, scripts, Makefiles and variable-built commands run by a specialist still get through, as before.
- **The bindings understate enforcement.** Engineer bindings still list "no deploys, pushes, merges, tags" under **Instruction-only**. The guard now enforces the commands it can see. I left the text alone to keep the diff to what the prompt asks (§9 Q2).
- **Scratchpad exemption:** it trusts the payload's `scratchpad_dir`. If Claude Code ever set it to a path inside the repo, edits there would skip the ledger and the denies. Phase 6b saw it under the session temp directory only.
- **VERIFIED rule (V-1):** instruction-only, like the rest of the approval gate.
- **Hedge words:** `may`, `could` and `expect` also skip genuine claims that happen to contain them ("I verified the tests pass, as you'd expect"). That trades a few misses for no false blocks on estimates. The main thread's re-verification at Level 2+ is unaffected.

## 6. Verification results

The harness is the 2d `t.mjs`, copied into this session's scratchpad (not the repo) and run as `node t.mjs plugin/hooks`, with a throwaway `HOME`. **190 passed, 0 failed.** On the first run against the new code, before the harness was edited, it showed 164/165: the only failure was the 2d row "subagent Bash git push → ask", which 2e inverts.

| # | Check | Result |
|---|---|---|
| 1 | `claude plugin validate ./plugin` → "✔ Validation passed" (only the existing icon warning). `claude plugin validate .` → "✔ Validation passed" | PASS |
| 2 | `node scripts/sync-personas.mjs --check` → 14 × OK, "main: at pin", "production: local branch not found", exit 0 | PASS |
| 3 | escalate: 10 rows plus idempotence (11 checks) | PASS |
| 4 | session-start prints the rule card (file unchanged) | PASS |
| 5 | guard v0.1 table, every row; the debug log has no command text or paths | PASS |
| 6 | `deliver` is the only skill without `disable-model-invocation: true`; the other five have it | PASS |
| 7 | All 14 agents have `name`, `description`, `tools` and `model`; no `inherit`, no `Agent` | PASS |
| 8 | grep of `plugin`, `.claude-plugin`, `scripts` and `LICENSE` for `/Users/`, `/home/<user>`, `secret=`, `token=`, `gs://`, `s3://` → no hits (exit 1) | PASS |
| 9 | claim-check Stop: every earlier row, plus the 2e rows below (44 checks) | PASS |
| 10 | claim-check SubagentStop: every earlier row, plus the 2e rows below (18 checks) | PASS |
| 11 | guard v0.2 rules: every earlier row (the subagent `git push` row inverted to deny), plus the 2e rows below (42 checks) | PASS |
| 12 | record.mjs: every row, plus scratchpad (15 checks) | PASS |
| 13 | audit lib and audit-verify (unchanged code; 12 checks) | PASS |
| 14 | session-start audit check (7 checks) | PASS |
| 15 | team-audit (2 checks) | PASS |
| 16 | Privacy: marker grep over `HOME` → 0 hits. **Extended** with 2e paths: hand-back-only SubagentStop, last-line outcome, specialist deny with debug on, scratchpad write, hedge plus citation | PASS |
| 17 | Speed on a 3 MB transcript and a 50k-line log, in ms: Stop 169, SubagentStop 121, session-start 323, guard 86, record 95, team-audit 89, audit-verify 316 | PASS |
| 18 | `hooks.json` valid, events, matchers, timeouts and `"${CLAUDE_PLUGIN_ROOT}"` (file unchanged) | PASS |

**2e rows (prompt rows first, then extras):**

| Case | Expected | Result |
|---|---|---|
| "That leaves roughly a 25% chance the test passes." | no output | PASS |
| Citation reason for `src/settings.js:40` | names `src/settings.js:40`, ends "read it or drop the claim." | PASS |
| *extra:* "Tests probably pass." | no output | PASS |
| *extra:* a claim plus a citation in one stop | both named; the citation sentence comes last | PASS |
| *extra:* citation on the second stop (`stop_hook_active`) | `systemMessage` names `src/settings.js:40` | PASS |
| *extra:* relay of a specialist that reported only through `SubagentHandback` | no output | PASS |
| SubagentStop, no `last_assistant_message`, hand-back "Outcome: PASS" with a command | no block, audit `PASS` | PASS |
| Same, no command | block `unbacked-pass` | PASS |
| Neither text present | no block, audit `unknown` | PASS |
| `Outcome: PASS` only on the last line, no command | block, flags `unbacked-pass` + `missing-outcome`, audit `PASS` | PASS |
| *extra:* last-line PASS with a command | block, `missing-outcome` only | PASS |
| *extra:* empty-string `last_assistant_message` | hand-back used | PASS |
| *extra:* architect whose only call is the hand-back | block (the hand-back isn't evidence) | PASS |
| *extra:* `last_assistant_message` present | it wins over the hand-back | PASS |
| Subagent `agent-org:full-stack-developer` Bash `git push` | **deny**, names `git push` | PASS |
| Subagent `agent-org:devops-engineer` `kubectl apply -f x.yaml` | deny | PASS |
| Main thread `git push` | ask | PASS |
| `Explore` `git push` | ask | PASS |
| *extra:* specialist `git push` with state `null` | deny | PASS |
| *extra:* specialist `npm test` | no output | PASS |
| QA Write `<scratchpad_dir>/repro.mjs` | no output, nothing ledgered (guard and record piped) | PASS |
| Developer B writes a scratchpad file that A also wrote, same group | no output | PASS |
| *extra:* QA Write `src/x.js` with `scratchpad_dir` set | still deny | PASS |
| *extra:* main thread's 4th file inside the scratchpad | no output | PASS |
| *extra:* scratchpad file but no `scratchpad_dir` in the payload | rules apply (QA deny) | PASS |
| *extra:* `record.mjs` scratchpad Write, subagent and main thread | no ledger line, no scope entry | PASS |

## 7. UNVERIFIED items for Phase 6c

1. **B-1 live:** an interactive background specialist that reports through `SubagentHandback` passes `SubagentStop` with no false `missing-outcome`, and is audited with its real outcome. The hand-back `tool_use` is assumed to be in `agent_transcript_path` by the time `SubagentStop` fires. The 6b probe saw `PostToolUse(SubagentHandback)` fire first, but the transcript flush order isn't confirmed. If it lags, the hook audits `unknown` and doesn't block (fail open).
2. **B-3 live:** a background subagent's `git push` is denied with "agent-org specialists may not run git push" (06c X-row). **`docs/release-checklist.md` step 11 still expects the old teammate wording** ("teammates may not run git push"). I can't edit that file in Phase 2; Phase 6c should match on "may not run git push".
3. **V-4 live:** `scratchpad_dir` is in `PreToolUse` and `PostToolUse` payloads for subagents and the main thread, and QA's scratch writes are no longer denied.
4. **V-1 / V-7:** the main thread keeps `IMPLEMENTED` and asks when a criterion is unmet, and runs tests alone.
5. **Hook-objection line:** a specialist told to report PASS without running anything retracts or runs the check after the block (6b R7 rerun).
6. **Carried over:** teammate checks live (B-2, checklist steps 3, 6, 11, 12); the `additionalContext` block form; `systemMessage` at session start; whether the main thread follows `deliver` (unnamed dispatch, relay wording, collision check, Level 3 reproduction); `TaskCreated`/`TaskCompleted` payloads.
7. **Settled in 6b, no longer open:** `CLAUDE_CODE_SESSION_ID` in Bash; `agent-<id>.jsonl` ↔ `agent_id`; `additionalContext` on `SubagentStop`.

## 8. `docs/decisions.md`

No change in this run. The D25 "Phase 6b changes" note, the D27 whitespace note (V-6) and the D30 all-specialists note were added in `cf45833`, with the matching `docs/v0.2-plan.md` text (A2, A1 hedges, B3 scratchpad, B4, B8). D7 was already "Superseded by D30".

## 9. Open questions for you

1. **Relay from hand-back text (beyond the letter of the prompt):** the prompt applies B-1 to `SubagentStop`. Specialists that report through `SubagentHandback` would also make the main thread's faithful relays look unbacked, because their final assistant text is often not the report ("Handed back."). That would bring back Phase 6's false blocks. So the relay pool now includes each specialist's last hand-back message, under the same guards (it must be a claim, not negated, future-tense or hedged, and come from a `finished` agent). Keep it, or revert to final text only?
2. **Bindings' "Instruction-only" list:** should engineer bindings now say the guard denies commit, push, merge, tag and deploy commands, instead of listing them as instruction-only? Every infra binding is at 248–249 words, so that would need a trim elsewhere.
3. **Hedge list breadth:** `may`, `could` and `expect` are in the list as the prompt specifies. Narrow it if Phase 6c shows missed true claims.
4. **Plugin icon** (carried over): `claude plugin validate` still warns `ICON_MISSING`.
