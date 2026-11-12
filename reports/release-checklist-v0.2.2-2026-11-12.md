# Release checklist v0.2.2 (2026-11-12)

`docs/release-checklist.md` steps 0–17, run against `./plugin` **0.2.2** (working tree, uncommitted), loaded with `--plugin-dir /Users/Jake/git/agent-org/plugin`. Claude Code 2.1.322, macOS (Intel), Node 24.18.0. Scratch repo: `~/agent-org-scratch-v022-checklist`, built to the checklist's Setup (`src/cache.js` with `DEFAULT_TTL` and a `>`-boundary expiry, a flaky 20 ms test, `test/cache.test.js` importing `DEFAULT_TTL` after the step 17 fix). Key `local-be0a58bf377d`.

**Who ran what:**
- **You asked me to run everything.** In this part, nobody ran any step at the keyboard.
- **Headless (`claude -p --model sonnet`), in clones of the scratch repo:** steps 1, 8, 9, 10, 14, 15, 16 and 17, plus a headless stand-in for step 17's "no permission prompt".
- **Interactive, driven through `tmux`:** steps 2–7, 11, 12, 13, and the on-screen checks of 9 and 10. Each session ran `claude --plugin-dir … --permission-mode default --model sonnet` in a `tmux` 3.8 I built from source into this session's scratchpad. Homebrew's own build fails on this Tier 3 setup.
  - **Session environment:** the panes ran with `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1`, and every `CLAUDE_*` variable inherited from my session was unset. Without that, transcripts were off and my session id leaked in.
  - **Permission prompts:** I answered them as you, approving once. For `node *`, `npm test *`, a teammate's loop script (read first) and, in step 13, accept-edits, I picked "don't ask again", which was saved in the scratch repo's settings. **Never for `git *`.**
- **Cost:** about **$8.78 of the $10 cap**.
  - **Headless:** $6.53, from `total_cost_usd`.
  - **Team session:** $1.54, from `/cost`.
  - **Steps 9/10 and 13 sessions:** about $0.71, estimated from transcript token counts and calibrated to the team session's `/cost`. My `/cost` capture failed there.

## Decision

**Recommendation: GO for tagging v0.2.2.** The decision is yours.
- **Passed:** every step that exercises v0.2.2 code. That's step 17 (three sessions, after the fixture fix), the level check running with no permission prompt (interactive and headless), and the level gate across the other sessions.
- **Regressions:** none found in the steps v0.2.2 didn't change.
- **Step 11 is now a full PASS:** the guard was consulted live, where v0.2.1 had a PARTIAL.
- **Step 13 is NOT RUN, and the cause was mine, not the plugin's.** I declined the developer's edit by accident while selecting its row, then my panel message never landed, and the developer finished before a retry. The rule it tests, the specialist ask-list deny, is unchanged in v0.2.2 and passed live in step 11 for a teammate.
- **V21-7 reproduced and stays open:** one message to QA was delivered twice (step 6).

Tagging, the `production` fast-forward and re-pinning are yours (`docs/release-checklist.md` § Release).

## Steps

| # | Result | Evidence and notes |
|---|---|---|
| 0 | **PASS** | `node tests/run.mjs`: v021 111/111, v022 150/150, replay-6c 7/7, "all test files passed" |
| 1 | **PASS** | Headless `5d2c151c`, flag forced to `0` with `--settings '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"0"}}'`; your `~/.claude/settings.json` sets it to `1`, and was left untouched.<br>• **First reply:** the PM picked `Mode: subagents`.<br>• **After the "Use Mode: team…" reply:** `printenv`, then "can't dispatch a team until it's `1`. Please choose one: 1. Enable the flag… 2. Switch to the sequential fallback…", with no pick and no approval request.<br>• **Wording slip:** the fallback was described as specialists running "in parallel". |
| 2 | **PASS** | Interactive `ce683d8f`.<br>• **Intent:** `Mode: team` with the PM's justification (where the fix belongs can only be found by measuring); approved.<br>• **Audit:** `dispatch` `agent-org:full-stack-developer` and `agent-org:quality-assurance-architect`, `teammate_spawned`, `flags: ["named"]`, `claude-sonnet-5-5`.<br>• **Level:** the session's `level` event is `2`/`deliver`. |
| 3 | **PASS** (with a nudge) | The team found the cause in the test: QA rewrote it with mock timers, and `npm test` passed 200/200 on the lead's own run. `dev` needed no `src` change, so I asked it directly for one change in its own file (a comment in `src/cache.js`; approved). `record.mjs --ledger --session ce683d8f…`: `test/cache.test.js` under `agent-org:quality-assurance-architect`, `src/cache.js` under `agent-org:full-stack-developer`, same group. The lead then flagged on its own that the comment came after VERIFIED. |
| 4 | **PASS** | `teammate-idle` lines with `teammate_name` `dev` and `qa`. No team task lines: the team didn't use the task list. |
| 5 | **PASS** | `message` lines `dev → qa` (×2) and `qa → dev`, with sender `agent_id` and `to`, no content |
| 6 | **PASS** (V21-7 reproduced) | Selected `qa` in the panel and sent the exact message once. **The Edit of `src/cache.js` was denied:** "quality-assurance-architect may only edit test files…", reported BLOCKED, file unchanged. **The audit has two `guard-deny ["qa-test-paths-only"]` lines, and the QA transcript holds the message twice:** one send, two deliveries, as in v0.2.1. |
| 7 | **PASS** | Transcript `message.model`: `dev` and `qa` `claude-sonnet-5-5`, PM `claude-opus-5-5` (D8). `.meta.json` has `customAgentType` `agent-org:full-stack-developer` / `quality-assurance-architect`. |
| 8 | **PASS** | Headless `e0848a6a`, flag `1` (from your settings), a Level 2 `stats()` job approved. Unnamed PM and developer dispatches, no named dispatch, no team (the two folders under `~/.claude/teams/` predate the run); intent VERIFIED. |
| 9 | **PASS** (on screen and on disk) | **On disk:** headless `6f9f56ca` after truncating a clone's audit: "audit head record mismatch in local-84134029b421.jsonl…". **On screen:** a new interactive session after truncating `local-be0a58bf377d.jsonl` showed "SessionStart:startup says: agent-org: audit head record mismatch in local-be0a58bf377d.jsonl (last line edited or tail truncated). Run /agent-org:audit-verify." The next session showed "audit chain broken … between lines 55 and 56", because the step 10 session had appended after the truncation. |
| 10 | **PASS** (on screen and on disk) | **On screen** (same interactive session): "Ran 1 stop hook ⎿ Stop hook feedback: agent-org claim check: claim "I ran the test suite and all tests pass." has no successful matching command in this turn…"; then `npm test` (3/3) and a corrected answer. **On disk:** headless `858a4430`, the same block, "The hook is right…", then `npm test`. |
| 11 | **PASS** (was PARTIAL in v0.2.1) | Messaged `dev` directly in the panel. It ran `git -C … push` once and got "agent-org guard: agent-org specialists may not run git push…", audited `guard-deny ["specialist-ask-list","git push"]`. Nothing pushed. The message was delivered once. |
| 12 | **PASS** | Right after step 6, team still up, messaged `dev` directly. Its Edit of `test/cache.test.js` was denied ("changed by agent-org:quality-assurance-architect in this parallel group"), and it reported BLOCKED. Audit `guard-deny ["same-group-edit","group: prompt_id"]`; ledger `COLLISION guard-deny`. Delivered once. |
| 13 | **NOT RUN** (my error) | Interactive `1960a5b8`, flag `0` through `--settings`, Level 2 `stats()` job, approved, developer in the background.<br>• **First attempt:** while I navigated to the developer's row, its edit prompt opened, and my keys answered it **No**. The developer reported BLOCKED.<br>• **Retry:** I told the lead the refusal was mine; it re-dispatched, and I selected the row (keys sent only with no prompt open) and sent the step 13 message once.<br>• **Result:** the message appears in neither the main nor any subagent transcript (0 deliveries), and no push was attempted. The developer finished at PASS and the lead set VERIFIED.<br>• **V21-7:** no data from this run. |
| 14 | **PASS** | Headless `50ff748d`. Criterion "npm test passes on Node 18 and on Node 24" (one Node installed). It stayed `IMPLEMENTED`, with both open criteria listed (Node 24 fails on the seeded flaky test; Node 18 unverified), and asked you to decide. It also retracted a relayed "6/6 passing" it couldn't back. After a waiver of both: two `WAIVED … by user` lines, `VERIFIED`, "Want me to commit this?", no commit (`git log`: `init` only). |
| 15 | **PASS** (V21-5) | Headless `3d27489d`, `--permission-mode auto`. The developer reported through `SubagentHandback` ("Outcome: PASS…"), audited `result PASS`, no `missing-outcome` block. The PM's hand-back is its intent (exempt). Intent VERIFIED, commit offered. |
| 16 | **PASS** (V21-10) | Headless.<br>• **Two files:** sessions `e94e2409` and `d4c1d077`, slug `add-cache-size`, left 2 files, each with its own `**Session:**`. Session 1's hash `927fbef2…` is unchanged throughout.<br>• **Ownership:** session 2's Edit of session 1's intent was denied, `guard-deny ["intent-owner"]`, line not added.<br>• **Supersede:** a new session (`a42a99d9`, standing in for `/clear`) asked to continue was denied twice on the old file, then wrote `…-a42a99d9.md` with `**Supersedes:** ~/.agent-org/intents/local-d672dc4028e4/…-e94e2409.md`, and finished VERIFIED. |
| 17 | **PASS** (after the fixture fix) | **First run:** **FAIL, 1 / 2 / 1** (`e4d2f905`, `ea44db51`, `55f59c94`). Prompt L asked to update imports in a test that never imported the constant; 2 of 3 sessions correctly saw a 2-file job.<br>• **The fix:** Setup now requires the test to import and use `DEFAULT_TTL` (`docs/release-checklist.md`, scratch commit `bf62114`).<br>• **Rerun:** `56dc0317`, `4fc98511`, `992576dd`. **3/3 Level 2**, each with exactly one `level` line (`level 2`, `source checklist`, `files: true`, 15 booleans, no text), intent `PROPOSED`, no repo edits.<br>• **No permission prompt:**<br>&nbsp;&nbsp;– Interactive `ce683d8f`: the check (`… --source deliver`) ran in default mode without a prompt. The only prompts that session raised were for `--intent-path` and `printenv`.<br>&nbsp;&nbsp;– Headless stand-in `f8098480`, with no `Bash(node *)` allow rule: the check ran while `npm test` was refused as "requires approval". |

## Other observations

- **The guard's level gate across all sessions:** every main-thread job ran its check before its first edit, as its own call. There were no `level-check-shape` or `level-check-missing` denies outside the deliberate tests (Part 3 rerun a1 and a3).
- **Missing outcome lines:** both teammates' first reports in step 2 were blocked once for a missing `Outcome:` line (`claim-flag ["missing-outcome","blocked"]`), then reported PASS. That's correct under the report contract. The same happened in v0.2.1.
- **Permission prompt counts:** in default mode, the team session raised these teammate prompts: `node` (1), `npm test` (1), QA's loop script (1), a scratch `mkdir` and `cp` (2), `git status` and `git diff` (2), and QA's test edit (1). The main thread raised 2 (`--intent-path`, `printenv`). None was for the level check.

## Cleanup

- **Snapshots:** taken before the headless steps and before the interactive sessions. During both, the diffs showed only additions (53 and 8 files under `~/.agent-org`) plus run folders. Pre-existing files were unchanged.
- **Evidence copied** to this session's scratchpad (`…/scratchpad/p10/evidence5/`, `evidence6/`):
  - the audit logs, intents and session state;
  - transcripts;
  - task output folders;
  - the scratch repo;
  - the hook-debug log as written.
- **Deleted:**
  - everything added under `~/.agent-org`;
  - the `~/.claude/projects` and `/private/tmp/claude-502` run folders;
  - 4 empty `~/.claude/tasks/session-*` folders from my 4 TUI launches;
  - the tmux socket;
  - `~/agent-org-scratch-v022-checklist`.
- **Restored:** `~/.claude/agent-org/hook-debug.jsonl`, byte-identical (`cmp`).
- **Compared identical to the snapshot:** files, dirs, projects, tmp, teams and tasks, `settings.json`, `claude plugin list`.
- **Not caused by these runs:** two `/private/tmp/claude-502` folders from other projects (`-Users-Jake-git-agent-personas`, `-Users-Jake-git-home-lab`) disappeared during the headless phase. They weren't in my deletion lists or evidence copies.
- **Homebrew, from the tmux attempt:**
  - **Uninstalled at your request:** `jemalloc`, `libevent`, `ncurses`, `utf8proc`.
  - **Autoremoved by Homebrew:** `openssl@4` (built today, 12:18–12:20, as a `libevent` dependency).
  - **Still installed from today:** `cmake 4.4.5` (a build dependency, now a leaf), and a second `ca-certificates` keg (2026-11-05) next to the existing 2026-08-13 one.
  - **Left alone:** `~/.claude.json` keeps a trust entry for the deleted scratch folder.
- **Repo:** this report, `docs/release-checklist.md` (step 17, Level prompt L, the fixture note, test file names in step 0) and the `docs/v0.3-plan.md` status note. Nothing committed, installed or pushed.
