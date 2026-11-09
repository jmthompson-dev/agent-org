# Phase 8: Memory value test for v0.3 (2026-11-09)

Claude Code 2.1.319, macOS (Darwin 25.6.0, local time zone America/Denver), Node 24.18.0. Installed `agent-org@agent-org` 0.2.0 (user scope) was active in every run. 60 headless sessions with `--model sonnet` cost **$13.20** in total: Stage 1 $8.29 (30 sessions), Stage 2 $4.91 (30 sessions). The only repo file written is this report.

## 1. Verdict

- **A correct lesson helped on one fixture of three.** On (a), the time-zone quirk, it cut median turns from 9 to 5 and the trap rate from 5/5 to 0/5. On (b) and (c), None never hit the trap (0/10) and the pass rate was 5/5 in every arm, so the lesson had nothing to fix. That's below the bar of two out of three fixtures.
- **Auto memory got none of the gain.** It was on, but in 15 seed sessions it wrote **nothing** (0 files). The (a) benefit sessions hit the trap 5/5 with median turns of 10, the same as None at 9.
- **Recommendation: drop memory from v0.3.** You ran Stage 2 after the Stage 1 stop on your go-ahead.

## 2. Fixture checks

The fixtures live in the session scratchpad (`…/scratchpad/08/fixtures/{a,b,c}`). Each is a git repo with tags `seed` and `benefit`. The `benefit` tag is the state after a correct seed task, and Stage 1 used it. "Accept" is a hidden acceptance test kept outside the repo. `accept.sh` copies the repo and restores the original tests from the tag. It then adds the hidden test and runs the fixture's own command (for (a) that's `TZ=UTC node --test`), and its exit code is the outcome.

| Fixture | Trap | Naive attempt | Lesson attempt | Base, unchanged |
|---|---|---|---|---|
| **(a) `shiftcal`**: CI sets `TZ: UTC` (`.github/workflows/test.yml:7`); `src/dates.js` uses local getters; tests use UTC timestamps | run tests without `TZ=UTC` | correct fix, then `env -u TZ npm test` → **exit 1** (pass 2, fail 6) | same fix, `TZ=UTC npm test` → **exit 0** (8/8); accept → **0** | `TZ=UTC npm test` → 0; local → 1; accept → **1** |
| **(b) `stockroom-api`**: `test/conventions.test.js:16-17` rejects `new Error/TypeError/RangeError` and hand-built 4xx/5xx in `src/routes` | plain error | `throw new Error` → `npm test` **exit 1**, accept **1**. Hand-built `{status: 400}` → **exit 1**, accept **1** | `AppError` → `npm test` **exit 0**, accept **0** | `npm test` → 0; accept → **1** |
| **(c) `orderbook`**: `src/gen/schema.js` is built by `npm run gen`; `test/gen-check.test.js:9` compares it with the generator output | hand edit to the generated file | a hand edit to `src/gen/schema.js` *works at runtime* (validate check exit 0), but `npm test` → **exit 1** and accept → **1**. `npm run gen && git diff --quiet` → **0**: the edit is wiped | edit `schema/records.json`, then `npm run gen` → 0; accept → **0**. `npm test` → 1, because the old `missing and extra fields` expectation must be updated for the new required field, as intended | `npm test` → 0; accept → **1** |

**Lessons (M6 format).** Each lesson is in `…/scratchpad/08/memroot/projects/<repo>/`, outside the repo:
- **(a) `test-runner`:** evidence `afcf9d3 .github/workflows/test.yml:7`
- **(b) `error-handling`:** evidence `3ee0eff test/conventions.test.js:16`
- **(c) `generated-code`:** evidence `ab24932 test/gen-check.test.js:9`

**Delivery (Seeded).** `--settings <scratch>/probe/settings-<repo>.json` adds a probe `SessionStart` command hook. It emits `additionalContext`: a header ("agent-org memory index … notes are leads, not facts: re-verify…") plus the one-line `INDEX.md` entry and the absolute path to the note. The injected text appeared in the stream of all 15 Seeded runs and none of the 15 None runs.

**Prompts.** These were identical in both arms, and the `escalate.mjs` hook gave no nudge for any of them:
- **(a)** "formatDay prints 2024-03-5 for March 5th, it should be 2024-03-05. Can you fix that?"
- **(b)** "Add POST /items/:id/adjust that takes { delta } and changes the item's qty. Reject a delta that isn't an integer, or one that would take qty below zero."
- **(c)** "Products need a required sku field, a string."

**Run setup.** Every run used the same command:

```
env -u TZ ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
claude -p "<prompt>" --model sonnet --output-format stream-json --verbose --permission-mode default \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' --max-budget-usd 3 --max-turns 60 \
  --allowedTools Read Grep Glob Skill Agent "Edit(/**)" "Write(/**)" "Bash(npm test*)" "Bash(npm run *)" \
    "Bash(node --test*)" "Bash(node *)" "Bash(TZ=UTC npm test*)" "Bash(TZ=UTC node *)" "Bash(TZ=UTC npm run *)" \
    "Bash(git status*)" "Bash(git diff*)" "Bash(git log*)" "Bash(git show*)" "Bash(git rev-parse*)" \
    "Bash(ls *)" "Bash(cat *)" "Bash(printenv *)" \
  [--settings <probe settings>]   # Seeded only
```

- **Repos:** each run got a fresh `git clone` of the fixture at `runs/s1-<f>-<arm>-<n>/<repo>`, checked out at `benefit`, with `origin` removed.
- **Order:** interleaved (n = 1..5 × a, b, c × none, seeded).
- **Level 2 stops:** a run that loaded `agent-org:deliver` and ended asking for approval was resumed with "Approved. Go ahead." (at most twice; one resume was always enough).
- **Checks:** every `init` showed `claude-sonnet-5-5`, `mcp_servers: []`, agent-org 0.2.0 from the plugin cache, and `permissionMode: default`.

## 3. Results

Every number comes from the run's `result` objects (`total_cost_usd`, `num_turns`) or from the `accept.sh` exit status.
- **Cost:** a run's cost is the largest `total_cost_usd` in its `result` events.
- **Turns:** a run's turns are the sum of `num_turns` over all its `result` events.
- **Trap:** taken from the tool calls in the main stream and in every subagent transcript (`~/.claude/projects/<slug>/<sid>/subagents/*.jsonl`).
- **Level 2:** the run loaded `agent-org:deliver`.

| Fixture | Arm | Pass | Trap hit | Level 2 | Turns: median (range) [runs 1–5] | Cost: median (range) | Agents per run |
|---|---|---|---|---|---|---|---|
| (a) | None | **5/5** | **5/5** | 0/5 | **9** (8–14) [9, 8, 12, 14, 8] | **$0.092** ($0.080–0.113) | 0 |
| (a) | Seeded | **5/5** | **0/5** | 0/5 | **5** (5–5) [5, 5, 5, 5, 5] | **$0.061** ($0.061–0.070) | 0 |
| (b) | None | 5/5 | 0/5 | 5/5 | 19 (18–26) [19, 21, 26, 19, 18] | $0.479 ($0.462–0.521) | 2 each |
| (b) | Seeded | 5/5 | 0/5 | 4/5 | 19 (12–28) [28, 12, 19, 18, 28] | $0.469 ($0.127–0.511) | 2, 0, 2, 2, 2 |
| (c) | None | 5/5 | 0/5 | 3/5 | 19 (8–20) [19, 11, 19, 20, 8] | $0.363 ($0.082–0.398) | 2, 0, 2, 2, 0 |
| (c) | Seeded | 5/5 | 0/5 | 4/5 | 19 (7–24) [23, 24, 19, 18, 7] | $0.394 ($0.083–0.428) | 2, 2, 2, 2, 0 |

**Agents dispatched in total:** 16 `agent-org:principal-project-manager` and 16 `agent-org:full-stack-developer`, one of each per Level 2 run. There were no QA or other dispatches.

**Detail behind the table:**
- **(a) None.**
  - **Tests without `TZ=UTC`:** 2–7 runs per session; test runs in total were [3, 4, 6, 8, 2].
  - **Finding `TZ=UTC` alone:** four of five runs eventually ran `TZ=UTC` themselves (1, 1, 1, 2 times; run 5 never did).
  - **Final reports:** runs 1–3 reported correctly that the failures were time-zone failures and pass under UTC. Run 4 said it "haven't confirmed" whether its change caused the six failures. Run 5 reported "one failure … I don't think my change caused it".
  - **Code:** every run changed only `src/dates.js`.
- **(a) Seeded.** Every run made exactly one test run, `TZ=UTC npm test`. No run opened the note file: the one-line index entry was enough.
- **(b) Seeded.** 3/5 runs read the note. None of the (c) Seeded runs read it.
- **(b) and (c) traps.** No Edit or Write in any run, main or subagent, touched `src/gen/schema.js` or added a plain error or a hand-built 4xx. Every match on `src/gen/schema.js` was a `head`, `cat` or `git diff`.

## 4. Noise

**Level choice.** Within an arm, the main source of spread is the level agent-org picks for the same prompt:

| | Cost | Turns |
|---|---|---|
| Level 1 runs (5 of 30) | $0.082–0.127 | 7–12 |
| Level 2 runs (16 of 30) | $0.363–0.521 | 18–28 |

That's about 4× in cost and 2–3× in turns. The split was 5/5 vs 4/5 Level 2 on (b) and 3/5 vs 4/5 on (c), so the medians and ranges on (b) and (c) are set by which level each run landed on, not by the lesson.

**Counts as a difference:**
- **(a) turns:** the Seeded range (5–5) and the None range (8–14) don't overlap.
- **(a) trap:** 5/5 vs 0/5.
- **(a) cost:** the Seeded maximum ($0.070) is below the None minimum ($0.080).

**Doesn't count:**
- **(b) and (c):** identical medians (19 vs 19). The ranges cover each other, the pass rate is 5/5 everywhere, and the trap rate is 0/5 everywhere.
- **Turns within one level:** the Level 2 runs on (b) (18–28 in both arms) and (c) (18–24) still overlap completely.

**Measurement caveat (G2).**
- **Two `result` events per invocation:** each Level 2 invocation emits two, because the session resumes when the background agent finishes.
- **Cost only partly updates:** within one process, the second event repeats the first event's `total_cost_usd` even though more output tokens were used. For example, s1-b-none-1 shows $0.3114 twice, then $0.4769 twice after the resume.
- **Impact:** the last segment of each process may be under-counted by a few cents. It hits Level 2 runs in both arms equally, and (a) (all Level 1, one segment) not at all.

## 5. Auto memory (Stage 2)

You ran this stage after the Stage 1 stop ("run it").

**Fixture checks, seed state:** the trap catches a naive attempt and the lesson avoids it. Log: `fixture-checks.log`, section "SEED STATE".

| Fixture | Base | Naive attempt | Lesson attempt |
|---|---|---|---|
| (a) | local `npm test` → exit 1 (fail 7); `TZ=UTC` → exit 1 (fail 1, `startOfWeek`); accept → 1 | after the fix, local → **exit 1** (fail 6) | after the fix, `TZ=UTC` → **exit 0**; accept → 0 |
| (b) | accept → 1 | `GET /items/:id` with `throw new Error` → `npm test` **exit 1**, accept **1** | with `AppError` → exit 0, accept 0 |
| (c) | accept → 1 | hand edit to `src/gen/schema.js` → `npm test` **exit 1** (`differs from npm run gen output`), accept **1** | `records.json` plus `npm run gen` → exit 0, accept 0 |

**Setup.** Same command as §2, except:
- **Environment:** `CLAUDE_CODE_DISABLE_AUTO_MEMORY` was not set, and there was no probe hook.
- **Seed session:** a fresh clone at tag `seed`, with the seed prompts:
  - **(a)** "startOfWeek is supposed to return the Monday but it's giving me Sunday. Can you fix it?"
  - **(b)** "Add GET /items/:id that returns the item, or a 404 if it doesn't exist."
  - **(c)** "Customers should be able to have an optional phone number (string)."
- **Between sessions:** a copy of `~/.claude/projects/<slug>/memory/`, then a `git commit -m "seed task"` of the seed work (standing in for the user accepting it).
- **Benefit session:** a new session at the **same path** with the §2 benefit prompt.
- **Acceptance:** benefit acceptance restored the protected tests from `seed`, not `benefit`, because the model's own seed tests may differ from mine.

**Auto memory was on.** Each Stage 2 `init` event has `memory_paths.auto = ~/.claude/projects/<run slug>/memory/`. The Stage 1 `init` events (auto memory disabled) have no `memory_paths` field.

**What auto memory wrote: nothing.**
- **Files:** in all 15 pairs, the folder existed after the seed session with **0 files**, and it still had 0 files after the benefit session.
- **Tool calls:** no session made an Edit or Write call under that folder.
- **Comparison with the lesson:** there was no match, because there was nothing to compare.

| Fixture | Task | Pass | Trap hit | Level 2 | Turns: median (range) [runs 1–5] | Cost: median (range) | Agents |
|---|---|---|---|---|---|---|---|
| (a) | seed | 5/5 | 5/5 | 0/5 | 13 (12–14) [12, 13, 14, 13, 13] | $0.115 ($0.113–0.125) | 0 |
| (a) | **benefit** | 5/5 | **5/5** | 0/5 | **10** (9–12) [10, 12, 9, 11, 10] | **$0.098** ($0.090–0.106) | 0 |
| (b) | seed | 5/5 | 0/5 | 0/5 | 14 (13–15) | $0.117 ($0.111–0.118) | 0 |
| (b) | benefit | 5/5 | 0/5 | 3/5 | 19 (11–22) [22, 11, 15, 20, 19] | $0.408 ($0.120–0.518) | 2, 0, 0, 2, 2 |
| (c) | seed | 5/5 | 0/5 | 1/5 | 13 (7–19) | $0.106 ($0.092–0.394) | 2, 0, 0, 0, 0 |
| (c) | benefit | 5/5 | 0/5 | 1/5 | 13 (6–19) [19, 14, 13, 6, 13] | $0.108 ($0.076–0.404) | 2, 0, 0, 0, 0 |

- **(a), the one fixture where a lesson helped:**

  | Arm | Turns, median (range) | Trap | Cost, median |
  |---|---|---|---|
  | Auto benefit | 10 (9–12) | 5/5 | $0.098 |
  | Stage 1 None | 9 (8–14) | 5/5 | $0.092 |
  | Stage 1 Seeded | 5 (5–5) | 0/5 | $0.061 |

  Auto overlaps None and is clearly worse than Seeded. Each (a) benefit run made 2–5 test runs without `TZ=UTC`.
- **(b) and (c):** the trap rate was 0/5 in the seed **and** the benefit sessions. In the (b) seed sessions, Sonnet used `AppError` with no example in `src/routes`, from `src/errors.js` and the conventions test alone. So the seeding tasks never "surfaced" a lesson for memory to keep.
- **Detector correction:** my analyzer flagged two (c) runs (s2-c-auto-1 seed, s2-c-auto-4 benefit) as "bash write" on `src/gen/schema.js`. Both commands are read-only `cat … src/gen/schema.js …` lines, and the `>` the regex matched belongs to an output redirect. Neither run edited the file, so both count as no trap above.
- **Comparability caveat:** Stage 2 benefit runs differ from Stage 1 None in more than auto memory. They ran later, and on a repo whose seed change the model wrote and I committed. The (b) benefit Level 2 rate was 3/5 vs 5/5 in None, and (c) 1/5 vs 3/5. So (b) and (c) cost differences between stages reflect level choice, not memory, which wrote nothing.

## 6. Recommendation

**Drop memory from v0.3.**

- **Fixture (b), project convention: no gain.** None hit the trap 0/5 times. In the benefit state, `GET /items/:id` already throws `AppError`, and Sonnet copied it. The test-enforced convention was discoverable from the code, so a lesson saying the same thing changed nothing measurable.
  - **Turns:** median 19 vs 19.
  - **Cost:** $0.479 vs $0.469.
- **Fixture (c), generated file: no gain.** Again 0/5 trap hits in None. The runs read `package.json` (`"gen"`), the file's "Built from schema/records.json by scripts/gen.js" header and `gen-check.test.js` before editing.
  - **Turns:** median 19 vs 19.
  - **Cost:** $0.363 vs $0.394.
- **Fixture (a), environment fact not visible in the code: a real gain, but a small one.** This is the case memory is for.
  - **Turns:** −4 median.
  - **Cost:** −$0.031 median.
  - **Trap:** 5/5 → 0/5.
  - **Reports:** none uncertain, vs 2/5 uncertain in None.
  - **Outcome:** unchanged at 5/5.
  - **What would buy it more cheaply:** the same one-line fact in `CLAUDE.md`, or auto memory if it captures it (Stage 2 would show that). Either way, no filing machinery is needed.
- **v0.3's cost is out of proportion.** The plan's M1–M12 would add a capture contract, two screens, a detached filer with a lock, a review join, a search skill (a D14 exception), loading, archive and a toggle. That's the most complex module so far. The only measured benefit it could deliver is the (a) one, which a static line also delivers.
- **Level choice matters more than memory.** It moved cost 4× within one arm (§4); memory moved it 0–34%. Making the level choice more consistent (the same prompt went Level 1 in some runs and Level 2 in others on (b) and (c)) looks like a better use of v0.3 effort than memory.
- **Auto memory doesn't fill the gap either (Stage 2).**
  - **What it wrote:** 0 files across 15 seed sessions.
  - **Effect on (a):** benefit trap 5/5, median 10 turns, so no gain over None.
  - **What this means:** the one useful kind of lesson, an environment fact not visible in the code, is the kind that neither the model nor auto memory recorded without being asked. That argues against the plan's premise that a specialist would emit it as a `lessons:` block either: this was never tested, and in (a) none of the 10 None and Auto runs dispatched a specialist at all, since all were Level 1.
- **If you still want something:** the most I'd keep is a documented convention, not code. The rule card would say "when a test depends on the environment (time zone, locale, env vars), add one line to the repo's `CLAUDE.md`". That would deliver the (a) gain, which Seeded showed is real, at zero machinery cost. It's untested here.

**Side finding for the v0.2.1 backlog (V21-9).** All 30 runs used three repo basenames, so their intents shared `~/.agent-org/intents/<repo>/`.
- **Name collisions:** 16 Level 2 runs left only 5 intent files. Same-day intents with the same slug (for example `2026-11-09-adjust-item-qty.md`, written by 6 runs) were **overwritten blind**. The main thread's `Write` succeeded with no prior `Read` and no "modified since read" refusal.
- **Leaks:** no run read an older run's intent. In each run, the developer subagent read only the content its own main thread had just written, and no Glob or Read touched the directory otherwise.
- **The defect:** two concurrent sessions in same-named repos, or the same repo, would silently clobber each other's intent and approval record. That's more than the audit-log merge V21-9 records.

## 7. Cost

| Stage | Estimate | Actual | Stop-and-ask threshold |
|---|---|---|---|
| Fixture build and checks | $0 | $0 (no model calls) | — |
| 1: None vs Seeded (30 sessions) | ≈ $15 (range $8–28) | **$8.29**: None $4.22 ((a) 0.47, (b) 2.44, (c) 1.31); Seeded $4.07 ((a) 0.31, (b) 2.06, (c) 1.70) | $22.50, not reached |
| 2: Auto (15 seed + 15 benefit sessions) | ≈ $15 (range $8–30) | **$4.91**: seeds $1.96 ((a) 0.59, (b) 0.58, (c) 0.80); benefits $2.95 ((a) 0.49, (b) 1.66, (c) 0.80) | $22.50, not reached |
| **Total** | ≈ $30 | **$13.20** | |

Model split, for example in s1-b-none-1: the PM ran on Opus, per its D8 pin ($0.128 of $0.477); the main thread and developer ran on Sonnet.

## 8. Cleanup and isolation

**Evidence kept.** Everything below was copied to the session scratchpad before deletion (`…/scratchpad/08/evidence/s1/`, 16 MB):
- the 30 `~/.claude/projects` session folders, with subagent transcripts
- the 30 `/private/tmp/claude-502/<run slug>` task-output folders
- the 55 files the v0.2 hooks wrote under `~/.agent-org`

Also kept: the fixtures, `runs/` (stream-json, stderr, accept results), `s1-results.jsonl`, `fixture-checks.log`, the probe hook and the notes. They're outside the repo and go away with the session.

**Deleted:**
- **`~/.claude/projects/`:** 30 `-private-tmp-claude-502-…-scratchpad-08-runs-s1-*` folders. They held no `memory/` directory: auto memory was disabled in all 30.
- **`/private/tmp/claude-502/`:** 30 `-private-tmp-claude-502-…-scratchpad-08-runs-s1-*` folders.
- **`~/.agent-org/`:** exactly the 55 files absent from the pre-run snapshot (`find ~/.agent-org -type f | shasum`):
  - `audit/orderbook.jsonl` and `audit/stockroom-api.jsonl`
  - `state/audit-orderbook.head` and `state/audit-stockroom-api.head`
  - 5 intents under `intents/orderbook/` and `intents/stockroom-api/`
  - 46 `state/<sid>/{state.json,ledger.jsonl}` files (30 sessions)
  - then 32 now-empty directories newer than the snapshot (30 `state/<sid>` plus the 2 `intents/<repo>`)

**Stage 2.** The same procedure ran after Stage 2. Evidence is in `…/scratchpad/08/evidence/s2/`, plus each pair's `runs/s2-*/automem-after-{seed,benefit}/` copy, which is empty.
- **Diff:** the `~/.agent-org` diff again showed only additions.
- **`~/.agent-org/`:** deleted 43 new files: the same two audit logs and two heads, 3 intents (`orderbook/2026-11-09-add-product-sku.md`, `orderbook/2026-11-09-customer-optional-phone.md`, `stockroom-api/2026-11-09-adjust-item-qty.md`) and 36 `state/<sid>` files. Then deleted 33 now-empty directories newer than the snapshot.
- **`~/.claude/projects/`:** 15 `…-runs-s2-*` folders, **each including its auto memory folder** (`memory/`, empty).
- **`/private/tmp/claude-502/`:** 15 `…-runs-s2-*` task folders, plus `cache-break-state-197cbb6e-….json`. That file is from session `197cbb6e` (the s2-a-auto-5 seed session); it was copied to the evidence folder, then deleted.

**Checked afterwards:**
- **`~/.agent-org`:** after each stage, the file list and sha1s are **identical to the pre-run snapshot**: `audit`, `backups`, `intents/agent-org`, and `state` with the same 3 sessions plus `audit-agent-org.head`. The diff showed only additions during the runs, so no pre-existing file was changed.
- **`~/.claude/projects` and `/private/tmp/claude-502`:** the listings equal the baseline.
- **`~/.agent-org/memory/`:** never created (checked before the runs and after cleanup).
- **`~/.claude/settings.json`:** untouched (mtime Nov 8 19:49).
- **`~/.claude/agent-org/hook-debug.jsonl`:** untouched (mtime Nov 8 18:16); `AGENT_ORG_HOOK_DEBUG` was not set.

**Not used:**
- **Probe loading:** the probe was loaded only through `--settings` with a scratch file. Nothing used `--dangerously-skip-permissions` or `bypassPermissions`.
- **`AGENT_ORG_HOME`:** v0.2 doesn't support it. `orgDir()` is `os.homedir()/.agent-org` in `plugin/hooks/lib/state.mjs:16`, which is why the snapshot-and-diff above was used.

**This repo:** only this report was added. Nothing was committed, pushed or tagged.
