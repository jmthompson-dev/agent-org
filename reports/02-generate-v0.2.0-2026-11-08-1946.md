# Phase 2 — Generate (v0.2f run, plugin.json 0.2.0) — 2026-11-08 19:46

## 1. Summary
- The existing build was updated in place for the one spec change since 2e: the **(v0.2f) team-start ask** in `guard.mjs` (rule 8), the `guard-ask` audit event, and the README note plus the auto-mode caveat.
- Three files changed (`plugin/hooks/guard.mjs`, `plugin/hooks/lib/audit.mjs`, `plugin/README.md`). Every other file is byte-identical.
- All verification checks pass: harness **202 passed, 0 failed** (190 from 2e plus 12 new team-start rows; one existing row was renamed to "teams flag unset"). `claude plugin validate` passes for the plugin and the marketplace, and the persona sync reports 14 × OK.
- `docs/decisions.md` needed no change: HEAD `04ddf1a` already has the D30 "Release check" note.
- `plugin.json` stays `0.2.0` as the spec says, but 0.2.0 has already been released (see §9).

## 2. Pin and preconditions
| Check | Result |
|---|---|
| `~/git/agent-personas` tracked files clean, on `main` | PASS |
| `PIN` | `6d13ca61f0b556c53623bf056a4ff272024ce046` (branch `main`) |
| No `60 seconds` in `principal-project-manager.md` at PIN | PASS (0 hits) |
| All 14 persona files at PIN | PASS (14 plus `agents/README.md`) |

## 3. Files changed (sizes in bytes)
| File | Change | Size |
|---|---|---|
| `plugin/hooks/guard.mjs` | header rule 8; `decide(payload, state, env = process.env)`; team-start rule | 29075 |
| `plugin/hooks/lib/audit.mjs` | `guard-ask` added to `EVENTS` (the list documents events; it isn't enforced) | 9704 |
| `plugin/README.md` | Agent teams: team-start ask and auto-mode caveat; Audit log: "team-start asks" | 13171 |

No files were created. The previous build's file list is unchanged.

**The rule as built:** the tool is `Agent`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1'` in the hook's environment, `tool_input.name` is a non-empty string, `subagent_type` doesn't start with `agent-org:` (a missing type counts as non-agent-org), and `isolation` is absent, null or empty. When all of these hold, the guard returns `ask` with the spec's reason and audits `guard-ask` with `agent_type` set to the subagent type and flags `["team-start"]`. The rule needs no session state, so it also fires when state is unreadable. A `deny` from any other rule still wins.

## 4. Agent table
Unchanged from the 2e report: same models, tools and descriptions, and no deviations. This run didn't touch any agent file.

## 5. Enforcement gaps
Unchanged from 2e, plus one item:
- **Team-start ask (new, enforced by hook):** the user is asked before a non-agent-org agent starts a team. In auto mode an `ask` may not reach the user (documented in the README), and with the flag unset nothing is checked because no team can start. A team started any way other than a named `Agent` call isn't seen.

## 6. Verification results
The harness is the 2e `t.mjs`, copied into this session's scratchpad (not the repo), run as `node t.mjs plugin/hooks` with a throwaway `HOME`. It now also clears `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` at startup, so the calling shell's environment can't affect the results.

| # | Check | Result |
|---|---|---|
| 1 | `claude plugin validate ./plugin` → "✔ Validation passed"; `claude plugin validate .` → "✔ Validation passed" | PASS |
| 2 | `node scripts/sync-personas.mjs --check` → 14 × OK, "main: at pin", "production: local branch not found", exit 0 | PASS |
| 3 | escalate rows plus idempotence | PASS |
| 4 | session-start prints the rule card | PASS |
| 5 | guard v0.1 table; debug log has no command text or paths | PASS |
| 6 | `deliver` is the only skill without `disable-model-invocation: true` (`grep -L` → only `deliver`) | PASS |
| 7 | 14 agents with `name`/`description`/`tools`/`model`; no `inherit`, no `Agent` | PASS |
| 8 | `grep -rnE "/Users/\|/home/[a-z]\|secret=\|token=\|gs://\|s3://" plugin .claude-plugin scripts LICENSE` → no hits (exit 1) | PASS |
| 9 | claim-check Stop (all rows) | PASS |
| 10 | claim-check SubagentStop (all rows) | PASS |
| 11 | guard v0.2 rules: all earlier rows plus the v0.2f rows below | PASS |
| 12 | record.mjs | PASS |
| 13 | audit lib and audit-verify | PASS |
| 14 | session-start audit check | PASS |
| 15 | team-audit | PASS |
| 16 | Privacy: marker grep over `HOME` → 0 hits; **extended** with a team-start ask carrying the marker in `name`, `prompt` and `description`, debug on | PASS |
| 17 | Speed (ms): Stop 194, SubagentStop 144, session-start 393, guard 94, record 106, team-audit 107, audit-verify 360 | PASS |
| 18 | `hooks.json` (unchanged): events, matchers, timeouts, `"${CLAUDE_PLUGIN_ROOT}"` | PASS |

**v0.2f rows (spec rows first, then extras):**
| Case | Expected | Result |
|---|---|---|
| `Explore` with `name`, flag unset | no output | PASS |
| `Explore` with `name`, flag `1` | ask, "would start an agent team"; audit `guard-ask` `["team-start"]` | PASS |
| `general-purpose` with `name` and `isolation: "worktree"`, flag set | no output | PASS |
| `Explore` without `name`, flag set | no output | PASS |
| `agent-org:full-stack-developer` with `name`, flag set, no team approval | deny (team gate) | PASS |
| *extra:* the same with a team approval | no output | PASS |
| *extra:* no `subagent_type`, with `name`, flag set | ask | PASS |
| *extra:* flag `0` | no output | PASS |
| *extra:* state `null`, flag set | ask | PASS |
| *extra:* piped, flag in the hook's env | ask, exactly one `guard-ask` audit line | PASS |
| *extra:* piped, flag unset | no output, exit 0 | PASS |
| *extra:* piped with debug | ask; debug `rule: "team-start"` | PASS |

## 7. UNVERIFIED items for Phase 6
1. **Team-start ask live:** with the flag set, a named `Explore`/`general-purpose` dispatch from plain Claude gets the ask; approving starts a team and denying leads to an unnamed re-dispatch. Also check that the ask reaches the user in default mode, and what happens in auto mode (expected: it may not reach the user).
2. **Flag inheritance from settings `env`** into the hook process: P5 F2 says hooks inherit it, but this run checked it only through the piped env.
3. Carried over from 2e §7: B-1 hand-back flush order, B-3 wording in the checklist, V-4 `scratchpad_dir` live, V-1/V-7, the hook-objection line, the teammate checks, the `additionalContext` block form, the session-start `systemMessage`, whether the main thread follows `deliver`, and the `TaskCreated`/`TaskCompleted` payloads.

## 8. `docs/decisions.md`
No changes this run. D25–D30 and the D7 status line are already in place, and the D30 "Release check" sentence for the team-start ask landed in HEAD `04ddf1a`.

## 9. Open questions
1. **Version bump (D21).** The spec pins `version: 0.2.0`, but 0.2.0 has already been released (`reports/release-checklist-v0.2.0-2026-11-08.md`), and this run changes hook behavior. Installed copies won't pick it up without a bump. Should this ship as `0.2.1` together with the V21 backlog? I left it at `0.2.0` as the spec says.
2. **V21-2 overlap:** the backlog wants the specialist ask-list deny and the QA path deny audited as `guard-deny`. The team-start ask is now audited, but those two denies still aren't. Should they go into the same release?
