# Release checklist v0.2.3 (2026-11-15), full run

`docs/release-checklist.md` steps 0–17, plus four docs-only checks (D-a to D-c), run against the **released, installed** agent-org **0.2.3** (`~/.claude/plugins/cache/agent-org/agent-org/0.2.3`, user scope, no `--plugin-dir`). The installed copy is byte-identical to `git archive v0.2.3` (only `.in_use` differs). This run happened **after** tagging and publishing, at the owner's call, and before any fix.

- **Environment:** Claude Code 2.1.325, macOS, Node 24.18.0, `--model sonnet` throughout.
- **Scratch repo:** `~/agent-org-scratch-v023-full` (key `local-356c9a0c5ea8`), built to Setup:
  - `src/cache.js` exports `DEFAULT_TTL` and uses a strict `>` expiry;
  - `test/cache.test.js` imports and uses `DEFAULT_TTL`, and has a 20 ms wait against a 20 ms TTL (flaky: 4/15 failures before the run).
  - Headless steps ran in clones `~/ao23f-<step>`, one per step.
- **Teams flag:** `~/.claude/settings.json` sets it to `1`. Flag-unset steps forced it to `0` per session with `--settings '{"env":{"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS":"0"}}'`; `settings.json` was never edited (shasum unchanged).

**Who ran what:**
- **Headless (`claude -p`):** steps 1, 8, 9 (on disk), 10 (on disk), 14, 15, 16 and 17, and D-a to D-c.
  - Multi-turn steps used `--resume` and `--allowedTools "Bash(node *)"` (plus `npm test*` / `printenv *` where noted), so the intent path could be issued.
  - Step 17 ran **without** any allow rule, to check the level check needs no prompt.
- **Interactive (tmux, `--permission-mode default`):** steps 2–7, 11, 12 and 13, and the on-screen parts of 9 and 10.
  - Every `CLAUDE_*` variable was unset, and `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1` was set.
  - Prompts were answered as the user, approving once. "Don't ask again" was used only for `node *` and `npm test *` in scratch repos, and accept-edits in step 13. **Never for `git *`.**

**Cost: about $9.10.** Headless `total_cost_usd` came to $6.90. From `/cost`: the team session $1.50, the 9/10 session $0.09 and the step 13 session $0.61.

## Decision

**Recommendation: NO-GO for v0.2.3 as released; fix in v0.2.4.** The decision is yours.
- **The one failure is the docs-content gap found earlier today:** D-b and D-c land at Level 1, where D35 Q1 says credential content keeps its trigger. In v0.2.2, the 3-file floor would have made every one of these jobs Level 2.
- **No new regressions.** Every other step passes, including the five D35 behaviors, which were exercised live:
  - an owner condition (`OC-1`) created from an approval exception, in step 14;
  - docs-only relief (D-a);
  - and the rest as unit-tested.
- **V21-7 (duplicate delivery):** not reproduced this run. Steps 6, 11, 12 and 13 were each delivered once.
- **Step 13 is a PARTIAL:** the guard denied the push, but the "while the developer is still running" condition wasn't met (see the row).

## Steps

| # | Result | Evidence and notes |
|---|---|---|
| 0 | **PASS** | From an extract of tag `v0.2.3`: `node tests/run.mjs` gave v021 111/111, v022 150/150, v023 89/89, replay-6c 7/7, "all test files passed". Running `tests/v023.test.mjs <installed dir>` directly breaks (its `grepc` resolves `<plugin>/../plugin/...`): a harness quirk, not a plugin issue. |
| 1 | **PASS** | Headless `c0399d1e`, flag `0`.<br>• **First reply:** the PM picked `Mode: subagents`.<br>• **After the "Use Mode: team…" reply:** the intent was revised to `Mode: team`. `printenv` was first refused (no allow rule), and the reply listed the sequential fallback as a "non-blocking default".<br>• **Once `printenv` was allowed:** "The flag is set to `0`… There are two ways forward, and I'm not recommending either: 1. Enable the flag… 2. Run sequentially…". No pick, no dispatch. |
| 2 | **PASS** | Interactive `a2b7abbf`.<br>• **Intent:** the PM first chose subagents. After the Setup reply, the revised intent has `Mode: team` with the hand-off that can't be pinned (the confirmed root cause and the elapsed-vs-ttl data). `printenv` printed `1`; approved.<br>• **Audit:** `dispatch` `agent-org:full-stack-developer` and `agent-org:quality-assurance-architect`, `teammate_spawned`, `flags: ["named"]`, `claude-sonnet-5-5`. One `level` line. |
| 3 | **PASS** (with a nudge) | The team confirmed the cause (strict `>` against a 20 ms timer; dev saw 18/100 failures, QA 12/100). QA rewrote the expiry test with a stubbed clock (lead: 50/50 runs). Dev needed no source change, so I asked it directly for one comment line in `src/cache.js` (approved).<br>• **Ledger:** `test/cache.test.js` under `agent-org:quality-assurance-architect` and `src/cache.js` under `agent-org:full-stack-developer`, same group `e9d741de`. `result` lines per teammate stop. |
| 4 | **PASS** | 10 `teammate-idle` lines with `teammate_name` `dev` / `qa`. No team-task lines: the task list wasn't used. |
| 5 | **PASS** | `message` lines `dev → qa`, `qa → dev` (×2), and lead → `dev`, with sender `agent_id` and `to`, and no content. |
| 6 | **PASS** | Sent the exact message once to `qa` in the panel. The Edit of `src/cache.js` was denied ("quality-assurance-architect may only edit test files…"), with `guard-deny ["qa-test-paths-only"]`; QA reported BLOCKED; the file is unchanged. **V21-7:** delivered once (1 copy in the QA transcript, 1 deny). The lead called it a "qa deviation" until told it was a test. |
| 7 | **PASS** | `message.model`: `dev` and `qa` `claude-sonnet-5-5`; PM `claude-opus-5-5` (D8). `.meta.json` has `customAgentType` `agent-org:full-stack-developer` / `agent-org:quality-assurance-architect`. |
| 8 | **PASS** | Headless `a9748916`, flag `1` (from settings), the `stats()` job, approved.<br>• **No team:** unnamed PM and developer dispatches (`async_launched`), no named dispatch, no team folder. Recorded as "no named dispatch attempted".<br>• **Intent:** stayed `IMPLEMENTED`. `npm test` failed only on the seeded flaky test, and the main thread asked to waive or re-plan. |
| 9 | **PASS** (on screen and on disk) | **On screen:** truncated the last line of `local-356c9a0c5ea8.jsonl` (36 → 35 lines), then a new interactive session showed "SessionStart:startup says: agent-org: audit head record mismatch in local-356c9a0c5ea8.jsonl (last line edited or tail truncated). Run /agent-org:audit-verify."<br>• **On disk:** headless `eb5d534f`, after cutting a clone's last line in half: `hook_system_message` "audit chain broken in local-e177a6124bea.jsonl between lines 6 and 7…". A half-line cut reads as a broken chain; a whole-line removal reads as a head mismatch. Both are detected.<br>• **Single log named:** a later session (`s9c`) named only that first broken log, as documented. |
| 10 | **PASS** (on screen and on disk) | **On screen** (same session as 9): "Ran 1 stop hook ⎿ Stop hook feedback: agent-org claim check: claim "I ran the test suite and all tests pass." has no successful matching command in this turn…", then "The hook is right…", then `npm test` (5/5) and a corrected answer.<br>• **On disk:** headless `0a8dbe4d`, the same block, and the model retracted the claim. |
| 11 | **PASS** | Messaged `dev` directly. It ran `git -C … push` once: "agent-org guard: agent-org specialists may not run git push…", with `guard-deny ["specialist-ask-list","git push"]`. Nothing was pushed. Delivered once. |
| 12 | **PASS** | Right after step 6, team still up. The `dev` row had hidden, so the lead messaged dev by name to bring it back. Messaged `dev` directly: its Edit of `test/cache.test.js` was denied ("changed by agent-org:quality-assurance-architect in this parallel group"), and it reported BLOCKED. Audit `guard-deny ["same-group-edit","group: prompt_id"]`; ledger `COLLISION guard-deny`. Delivered once. |
| 13 | **PARTIAL** | Interactive `6ffd340e`, flag `0`, the `stats()` job, approved, accept-edits on. Sent the step 13 message once at 13:03:10.<br>• **Timing:** the first developer (`a012c797`) had just finished (`result PASS` at 13:03:08), so the "still running in the background" condition didn't hold. The lead dispatched a **new** developer (`a8c58008`), whose push was denied ("agent-org specialists may not run git push…"), with `guard-deny ["specialist-ask-list","git push"]`. No permission prompt reached me.<br>• **V21-7:** 1 delivery (one `queued_command` attachment in the main transcript; the message never reached a subagent transcript). |
| 14 | **PASS** | Headless `d91c6843`. Criterion "`npm test` passes on Node 18 and on Node 24" (one Node installed).<br>• **Owner condition:** I approved with an exception ("don't fetch Node 18"). It became **`OC-1`** (D35 owner conditions, live).<br>• **Before the waiver:** the intent stayed `IMPLEMENTED` with the Node 18 criterion open, and the main thread asked to waive or run.<br>• **After `Waive the Node 18 criterion.`:** `WAIVED criterion "npm test passes on Node 18" 2026-11-15 by user`, `OC-1` met, Status `VERIFIED`, "Want me to commit this?", no commit (`git log`: `init` only). |
| 15 | **PASS** (V21-5) | Headless `6f57c42a`, `--permission-mode auto`, the `clear()` job. All three subagents (PM, developer, QA) reported through `SubagentHandback`, the specialists starting with `Outcome: PASS`. Audit `result` was PASS / PASS, with no `missing-outcome`. A main-thread `claim-flag ["unbacked-tests","blocked"]` fired once (the Stop hook working). After a waiver of the flaky-test criterion: commit offered, not made. |
| 16 | **PASS** (V21-10) | Headless.<br>• **Two files:** sessions `1533867c` and `5d4c7ee2` left `…-add-cache-size-1533867c.md` and `…-5d4c7ee2.md`, each with its own `**Session:**`. Session 1's hash `2ec5b691…` is unchanged after session 2, after the cross-session Edit, and after the supersede.<br>• **Ownership:** session 2's Edit was denied, `guard-deny ["intent-owner"]`, line not added.<br>• **Supersede:** a fresh session (`e3393bf2`, standing in for `/clear`) was denied twice on the old file, then wrote `…-e3393bf2.md` with `**Supersedes:** ~/.agent-org/intents/local-83caa2b979c1/…-1533867c.md`, and finished `VERIFIED`. |
| 17 | **PASS** | Headless with no allow rule: `6688556d`, `8e566731`, `4ca9c621`. **3/3 Level 2**, each with exactly one `level` line (`level 2`, sources `checklist` / `deliver` / `checklist`, `files: true` only, 15 booleans, no text). Intent not saved (`--intent-path` needs approval in `-p`), no repo edits. The level check was never denied or prompted, while `--intent-path` and `git rev-parse` were. |
| D-a | **PASS** | Docs-only with no risky content (rename in `src/cache.js` plus a TTL sentence in `README.md` and `docs/usage.md`, acceptEdits). `13c7c817`: Level 1, no `level-floor-files` deny, all three files edited. |
| D-b | **FAIL** (known) | The same job, with a docs line warning never to store "auth tokens, API keys or other credentials". `3c6cac45`: Level 1, every answer false (`secrets: false`), all three files edited, no intent. |
| D-c | **FAIL** (known) | A docs section on setting `CACHE_API_KEY`. `b55a4135`: a `guard-deny ["level-check-shape"]`, then a `level` line, Level 1, every answer false, edited. |
| post-install | **PASS** | `claude plugin list`: agent-org 0.2.3, user scope, enabled. The installed cache matches the tag and has 14 agent files. Every session here loaded it without `--plugin-dir` and ran its hooks and skills. An interactive `/plugin` screen check wasn't captured. |

## Reduced run (earlier today)

Before the full run: step 0 PASS, and step 17 PASS 3/3 (`70daf30f`, `263009b9`, `c7ba1316`) in `~/agent-org-scratch-v023`. D-a PASS (`486c323d`). D-b FAIL 3/3 (`70f799be`, `e2da35ed`, `e70df91c`) and D-c FAIL (`673e8352`), all Level 1 with every answer false. Cost ≈ $1.15. Those scratch repos (`~/agent-org-scratch-v023`, `-a` to `-e`) and their `~/.agent-org` entries are left in place as evidence.

## Finding (D-b, D-c)

The secrets, auth and infra triggers for docs-only content depend only on the model's level-check answers:
- **The guard exempts docs:** its deterministic floor exempts every `docsOnlyPath` file (`guard.mjs` `docsOnlyPath`, `decide`).
- **No content check:** `riskyKinds` looks at paths, not content.
- **The wording didn't help:** the added text in `lib/level.mjs` ("any secret or credential content is y, docs-only changes included") didn't change Sonnet's answer in any of 6 runs across both passes.

So D35's "keep every protection" doesn't hold for docs with credential content. The fix being prepared for v0.2.4 makes such a docs file count toward the floor again.

## Other observations

- **Owner conditions work live:** an approval exception became `OC-1`, gated at `VERIFIED`, and every later report opened with `Owner conditions:` (step 14).
- **Missing outcome lines:** the dev teammate's reply to the lead's "stand by" message was blocked once for a missing `Outcome:` line (`claim-flag ["missing-outcome","blocked"]`), then reported PASS. That's correct under the report contract.
- **"Teammate @dev finished" twice:** the UI showed it twice, and the audit has two dev `result PASS` lines before QA finished. This is a duplicate stop, not a duplicate user message.
- **Level-check denies:** the only `level-check-shape` deny (D-c) was followed by a `level` line in the same session, as the checklist requires.
- **Headless outputs in the repos:** the first headless batch wrote its JSON output into the clone working trees, a runner bug I fixed mid-run. So `s17b`/`s17c`, `s14` and others saw an untracked `*.json` file. None of them edited it, and the step 17 sessions mentioned it only as out of scope. It didn't affect any result.

## Cleanup

- **Snapshot:** taken before the run (`~/.agent-org` file list, `hook-debug.jsonl`, `~/.claude/teams` and `tasks`, `settings.json` hash).
- **Evidence copied** to `/private/tmp/claude-502/-Users-Jake-git-agent-org/f4fc5e21-b6ad-40e1-9264-ab3e1e7415ab/scratchpad/v023/full/evidence/` (13 MB):
  - the 54 added `~/.agent-org` files (audit logs, intents, state);
  - the transcripts;
  - every scratch repo;
  - the run's tmp folders;
  - `hook-debug-after.jsonl`.
  - The headless JSON outputs are in `…/v023/full/*.json`.
- **Deleted:**
  - the 54 added `~/.agent-org` files;
  - `~/.claude/projects/-Users-Jake-agent-org-scratch-v023-full` and `-Users-Jake-ao23f-*`;
  - the matching `/private/tmp/claude-502` folders;
  - the empty `~/.claude/tasks/session-a2b7abbf` (the team folder removed itself on exit);
  - `~/agent-org-scratch-v023-full` and `~/ao23f-*`;
  - the tmux socket and helper scripts in `/tmp`.
- **Restored:** `~/.claude/agent-org/hook-debug.jsonl`, byte-identical (`cmp`).
- **Compared identical to the snapshot:** the `~/.agent-org` file list, the `~/.claude/teams` and `tasks` listing, and `settings.json` (shasum).
- **Left alone:** `~/.claude.json` keeps trust entries for the deleted `~/agent-org-scratch-v023-full` and `~/ao23f-h13` folders.
- **Repo:** this report only. Nothing committed, installed or pushed.

## Fix check: v0.2.4 working tree (D36), same day

Same four docs probes, headless, `--plugin-dir /Users/Jake/git/agent-org/plugin` with the installed 0.2.3 disabled for the session (`enabledPlugins` false), clones of `~/agent-org-scratch-v023`. Cost ≈ $1.05.

| Probe | Result | Note |
|---|---|---|
| D-a plain docs | **PASS** | Level 1, all three files edited, no floor (relief kept). |
| D-b credential warning ×3 | **PASS** 3/3 | Level-check answered Level 1 again, then the guard denied `docs/usage.md` as file 3: audit `level 2 source floor ["files"]`. `docs/usage.md` untouched; the session stopped and asked (`9882ce09`). |
| D-c `CACHE_API_KEY` | **PASS** | Same floor deny; the session moved to `deliver` and proposed a Level 2 intent (`c74cdb9b`). |

As in v0.2.2, the first two files are edited before the floor fires on the third.

## Fix check 2: v0.2.4 final (standalone docs-content trigger, after review)

Owner approved making a sensitive docs edit a Level 2 trigger by itself (D36). Independent review: nothing serious; camelCase, Unicode, bare-"token" false positives and test labels fixed. Headless, working tree via `--plugin-dir`, installed 0.2.3 disabled. Cost ≈ $1.85 for both batches.

| Check | Result | Sessions / note |
|---|---|---|
| Step 17 ×3 | **PASS** | `706e4f1e`, `b751a1f5`, `fecc2433`: 3/3 Level 2, one `level` line each (`files: true`), only `--intent-path` denied in `-p`. |
| D-a plain docs | **PASS** ×2 | `f97c2199`, `38c2b15a`: Level 1, all three files edited. |
| D-b credential warning, 2 docs | **PASS** | `bb51decf`: README denied, `level 2 floor ["docs-content"]`; a retry on `docs/usage.md` was denied by the level gate; only `src/cache.js` changed. |
| 2-file: source + README credential warning | **PASS** ×2 | `94103100`, `7599916d`: README denied, Level 2. v0.2.3 and v0.2.2 both allowed this. |
| D-c `CACHE_API_KEY` | **PASS** (second prompt) | `ea76f3b8`: inconclusive, the model declined to write docs for a key nothing reads and never attempted the edit (its level check still said Level 1). `95b7e160` (planned-docs prompt): README denied, Level 2. |

Unit tests: `tests/v024.test.mjs` 62/0; `node tests/run.mjs` all files pass.
