# Phase 3b — Targeted revalidation report (2026-11-07)

Claude Code 2.1.319, macOS. Main thread on `claude-sonnet-5-5`. Plugin `agent-org` 0.1.0, read live from `/Users/Jake/git/agent-org/plugin` (`claude plugin list` → `Read from:`). The Phase 3 fixes are committed in `f666d8f`, not uncommitted as the prompt assumed. The live read makes that irrelevant.

## 1. Summary

| Phase 3 failure | Fixed? | Basis |
|---|---|---|
| F1: intent path unwritable | **Yes** | R2a, R2b and R5 saved intents under `~/.agent-org/intents/agent-org-scratch-20261107b/`. R3 edited the file in place three times. No sensitive-file denials. |
| F2: implemented without a saved intent | **Yes** | R4′: the save failed, the main thread stopped and showed the intent. R4b: "Approved." without a waiver produced no implementation; it asked for a fix or an explicit waiver. |
| F3: Level 1 skips plan line and tests | **Partial** | Tests ran in 2/2 runs. `Plan:` came before the first `Edit` in only 1/2 (R1b wrote it after the edit and said so). |
| F4: nudge fires on every subagent report | **Yes** | All 7 task-notification prompts logged `notification: true, groups: []`. No transcript has a nudge on a notification turn. |
| F5: PM uses role names instead of ids | **Partial** | The `agent-org:<id>` format held in every PM draft. But in 3/5 PM runs the PM **invented** ids (`software-engineer`, `senior-software-engineer`, `security-engineer`) because it's never given the roster. The main thread replaced them with real ids every time, so every **saved** intent had valid ids. |

New issue: the **blocking-question rule (D6) leaks**. In R4′ and R5 the main thread asked the blocking questions and for approval in the same message. In R4b it took a bare "Approved." as answering a `[BLOCKING]` question with its recommended option.

## 2. Hook unit check

| Input piped to `plugin/hooks/escalate.mjs` | Output | Expected |
|---|---|---|
| `{"prompt":"<task-notification> auth migration deploy done"}` | none, exit 0 | none ✔ |
| `{"prompt":"add auth middleware"}` (control) | `additionalContext` "escalation triggers matched (auth)…" | nudge ✔ |

Preconditions: `sync-personas --check` → 14 × OK, `main: at pin` (`6d13ca6`). `plugin details agent-org` → 14 agents, 5 skills, 2 hooks.

## 3. Results

**Scratch repo:** `~/agent-org-scratch-20261107b`, base `eb619f5`. It had the same files and deliberate defects as Phase 3: `mesage` in `src/greet.js`, a one-route `node:http` server, `node --test`, and the README typo "peple". It was reset with `git reset --hard eb619f5 && git clean -fd` before every new session.

**Every run:** `claude -p … --model sonnet --output-format stream-json --verbose --max-turns N`, with `AGENT_ORG_HOOK_DEBUG=1`. The debug log was cleared before each run and copied after.
- **`--allowedTools`:** the Phase 3 set, `Read Grep Glob Skill Agent Edit Write Bash(npm test*) Bash(node --test*) Bash(git rev-parse*) Bash(git status*) Bash(git branch*) Bash(git log*) Bash(git diff*) Bash(date*)`.
- **`--add-dir ~/.agent-org`:** R1, R2, R3 and R5. Not R4/R4b.
- Only `~/.agent-org/` was pre-created. `intents/` was deleted before every new session, so each save had to create the directory.

| # | Result | Session | Debug log (groups / notification) | Tool calls, in order (`[sub]` = subagent) | Evidence / notes |
|---|---|---|---|---|---|
| R1a | **PASS** | `75be5f90` | `[]` / false | Read greet.js → *text "Level 1 change. Plan: rename `mesage` to `message`…"* → Edit greet.js → Bash (ls; grep test script) → Bash `npm test` | Plan before edit; `npm test` 1/1 pass reported. No Agent, no Skill. |
| R1b | **FAIL** (partial) | `33f85ead` | `[]` / false | Read → **Edit greet.js** → *text "Plan: …  I should have written this line before the edit, not after."* → Bash (ls; grep) → Bash `npm test` | Tests ran and were reported (1/1). `Plan:` came **after** the edit. No Agent, no Skill. |
| R2a | **PASS** | `aad66bed` | `[auth]` / false typed; `[]` / **true** on PM report | Skill `agent-org:deliver` → Bash (rev-parse, branch, cat) → Agent `agent-org:principal-project-manager` → `[sub, opus]` Read, Glob, Read, Read, Glob → *(notification turn)* → Bash `mkdir -p ~/.agent-org/intents/…` (**denied**: "needs approval", even inside `--add-dir`) → **Write intent** (ok; created the directory) | Saved at `~/.agent-org/intents/agent-org-scratch-20261107b/2026-11-07-bearer-auth-middleware.md`, Status `PROPOSED`, 4 × `[NON-BLOCKING]` with defaults. The PM drafted `agent-org:software-engineer` and `agent-org:security-engineer`, which don't exist. The main thread replaced them with `full-stack-developer` and `information-security-architect` and noted it in the file. No `src/` edits. Stopped for approval. |
| R2b | **PASS** | `3299f04f` | `[auth]` / false; `[]` / **true** on PM report | Skill deliver → Bash → Agent PM → `[sub, opus]` Read, Glob, Glob, Read ×3, Grep, Glob → *(notification)* → Bash mkdir (**denied**, same message) → **Write intent** (ok) | Same path and slug as R2a (deleted between runs), Status `PROPOSED`, 7 × `[NON-BLOCKING]` with defaults. The PM drafted `senior-software-engineer` / `security-engineer` and flagged them "Agent ids not verified". The main thread replaced both. No `src/` edits. Stopped for approval. |
| R3 | **PASS** | `aad66bed` (resumed R2a) | `[]` / false "Approved."; `[]` / **true** ×2 (dev report, InfoSec report) | Bash `sed -i …; echo >> intent` (**denied**) → Edit intent Status→`APPROVED` → Edit log +`APPROVED 2026-11-07 by user` → Agent `agent-org:full-stack-developer` → `[sub, sonnet]` Read intent, Read, Bash, Read, Write src/auth.js, Edit server.js ×2, Write test/server.test.js, Bash `npm test` → *(notification)* → Bash `npm test` + diff (main) → Agent `agent-org:information-security-architect` → `[sub, opus]` Read, Bash diff, Bash npm test, Bash `mkdir /tmp/secprobe…` (**denied**) → *(notification)* → Edit Status→`VERIFIED` → Edit log +`IMPLEMENTED …` + Evidence + Findings | Only the two assigned specialists ran, sequentially as the intent specified. The Status edits came **after both** reports. `VERIFIED` rests on the main thread's own `npm test` (11/11), recorded in an `## Evidence` section, and the InfoSec probe NOT RUN is recorded as such. Minor: the Status line went `APPROVED` → `VERIFIED` in one step, so `IMPLEMENTED` appears only in the log (see §7, N2). |
| R4 | **INVALID** (setup) | `fb61de30` | `[auth]`; `[]` / true | … → Write intent **succeeded** without `--add-dir ~/.agent-org` | The unscoped `Write` in `--allowedTools` allows writes outside the working directories, so removing `--add-dir` didn't take away write access. The PM drafted correct ids this time. It also raised a `[BLOCKING]` question. Discarded and rerun as R4′. |
| R4′ | **PASS** | `22d835d8` | `[auth]` / false; `[]` / **true** on PM report | Skill deliver → Bash → Agent PM → `[sub, opus]` Glob, Read ×5, Glob → *(notification)* → Bash `mkdir … && cat > … <<EOF` (rejected: "Parser skipped input") → Bash `mkdir -p ~/.agent-org/intents/…` (**denied**: outside working directories) → stop | **Deviation:** to make the save really fail, I ran it with `chmod 555 ~/.agent-org` (restored afterwards) and without `--add-dir`. The permission layer refused first, and the main thread never tried `Write`. It said "I haven't saved the intent file, and nothing has been implemented… the permission prompt was denied". It showed the intent in chat and asked to allow the write or waive the file. No `src/` edits, no specialist calls. **But** it asked the `[BLOCKING]` question and for approval in the same list ("2. Approval: tell me which token option… and explicitly approve"). |
| R4b | **PASS** | `22d835d8` (resumed R4′) | `[]` / false | Write intent (**EACCES**: `mkdir '/Users/Jake/.agent-org/intents'`) → stop | "I haven't dispatched anyone yet because the intent file still isn't saved… 'Approved' didn't cover that." It offered: fix the directory, or reply "proceed without saving". No Agent, no `src/` edits. **But** it added "I'm treating your approval as covering option (a)", so a bare approval resolved the `[BLOCKING]` question. |
| R5 | **FAIL** (partial) | `75713626` | `[auth]` / false; `[]` / **true** on PM report | Skill deliver (args = prompt) → Bash → Agent PM → `[sub, opus]` Glob, Read ×5, Glob, Grep → *(notification)* → Write intent (ok) | The PM marked 3 × `[BLOCKING]` (scheme, secret source, behavior when unset) plus 4 × `[NON-BLOCKING]`. The main thread asked all three. **Fail:** the same message ends "Please answer the three questions, or reply 'recommended defaults'. Then explicitly approve the plan". That asks for approval while the questions are open, and offers a default as the answer to blocking questions. The PM drafted invented ids (`senior-software-engineer`, `security-engineer`). The saved intent has the real ids. No `src/` edits, no dispatch. |

**Structural checks** (from subagent transcripts, all sessions):
- **Model pinning:**
  - PM: `claude-opus-5-5` in 5/5 runs.
  - information-security-architect: `claude-opus-5-5`.
  - full-stack-developer: `claude-sonnet-5-5`.
- **No nesting:** no subagent called `Agent`.
- **PM read-only:** the PM used only Read, Glob and Grep. Every intent write came from the main thread.

**Nudge check** (from transcripts):
- `hook_additional_context` with "escalation triggers matched" appears exactly once per escalation session, on the typed prompt.
- It appears zero times on the 7 `origin.kind = task-notification` turns, and zero times in R1a/R1b.

## 4. Intent file excerpts

### R2a, as saved (`2026-11-07-bearer-auth-middleware.md`)

```
**Status:** PROPOSED
**Repo / branch / base commit:** /Users/Jake/agent-org-scratch-20261107b · `master` · `eb619f5…`
**Level:** 2. **Triggers hit:** auth/authz; secrets/credentials; user-visible behavior change

## Specialist assignments
(Specialist ids corrected by main thread to match the installed roster; the PM's draft used non-existent `software-engineer` / `security-engineer`.)
| 1 | `agent-org:full-stack-developer` | Objective: implement the auth check and tests … | Human approval | Sequential (first) |
| 2 | `agent-org:information-security-architect` | Objective: review #1's diff … | #1 | Sequential (after #1) |

## Open questions
- [NON-BLOCKING] Q1. What is a "valid" token? Default: one static token from `AUTH_TOKEN`, constant-time compared; …
- [NON-BLOCKING] Q2. Behavior when `AUTH_TOKEN` unset/empty. Default: fail closed (all 401) plus a value-free startup warning; …
- [NON-BLOCKING] Q3. Unknown routes without a token. Default: 401 (auth before routing).
- [NON-BLOCKING] Q4. Health-check exemption. Default: none.

## Approval log
- 2026-11-07 PROPOSED by agent-org:principal-project-manager
```

### R2b, as saved

Same structure. Assignments: `agent-org:full-stack-developer` → `agent-org:information-security-architect`, sequential. Seven `[NON-BLOCKING]` questions, each with "Default if unanswered: …" (e.g. "Token source. Default if unanswered: env var `AUTH_TOKENS`, comma-separated, fail closed."). The log has only the `PROPOSED` line.

### R3, the R2a file at the end of the run

```
**Status:** VERIFIED

## Approval log
- 2026-11-07 PROPOSED by agent-org:principal-project-manager
- 2026-11-07 APPROVED by user
- 2026-11-07 IMPLEMENTED: #1 full-stack-developer reported; #2 information-security-architect reported.

## Evidence
- Main thread ran `npm test`: 11 tests, 11 pass, 0 fail.
- Changed (uncommitted): src/auth.js (new), src/server.js, test/server.test.js (new). package.json unchanged.
- #2 verdict: APPROVE (review result, not a risk acceptance). Bypass conclusions … come from code reading; the raw-socket probe was denied by permissions and NOT RUN.

## Findings
- SEC-001 | test/server.test.js | LOW | Missing tests for duplicate Authorization headers, //greet and encoded paths, … Disposition: OPEN, non-blocking.
```

Assignments and open questions are unchanged from R2a.

### R5, as saved (`2026-11-07-add-server-auth.md`): open questions

```
- [BLOCKING] OQ-1 Scheme: static bearer token / API key (recommended), HTTP Basic, or sessions/JWT? …
- [BLOCKING] OQ-2 Secret source: environment variable, and what name? Recommended: `API_TOKEN` …
- [BLOCKING] OQ-3 Secret unset: fail closed (refuse to start, 503 per request; recommended), or allow unauthenticated access …?
- [NON-BLOCKING] OQ-4 … OQ-7, each with "Default if unanswered: …"
```

## 5. Isolation and cleanup

**Before/after snapshot:** `plugin list`, `marketplace list`, the `settings.json` sha256 (`5dfa9d1f…1708`), the existence of `~/.agent-org`, `~/.claude/agent-org` and `~/.claude/intents`, scratch transcript dirs and scratch temp dirs. **`diff` shows no differences.**

Deleted:
- the scratch repo
- `~/.agent-org/intents/agent-org-scratch-20261107b/` (holding R5's intent at the end), `~/.agent-org/intents/` and `~/.agent-org/`
- `~/.claude/agent-org/hook-debug.jsonl` and `~/.claude/agent-org/`
- `~/.claude/projects/-Users-Jake-agent-org-scratch-20261107b/` (7 sessions plus subagent sidechains)
- `/private/tmp/claude-502/-Users-Jake-agent-org-scratch-20261107b/`

The evidence was copied first to this session's scratchpad (`…/scratchpad/03b/`: stream-json, hook logs and final intent files per run), which is temporary.

Other checks:
- `/tmp/secprobe-20261107b` (the InfoSec probe in R3) was denied and never existed.
- No probe files were needed this phase.
- This repo: the only change is this report.
- `agent-personas`: clean at `6d13ca6`.
- The plugin is still installed and enabled.

## 6. Cost

From `total_cost_usd`. For resumes I subtracted the parent session's cumulative cost.

| Run | Cost | Models |
|---|---|---|
| R1a / R1b | $0.075 / $0.078 | sonnet |
| R2a / R2b | $0.315 / $0.292 | sonnet + opus PM |
| R3 (increment) | $0.410 | sonnet + sonnet dev + opus InfoSec |
| R4 (invalid) | $0.316 | sonnet + opus PM |
| R4′ | $0.298 | sonnet + opus PM |
| R4b (increment) | $0.040 | sonnet |
| R5 | $0.313 | sonnet + opus PM |
| **Total** | **≈ $2.14** | 9 runs (7 sessions, 2 resumes); within the $1.50–4 estimate. The invalid R4 added ~$0.32. |

## 7. Remaining failures and proposed fixes

1. **N1: blocking questions don't block (D6).** Seen in R4′, R4b and R5.
   - **What happens:** the main thread puts the blocking questions and the approval request in one message, and offers a "recommended default" as an answer. In R4b a bare "Approved." settled a `[BLOCKING]` question.
   - **The PM feeds this:** it attaches "recommended" options to blocking questions.
   - **Fix (decisions.md D6, then 02-generate.md → deliver step 4 and intent template):**
     - "A blocking question has no default. Ask blocking questions in a message that does not request approval, and end the turn. Approval doesn't answer a blocking question; if the user replies 'approved' while one is open, ask it again."
     - Change the template line to `[BLOCKING] <question> (no default)`.
2. **F5 remainder: the PM doesn't know the roster.** It invented ids in 3/5 runs. It searched `~/.agent-org` and `~/.claude` for agent files and found none. The plugin is read from the repo, not `~/.claude`. The main thread corrected the ids every time, but that's a second guess.
   - **Fix (02-generate.md → deliver step 2):** the main thread passes the exact list of the 14 `agent-org:<id>` values to the PM. The ids are in the main thread's own agent list. The generator can also embed them in the deliver skill as a "Roster" block.
   - This is a runtime binding, so it belongs in the skill, not in a persona.
3. **F3 remainder: Level 1 plan ordering, 1/2.** The model read the file, edited, then wrote the plan and admitted it.
   - **Fix (02-generate.md → rule card):** tie the plan to the tool call. "Level 1: your first `Edit` or `Write` must come after a message containing a line starting 'Plan:'." This is instruction-only either way. If it still slips, accept it as best-effort under D5 rather than adding a hook.
4. **N2 (minor): Status jumps over `IMPLEMENTED` (D19).** The main thread set `VERIFIED` and wrote the `IMPLEMENTED` log line in the same step, so the Status line never showed `IMPLEMENTED`.
   - **Fix (02-generate.md → deliver step 6):** "Set and save Status `IMPLEMENTED` when the last report arrives, before running validation; set `VERIFIED` in a separate edit after validation passes."
5. **N3 (Phase 4 input): directory creation.**
   - `Bash(mkdir -p ~/.agent-org/intents/…)` needs approval even when the path is inside `--add-dir` (R2a, R2b). Every successful save created the directory through the `Write` tool, which creates parent directories itself.
   - So the requirement "directory created by the main thread" holds, via `Write`.
   - **Fix (decisions.md, Phase 4 permissions):** no `mkdir` rule is needed if deliver says "save with the Write tool". Add that to 02-generate.md → deliver step 3.
6. **N4 (Phase 4 input and test design): unscoped `Write` allows writes outside the working directories.** In the invalid R4, removing `--add-dir` didn't stop the save.
   - **Fix (decisions.md, Phase 4 permissions):** scope write rules, e.g. `Write(~/.agent-org/intents/**)` plus project paths, rather than a bare `Write`.
   - For future validation prompts, R4-style checks need a real failure (read-only directory) or a scoped `Write`.

Still unverified, as in Phase 3: parallel dispatch of independent specialists (no intent had independent tasks), QA on Sonnet (QA never assigned), and SessionStart after `/compact`.
