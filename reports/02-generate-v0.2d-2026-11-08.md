# Phase 2d: relay containment and spec alignment (2026-11-08)

## 1. Summary

- One code change, as the prompt asks. `isRelayed` in `plugin/hooks/claim-check.mjs` now uses **word containment**. A main-thread claim sentence counts as relayed when every word of it appears in one sentence of a specialist's final text. The attribution prefix ("X reports:") is removed first. So "full-stack-developer reports: Tests: PASS" now matches "Tests: PASS (6/6)". This settles 2c Q3.
- **Guards:** the specialist sentence must itself be a claim that isn't negated or future-tense, and it can't be inside quotes or backticks. It must also come from an agent with `finished[agent_id]` recorded in the session state. The old substring and 80% token-overlap paths are removed, so every relay goes through the guards.
- The spec text (no `conflict` event, no checkpoint, seen-in-output anywhere in output, backticks not skipped) already matched the 2c build. **No other hook behavior changed.** `README.md` got one clause describing the guarded relay rule. Nothing else in `plugin/`, `scripts/`, `.claude-plugin/` or `docs/` changed.
- Verification: the 2c harness plus 6 new rows gives **165 of 165 passing**. `claude plugin validate` passes for the plugin and the marketplace. `sync-personas --check` reports 14 × OK.
- Nothing was installed, committed or launched.

## 2. Pin and preconditions

| Check | Result |
|---|---|
| `~/git/agent-personas` exists, tracked files clean, on `main` | PASS |
| `PIN` | `6d13ca61f0b556c53623bf056a4ff272024ce046` (branch `main`), unchanged from v0.2–v0.2c |
| No `60 seconds` in the PM at `PIN` | PASS (0 hits) |
| All 14 persona files at `PIN` | PASS (plus `agents/README.md`) |

## 3. Files changed

`git diff --stat`: 2 files, 36 insertions, 19 deletions.

| File | Bytes | Change |
|---|---|---|
| `plugin/hooks/claim-check.mjs` | 17,554 | `ATTRIBUTION` prefix regex; `relayableSentences()` (claims only, no negated or future-tense sentences, no quoted text, `finished` agents only); `isRelayed()` rewritten as every-word containment; `checkStop` reads `finished` from the session state and pairs each `subagents/agent-<id>.jsonl` with its id |
| `plugin/README.md` | 12,024 | Claim-check bullet: one parenthetical describing the guarded relay |
| `reports/02-generate-v0.2d-2026-11-08.md` | — | This report |

Every other file is byte-identical to `a63ad53`.

**Agent id ↔ transcript file:** the specialist's id comes from the file name `agent-<agent_id>.jsonl`. P5 B1 and C4 confirm that `tool_response.agentId` equals the later `agent_id`, and that the per-agent files are `agent-<id>.*`. Those findings come from the same probe. The file-name mapping itself is noted for Phase 6 in §7.

## 4. Agents

No change. Models, tools, descriptions and bindings are as in the v0.2c report §4.

## 5. Enforcement gaps

The gaps are as in v0.2c §5, with these changes:
- **Relay is stricter on guards and looser on wording.** Echoes of negated, future-tense or quoted specialist text no longer count. Neither does text from an agent whose stop was blocked and never recorded `finished`. The old 80% overlap could have matched those. A shorter restatement of a real specialist claim now counts, which it didn't before.
- **The `finished` guard is not quite "passed its own check".** `finished` is also recorded on a second, warned stop (`stop_hook_active: true`) whose failure was never fixed. A specialist that keeps an unbacked PASS through the warning can therefore still back a relay. This is the spec's definition (§5d: "`finished` recorded"). See Q1.
- **Unreadable state means no relays are recognized.** A corrupt `state.json` makes every claim count as the main thread's own, so the result can be a block but never a silent pass. A thrown exception elsewhere still fails open.
- **Unchanged:** at Level 2+, the main thread's own re-verification is still the real check of relayed claims.

## 6. Verification results

The harness is the v0.2c `t.mjs`, copied into this session's scratchpad (not the repo) and run as `node t.mjs plugin/hooks`. It uses a throwaway `HOME` and starts with `AGENT_ORG_HOOK_DEBUG` unset. **165 passed, 0 failed.**

| # | Check | Result |
|---|---|---|
| 1 | `claude plugin validate ./plugin` → "✔ Validation passed". `claude plugin validate .` (marketplace) → "✔ Validation passed" | PASS |
| 2 | `node scripts/sync-personas.mjs --check` → 14 × OK, "main: at pin", "production: local branch not found", "result: 14 OK", exit 0 | PASS |
| 3 | escalate: all 10 rows plus idempotence | PASS |
| 4 | session-start prints the rule card (unchanged) | PASS |
| 5 | guard v0.1 table, every row. The debug log has no command text or paths | PASS |
| 6 | `deliver` is the only skill without `disable-model-invocation: true`. The other five have it | PASS |
| 7 | All 14 agents have `name`, `description`, `tools` and `model`. None uses `inherit` or `Agent` | PASS |
| 8 | grep of `plugin`, `.claude-plugin`, `scripts` and `LICENSE` for `/Users/`, `/home/<user>/`, `secret=`, `token=`, `gs://`, `s3://` → no hits (grep exit 1) | PASS |
| 9 | claim-check Stop: every v0.2 and v0.2c row, plus the **v0.2d rows** below | PASS |
| 10 | claim-check SubagentStop: every row, teammate rows included | PASS |
| 11 | guard v0.2 rules and v0.2c teammate rows | PASS |
| 12 | record.mjs, every row | PASS |
| 13 | audit lib and audit-verify: parallel appends, middle and last-line edits, truncation, rotation, `foo`/`foo-1`, stale and held lock, exit 1 | PASS |
| 14 | session-start audit: same-length and length-changing edits → lines 49 and 50; truncation; 10 MB file in 299 ms; one JSON object | PASS |
| 15 | team-audit: 4 payloads → 4 audit lines, no stdout | PASS |
| 16 | Privacy: marker strings grep → 0 hits | PASS |
| 17 | Speed on a 3 MB transcript and a 50k-line log, in ms: Stop 291, SubagentStop 243, session-start 376, guard 126, record 100, team-audit 104, audit-verify 340 | PASS |
| 18 | `hooks.json` events, matchers, timeouts and `"${CLAUDE_PLUGIN_ROOT}"` (file unchanged) | PASS |

**v0.2d rows (check 9):**

| Case | Expected | Result |
|---|---|---|
| "full-stack-developer reports: Tests: PASS", specialist "Tests: PASS (6/6)", `finished` recorded | no output | PASS |
| same, specialist sentence "I didn't check whether tests pass" | block | PASS |
| same, specialist has no `finished` | block | PASS |
| "Tests pass.", specialist sentence "I'll make sure tests pass next" | block | PASS |
| *extra:* "…reports: all integration tests pass" (words the specialist never said) | block | PASS |
| *extra:* the specialist's claim appears only inside backticks | block | PASS |

**Fixture change:** the v0.2 row "relayed … where a subagent transcript's final text contains 'Tests: PASS'" now writes `finished` for that agent. Without it, the v0.2d guard (correctly) blocks. The row's expected result is unchanged.

## 7. UNVERIFIED items for Phase 6

1. **Relay live:** a real "X reports: …" relay after a specialist's unblocked stop passes without a block, and the main thread's own unbacked claims are still caught. Re-measure the false-block rate.
2. **`agent-<id>.jsonl` ↔ `agent_id`:** confirm on a live session that the subagent transcript file name carries the same id as `SubagentStop.agent_id`, so `finished` lines up. Background agents and teammates count too.
3. **Carried over from v0.2c §7:** `additionalContext` on `SubagentStop`; teammate checks live; `intent-edited-after-approval`; BLOCKED-on-optional; F11; stale-read refusal text; `TaskCreated`/`TaskCompleted` payloads; the specialist-`BLOCKED` conflict path; whether the main thread follows `deliver`'s steps (unnamed dispatch, relay wording, collision check, Level 3 claim reproduction); `systemMessage` visibility at session start; `CLAUDE_CODE_SESSION_ID` in the Bash environment.

## 8. `docs/decisions.md`

No change. D25–D30 and the D7 "Superseded by D30" status were already present. `docs/v0.2-plan.md` already describes the guarded containment rule (line 32).

## 9. Open questions for you

1. **Should a warned stop count as "finished" for relay?** Today `finished` is recorded on a second stop even when its failure is unresolved. That is what the guard's same-group fallback needs: the agent really has stopped. For relay, though, it means a PASS kept through the warning can back the main thread. A stricter option is to skip agents whose last `result` audit carries `warned`, or to record a separate `passed[agent_id]`. I left it as specified.
2. **Attribution prefix:** only up to 3 words before `reports|said|says|confirms|returned|wrote…` are stripped. A long lead-in ("After review, the full-stack developer reports: …") isn't relayed. It also already starts with a future/plan word ("After"), so it's skipped anyway. Widen it?
3. **Plugin icon** (carried over): `claude plugin validate` still warns about the missing icon in the directory scan. Add one, or ignore?
