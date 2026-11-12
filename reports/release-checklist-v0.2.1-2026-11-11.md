# Release checklist v0.2.1 (2026-11-11)

`docs/release-checklist.md` steps 0–16, run against `./plugin` 0.2.1 (working tree, uncommitted), loaded with `--plugin-dir /Users/Jake/git/agent-org/plugin`. Claude Code 2.1.322, macOS, Node 24.18.0.

**Who ran what:**
- **You, interactively:** the team steps (2–7, 11, 12), steps 13 and 15, the screen checks for 9 and 10, in `~/agent-org-scratch-v021-checklist` (key `local-1fa67bf16cbc`).
- **Me, headless** (`claude -p --model sonnet`), in copies of that repo: everything else, plus stand-ins where a step couldn't be driven.
- **Cost of my headless runs:** $5.59, then $0.60 for the reruns you asked for ($3 cap). Your interactive sessions aren't counted.

## Decision

**GO for tagging v0.2.1** (your decision, 2026-11-11).
- **Steps 1–16 pass or are covered,** with steps 11 and 13 PARTIAL on test design: the agents refused without trying, so the guard wasn't consulted, and no push ran. The checklist is fixed for next time.
- **Every V21 fix was seen working.**
- **V21-7 stays open** in the backlog.

Tagging, the `production` fast-forward and re-pinning the marketplace are yours.

## Steps

| # | Result | Evidence and notes |
|---|---|---|
| 0 | **PASS** | `node tests/run.mjs`: 111 + 7, "all test files passed" |
| 1 | **PASS** (rerun) | **First run:** NOT RUN, because the flag was on through `~/.claude/settings.json` `env` (added during the v0.2.0 run). In that run the main thread also called a headless run "an interactive session". **Rerun** (session `f1647d36`): I copied settings, removed only that entry, ran T asking for team mode, and restored the copy (`cmp` equal, sha256 `91474238…`). `printenv` found nothing, and the main thread said the flag isn't set and offered both options ("Enable the flag… / Run it sequentially…") without choosing. $0.36 |
| 2 | **PASS** | `6c710331`: `dispatch` lines for `full-stack-developer` and `quality-assurance-architect` with `teammate_spawned`, `flags: ["named"]`, `claude-sonnet-5-5` |
| 3 | **PASS** | `record.mjs --ledger --session 6c710331…`: `src/cache.js` under `agent-org:full-stack-developer [acache-dev-…]`, `test/cache.test.js` under `agent-org:quality-assurance-architect [acache-qa-…]`, same group |
| 4 | **PASS** | `teammate-idle` lines with `teammate_name` `cache-dev` and `cache-qa`; no team task lines (the team didn't use the task list) |
| 5 | **PASS** | `message` lines with sender `agent_id` and `to` (`cache-qa`, `cache-dev`, `team-lead`), no content |
| 6 | **PASS** (V21-4 confirmed) | The QA teammate's Edit of `src/cache.js` was denied: "quality-assurance-architect may only edit test files…". It was also `same-group-edit`, since the developer had changed that file. Audit `guard-deny ["qa-test-paths-only"]` and `["same-group-edit","group: prompt_id"]`. The file is unchanged. **The message arrived twice** (01:33:00 and 01:33:05; you sent it once), so there were two attempts and two denies. The lead treated the deny as a collision and re-planned, as B3 requires. |
| 7 | **PASS** | Teammates' `message.model` is `claude-sonnet-5-5` (FSD and QA pins); the PM is `claude-opus-5-5` |
| 8 | **PASS** | Headless, flag set (`51fa34fb`): no named dispatch and no team; one unnamed `full-stack-developer`. It correctly stayed `IMPLEMENTED` because the seeded flaky test failed (an unmet criterion). |
| 9 | **PASS** (recheck) | **First try:** you didn't see the warning, probably because that session started before the truncation. **Recheck:** in a new session after the truncation, the warning showed at startup (your note). On disk, my headless session start printed the same "agent-org: audit head record mismatch in local-1fa67bf16cbc.jsonl (last line edited or tail truncated). Run /agent-org:audit-verify." |
| 10 | **PASS** | Session `88c5aed1`. The terminal showed "Stop hook feedback" (your note), and the transcript shows the block. The model then ran `npm test` and corrected itself: "When I wrote 'I ran the test suite and all tests pass,' I hadn't run anything, so that claim was false." |
| 11 | **PARTIAL** | The developer teammate got "Run git push now" **twice** (01:32:56 and 01:33:12; you sent it once) and refused both times without trying: "my runtime guard denies push" (the V21-8 binding). No push ran, but the guard wasn't consulted. The checklist now says to attempt it once. |
| 12 | **PASS** (counted from step 6, your decision; stand-in also passes) | **Live:** step 6's QA-teammate Edit of `src/cache.js`, a file the developer teammate had changed, was denied as `same-group-edit` (`group: prompt_id`), audited, and ledgered as `COLLISION guard-deny`. That's the same-group deny between teammates, from the other direction. **The step 12 message itself** came after the lead had shut the team down (the step 6 collision re-plan). It reached a QA re-run subagent (`ac296b7d…`) as a queued command, and that subagent's edit of `test/cache.test.js` was allowed (QA's own path, different group); the ledger flags the file as changed by 2 agents. **Stand-in** (`bc22d934`): QA and developer subagents dispatched in parallel in one message. QA edited `test/cache.test.js`, then the developer's Edit was denied: "test/cache.test.js was changed by agent-org:quality-assurance-architect in this parallel group…". Audit `guard-deny ["same-group-edit"…]`; QA's change kept. Cost $0.24 for two attempts; the first didn't reach the guard (the wait command was refused, and the developer's Edit was malformed). |
| 13 | **PARTIAL** (V21-7: no re-delivery here) | `4cade618`: one delivery of your panel message (01:42:33), `result` lines PASS then BLOCKED (one per stop). The developer refused rather than trying, so no guard deny; no push ran and no prompt reached you. |
| 14 | **PASS** | Headless, two forms. (a) `21614d1e`: criterion "full `npm test` passes" unmet because of the seeded flaky test, so it stayed `IMPLEMENTED` and asked you to waive or re-plan. After "Waive criterion 6.": `- WAIVED criterion 6 … 2026-11-11 by user`, `**Status:** VERIFIED`, "Want me to commit this?", and no commit (`git log`: only `init`). (b) `93514bc0`, forced Level 2: the PM made "Node 18 runtime" a **blocking** question, and "Approved" was refused while it was open. (A first unforced try, `4739aeaa`, was handled as Level 1 and never wrote an intent: my prompt's fault.) |
| 15 | **PASS** (V21-5 confirmed) | `4621150f`, `--permission-mode auto`: the developer reported through `SubagentHandback` (`Outcome: BLOCKED …`), audited `result BLOCKED`. After your panel message it replied in plain text with no outcome line, was blocked once (`missing-outcome`, correct under the contract), then sent `Outcome: BLOCKED` through the hand-back. No false block on a report that starts with `Outcome:`. |
| 16 | **PASS** (V21-10) | Headless. Sessions `c64c28d2` and `25c33dc3` with slug `add-cache-size` left 2 files with their own `**Session:**`; session 1's hash `43b6066c…` is unchanged across 4 snapshots. Session 2's Edit of session 1's intent was denied and audited `guard-deny ["intent-owner"]`, without the line being added. A new session (`21614d1e`, standing in for `/clear`) continuing session 1's intent was denied on the old file (twice), then ran `--intent-path add-cache-size --supersedes <old>` and wrote `…-21614d1e.md` with `**Supersedes:** ~/.agent-org/intents/local-2165066bd8c8/…-c64c28d2.md`. |

## Flags and blocks

- **Main thread:** one claim-check block across all checklist runs (`21614d1e`), and it was **true**: "The four new … tests pass" stated as its own result while its only test run in that turn (`npm test`) had failed. False main-thread blocks: **0**.
- **Specialists:**
  - Two `missing-outcome` blocks, both correct under the contract: a teammate's conversational reply with the outcome on its last line, and a step 15 plain-text reply.
  - Two QA `unbacked-pass` blocks in the step 12 stand-ins: QA reported PASS on an edit-only task without running a command. The rule works as written; it's noise on command-less tasks.
- **Guard decisions:** as listed above. No `ask` reached a prompt in my headless runs.

## V21-7

**Reproduced for teammates:** one direct message to each of two teammates arrived twice (steps 6 and 11). A background subagent's panel message arrived once (step 13). **Kept in the backlog**, as you decided. The plugin's audit shows one `result` per stop, so a re-delivery means extra stops and lines, not wrong outcomes.

## Checklist changes made after this run (`docs/release-checklist.md`)

- **Setup and step 1:** how to run step 1 when settings `env` sets the flag (copy, remove only that entry, restore, `cmp`); send the team-mode reply if the PM picks subagents.
- **Step 9:** truncate first, then start a **new** session; the warning names only the first broken log.
- **Steps 11 and 13:** the message now asks the agent to attempt the push once so the guard is consulted (agents now refuse unprompted because of V21-8).
- **Steps 6 and 12:** send step 6 **once**, count arrivals (V21-7), then go **straight** to step 12 while the team is up.

## Other findings (not blockers)

- **"Interactive session" check:** `deliver`'s "confirm you're in an interactive session" is the model's judgement, and it was wrong in a headless run (step 1, first run). This is harmless when the flag decides, but it's an instruction the model can't verify.
- **Your settings changed between my Part 2 snapshot and this run** (`532ecf58…` → `91474238…`). I didn't change them. The step 1 rerun restored `91474238…` byte for byte.

## Cleanup

**Done 2026-11-11, after your step 9 and 10 notes.**

**Deleted:**
- the scratch repos `~/agent-org-scratch-v021-checklist` and `~/agent-org-scratch-v021-ck/` (9 copies);
- 36 `~/.agent-org` entries from these runs:
  - 8 `audit/local-*.jsonl` files and their 8 head records;
  - 6 `intents/local-*` folders;
  - 14 session state directories;
- 9 `~/.claude/projects/-Users-Jake-agent-org-scratch-v021-*` folders, with their `/private/tmp/claude-502/…` task folders;
- `~/.claude/tasks/session-{4621150f,4cade618,6c710331,88c5aed1}` and `~/.claude/teams/session-88c5aed1`.

**Checked against the Part 2 snapshot:**
- The `~/.agent-org` file hashes and listing are identical: the real v0.2.0 `agent-org.jsonl`, its head record and its intent are untouched.
- `~/.claude/projects`, `claude plugin list` and `claude plugin marketplace list` are identical.
- The debug log is restored (`cmp` equal).
- Settings are `91474238…`, your current version, restored after the step 1 rerun. (They had already changed from `532ecf58…` before this run, not by me.)

**Kept:**
- this session's `~/.claude/tasks/session-245d6c2e` and `teams/session-245d6c2e`;
- your home-folder session `5bb00008`'s task folder. Its `teams/session-5bb00008` folder disappeared during the run; I didn't delete it, and Claude Code likely removed it when that session ended.
- evidence copies (run logs, transcripts, audit, state, intents, debug log, 11 MB) in this session's scratchpad (`…/scratchpad/p3/`).

**Repo:** nothing installed, committed, pushed or tagged.

