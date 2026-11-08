# Phase 2: Generate v0.2.0 (2026-11-08)

Claude Code 2.1.319, macOS, Node 24.18.0. `plugin/` was updated in place from v0.1.0. Nothing was installed, enabled, committed, pushed or tagged. No subagents were launched.

## 1. Summary

- **v0.2.0 generated.** There are six new hook scripts plus five shared libraries. The changed files are `guard.mjs`, `session-start.mjs`, `rule-card.md`, `hooks.json`, the `deliver` skill and all 14 runtime bindings. There is one new skill (`audit-verify`), and `plugin.json` is now `0.2.0`. Persona blocks, descriptions, tools, models, `escalate.mjs`, the other skills, `marketplace.json`, both LICENSEs and `sync-personas.mjs` are byte-identical.
- **All checks pass:** `claude plugin validate` for the plugin and the marketplace (one icon warning), sync 14 × OK, 47/47 v0.1 regression checks, 97/97 v0.2 unit checks, and the speed check (worst case 0.56 s).
- **Plugin root in skills is VERIFIED:** `${CLAUDE_PLUGIN_ROOT}` is substituted in plugin skill content (docs, skills page). `CLAUDE_CODE_SESSION_ID` in the Bash environment is VERIFIED in the docs (env-vars page) and is present in this session's Bash environment.
- **Three judgment calls need your review (§9):**
  - The PM and the read-only architects must also emit an `Outcome:` line, because SubagentStop checks every `agent-org:*` agent.
  - A PASS from an agent with no shell is backed by any successful tool call.
  - Outside git, the repo is the basename of `cwd` (per D6), not of the file's directory.
- **Phase 6 must confirm live behavior.** That covers the main thread following `deliver`'s new steps, the false-block rate of the claim check, `systemMessage` visibility, and hook identity inside teammates.

## 2. Pin and preconditions

| Check | Result |
|---|---|
| `~/git/agent-personas` exists, tracked files clean, on `main` | PASS (`git status --porcelain --untracked-files=no` empty; branch `main`) |
| `PIN` | `6d13ca61f0b556c53623bf056a4ff272024ce046` (branch `main`), the same as v0.1 |
| No `60 seconds` in the PM at PIN | PASS (count 0) |
| 14 persona files at PIN | PASS (`git ls-tree`: 14 agents plus `README.md`) |

Persona text was read only through `git show PIN:…` (via `sync-personas.mjs`). Canonical blocks are unchanged.

## 3. Files

**New**

| File | Bytes |
|---|---|
| `plugin/hooks/claim-check.mjs` | 13735 |
| `plugin/hooks/record.mjs` | 9374 |
| `plugin/hooks/team-audit.mjs` | 2744 |
| `plugin/hooks/audit-verify.mjs` | 2137 |
| `plugin/hooks/lib/audit.mjs` | 10276 |
| `plugin/hooks/lib/transcript.mjs` | 7438 |
| `plugin/hooks/lib/state.mjs` | 6064 |
| `plugin/hooks/lib/lock.mjs` | 1712 |
| `plugin/hooks/lib/repo.mjs` | 1511 |
| `plugin/skills/audit-verify/SKILL.md` | 1047 |
| `reports/02-generate-v0.2-2026-11-08.md` | this file |

**Changed**

| File | Bytes |
|---|---|
| `plugin/hooks/guard.mjs` | 24540 |
| `plugin/hooks/hooks.json` | 2730 |
| `plugin/hooks/session-start.mjs` | 1795 |
| `plugin/hooks/rule-card.md` (182 words) | 1256 |
| `plugin/skills/deliver/SKILL.md` | 12431 |
| `plugin/README.md` | 10548 |
| `plugin/.claude-plugin/plugin.json` (version only) | 461 |
| `plugin/agents/*.md` (runtime binding only, 14 files) | — |
| `docs/decisions.md` | 18552 |

**Unchanged:** `.claude-plugin/marketplace.json`, `LICENSE`, `plugin/LICENSE`, `scripts/sync-personas.mjs`, `plugin/hooks/escalate.mjs`, and the `pm`, `architecture-review`, `security-audit` and `release-validation` skills. `plugin/.gitkeep` was already absent.

## 4. Agents

Descriptions, tools and models are unchanged from v0.1 (same as the prompt's table; no `Agent`, no `inherit`). Binding word counts include the heading.

| Agent | Model | Tools | Binding words |
|---|---|---|---|
| principal-project-manager | opus | Read, Grep, Glob, WebFetch, WebSearch | 244 |
| solutions-architect | opus | Read, Grep, Glob, WebFetch, WebSearch | 167 |
| ai-ml-research-architect | opus | Read, Grep, Glob, WebFetch, WebSearch | 179 |
| information-security-architect | opus | Read, Grep, Glob, Bash, Write, WebFetch, WebSearch | 209 |
| data-knowledge-architect | sonnet | Read, Grep, Glob, WebFetch, WebSearch | 161 |
| technical-product-manager | sonnet | Read, Grep, Glob, Bash, Write | 210 |
| quality-assurance-architect | sonnet | Read, Grep, Glob, Bash, Edit, Write | 249 |
| ui-ux-designer | sonnet | Read, Grep, Glob, Edit, Write, WebFetch | 216 |
| full-stack-developer | sonnet | engineer set¹ | 220 |
| ai-engineer | sonnet | engineer set¹ | 231 |
| ml-engineer | sonnet | engineer set¹ | 233 |
| devops-engineer | sonnet | engineer set¹ | 243 |
| platform-engineer | sonnet | engineer set¹ | 243 |
| cloud-engineer | sonnet | engineer set¹ | 246 |

¹ Engineer set: Read, Grep, Glob, Bash, Edit, Write, WebFetch, WebSearch.

**Binding content**

- **Every agent:**
  - Tools (enforced) and no `Agent`.
  - The task contract.
  - Grounding (A3).
  - The return format with the first line `Outcome: …`, and the SubagentStop hook named.
- **Every specialist:** Conflicts (B5).
- **Agents with Edit:** Shared tree (B2).
- **Agents with Bash:** the one-purpose Bash rule (D24).
- **QA also gets:**
  - The guard deny on non-test paths.
  - Bash isn't path-scoped.
  - The Level 3 claim-reproduction step.
- **The PM gets:**
  - B1 parallel rules.
  - "Owns".
  - B4 `Mode: team` rules.
  - B3/B5 re-plan.
  - D29.
  - Blocking and non-blocking questions.

**Changes from the prompt, with reasons**

- **Compressed v0.1 wording.** Adding the four v0.2 rules pushed several bindings to 300–380 words, so the v0.1 bullets were tightened (for example, the contract list became one line, and the tie-breakers became one line). The D16 tie-breakers are kept in full in the infra descriptions.
  - The spec's PM list of "typical team cases" isn't in the PM binding (it didn't fit in 250 words). It's in the plan and README, and the PM gets the rule: a hand-off that can't be written down up front, named with a reason, and size never justifies a team.
- **The PM returns `Outcome: PASS` (or `BLOCKED`) as its first line, then the intent.** SubagentStop applies the report contract to every `agent-org:*` agent (§5d), so without it every PM intent would be blocked once. `deliver` step 3 saves the intent without that line. See §9 Q1.
- **Agents with no shell** (PM, three architects, UI/UX): their PASS is backed by any successful tool call, because they can't run commands, so "a successful command" would block every PASS. The bindings say "successful tool call" for them. See §9 Q2.

## 5. Enforcement gaps

| Area | Enforced (hooks, tool lists, user ask rules) | Instruction-only |
|---|---|---|
| Approval gate, blocking questions | Nothing enforces the approval itself. After approval, the scope guard stops asking for that repo in that session | Approval, blocking-question handling, re-plan triggers, unnamed dispatch (backstopped by the team gate), relay wording, collision check, re-verification, Level 3 reproduction |
| Claims and citations (all levels) | Stop hook: claims need a successful matching command in the turn; cited files must have been opened. Blocks once, then warns | Correct reading of a file that was opened; claims phrased outside the patterns |
| Specialist reports | SubagentStop: an `Outcome:` first line, and a PASS backed by the agent's own transcript | Truthful evidence beyond "a command succeeded" |
| Parallel collisions | Same-group edit deny (guard), ledger, refused-edit scan. Detection of the five shapes by the main thread from `--ledger` | "Owns" discipline; Write only for new files; reporting BLOCKED |
| Teams | Guard denies named `agent-org:*` dispatches without an approved `Mode: team` | Flag and interactive check, no model in teammate spawns, in-process only |
| Audit log | Hook-written, chained, locked, head record, rotation, check at session start, guard `ask` on tool access | Tamper-evident only: Bash can rewrite the log and head after the `ask` |
| Scope growth | Guard `ask` past 3 files, or on risky paths, without a session approval | Bash edits aren't counted |
| QA | Edit/Write/NotebookEdit outside test paths denied | Bash isn't path-scoped; the no-edit rule during reproduction |
| InfoSec, TPM | No Edit; no web for TPM | Write only for evidence and acceptance records; Bash only for authorized checks |
| UI/UX | No Bash | Edit/Write only for design artifacts |
| Engineers | Tool list; user ask rules plus the guard on push, deploy and similar | Stay within the contract's files and actions |
| Architects, PM | Read-only tool lists | Recommendations only |

## 6. Verification results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `claude plugin validate ./plugin`; `claude plugin validate .` | **PASS** | "✔ Validation passed" for both. One directory warning: `ICON_MISSING` (not a validation failure) |
| 2 | `node scripts/sync-personas.mjs --check` | **PASS** | 14 × `OK`; `main: at pin`; "production: local branch not found"; `result: 14 OK` |
| 3 | escalate payloads (10) | **PASS** 10/10 | `test-v01.mjs` |
| 4 | session-start prints the rule card | **PASS** | |
| 5 | guard v0.1 table (36 rows) plus debug-log privacy (4) | **PASS** 40/40 | The log has no command text, paths or prompt text |
| 6 | Skill frontmatter | **PASS** | `deliver` has no `disable-model-invocation`; the other five have `true` |
| 7 | Agent frontmatter | **PASS** | All have `name/description/tools/model`; no `inherit`; no `Agent` in `tools` |
| 8 | grep for `/Users/`, `/home/<x>`, `C:\Users`, `secret=`, `token=` in `plugin`, `.claude-plugin`, `scripts` | **PASS** | No hits (excluding the guard's own test-path comment) |
| 9 | claim-check Stop (25 rows, including an isMeta continuation, `sed -n` reads and fenced paths) | **PASS** 25/25 | |
| 10 | claim-check SubagentStop (9 rows, including the PM PASS backed by a Read) | **PASS** 9/9 | |
| 11 | guard v0.2 (33 rows, including corrupt state keeping the v0.1 QA deny and git ask) | **PASS** 33/33 | |
| 12 | record.mjs (12 rows, including `--ledger` via `--session`, `CLAUDE_CODE_SESSION_ID` and the fallback) | **PASS** 12/12 | |
| 13 | audit lib and audit-verify (14 rows) | **PASS** 14/14 | Detailed below |
| 14 | session-start audit (4 rows) | **PASS** 4/4 | "agent-org: audit chain broken in ss.jsonl between lines 6 and 7. Run /agent-org:audit-verify." |
| 15 | team-audit (3 rows) | **PASS** 3/3 | |
| 16 | Privacy | **PASS** | Marker strings in commands, `new_string`, prompts, messages, `task_subject`/`task_description` and final texts. Zero hits in every throwaway `~/.agent-org` (state and audit) or the debug log. Intent files written by the test itself are excluded: they're the user's document |
| 17 | Speed: 3.28 MB transcript, 50,001-line audit log | **PASS** | Detailed below |
| 18 | `hooks.json` | **PASS** | Valid JSON; all 9 events and matchers present, each `node "${CLAUDE_PLUGIN_ROOT}/hooks/<x>.mjs"`, timeout 5 |

**Check 13 details**

- 40 parallel processes appended 40 lines, and the chain stayed intact.
- An edited line 20 was reported as "between lines 19 and 20", exit 1.
- An edited and rehashed last line was reported as a head mismatch.
- A truncated tail was reported as a head mismatch.
- `MAX_BYTES=2000` produced `rot-1…n` plus `rot.jsonl`. Full verify reported 30 lines, OK, and the new file's first `prev` equals the old file's last `h`.
- An edit in `rot-1.jsonl` was named in the BROKEN line.
- Incremental verify moved the checkpoint (line 40, then 41).
- A stale lock (5 s old) was removed at once.
- A lock held and kept fresh let the append proceed after about 3 s.

**Check 17 timings:**

| Hook | Time |
|---|---|
| claim-check Stop | 195 ms |
| claim-check SubagentStop | 138 ms |
| session-start, first run (full verify, 50k lines) | 562 ms |
| session-start, incremental | 97 ms |
| guard | 124 ms |
| record | 104 ms |
| team-audit append | 106 ms |
| escalate | 83 ms |
| audit-verify, full | 539 ms |

Test harnesses live in the session scratchpad (`t/helpers.mjs`, `test-v01.mjs`, `test-v02.mjs`, `speed.mjs`, `gen_bindings.py`), not in the repo. Every test used a throwaway `HOME`. The real `~/.agent-org` still holds only `backups/`, and `~/.claude/agent-org/` doesn't exist.

**Transcript layout:** `~/.claude/projects/<slug>/<session_id>.jsonl` with a sibling `<session_id>/` directory, confirmed read-only on this machine (it holds `tool-results/`). This session's transcript also confirmed the record shapes P5 A5 describes:
- `type:"assistant"` entries with `tool_use {type, id, name, input}`;
- `type:"user"` entries with `tool_result {tool_use_id, is_error, content}`;
- string-content user entries with `isMeta`/`turnOrigin`;
- `api-request-blob` entries.

No `subagents/` directory exists locally (P5's probe sessions were deleted), so `subagentTranscripts` uses P5 A8's `<session>/subagents/agent-*.jsonl`. **UNVERIFIED on disk here.**

## 7. UNVERIFIED items for Phase 6

1. **Whether the main thread follows `deliver`'s new steps:**
   - unnamed dispatch;
   - relay wording ("X reports: …");
   - the `record.mjs --ledger` collision check;
   - Level 3 claim reproduction (and the fresh-QA variant);
   - the one-Edit `**Status:** APPROVED` change;
   - stripping the PM's `Outcome:` line.
2. **The `additionalContext` block form** for Stop and SubagentStop. The `BLOCK_FORM` constant defaults to `decision`. `AGENT_ORG_BLOCK_FORM=additionalContext` switches it, and was added so the softer form could be tested.
3. **`systemMessage` visibility** at session start in an interactive terminal.
4. **Teammates (P5 F3–F5):**
   - teammate identity (`agent_id`/`agent_type`) in hook payloads;
   - whether `SubagentStop`, `PostToolUse(Edit)`, `PreToolUse(SendMessage)` and the QA deny fire for teammates;
   - teammate transcripts;
   - the `TaskCreated`/`TaskCompleted`/`TeammateIdle` payload fields;
   - whether teammate spawns go through `PostToolUse(Agent)`, so they're audited.
5. **`prompt_id` on `PostToolUse(Agent)` and on subagent `PreToolUse(Edit)`.** The plan cites it (B3), but P5 listed `prompt_id` explicitly only for Stop. If it's absent, dispatches record `promptId: null` and the same-group deny makes no decision (fail open).
6. **`tool_response.agentId` for background (`async_launched`) dispatches,** observed in P5 C2. Foreground responses may carry it differently; record.mjs also accepts `agent_id`.
7. **The plugin-root reference in skills** is VERIFIED in the docs; it's the first live use.
8. **`CLAUDE_CODE_SESSION_ID` in the Bash environment** is VERIFIED in the docs and present in this session. The first live use is `record.mjs --ledger`.
9. **The false-block rate of the claim check.**
   - "verified" and "I ran" accept any successful Bash call in the turn. "verified" after only a Read will block once.
   - The citation check needs a known file extension (or a slash path plus `:line`) and tolerates citations by suffix or bare file name.
10. **`SubagentHandback` `tool_input.message`** (P5 A1). It was never observed with a real payload.
11. **The refused-edit text** "File has been modified since read". Also accepted after a leading `<tool_use_error>` tag.

## 8. `docs/decisions.md` changes

- D7's heading status now reads "Superseded by D30", with one line under it pointing to D30.
- D25–D30 were appended under a new `## v0.2` heading, copied from `docs/v0.2-plan.md`, with their status labels moved into the heading as for D1–D24.
- D25–D28 and D30 have a "Verified in Phase 5: …" pointer. D29 cites no P5 item, so it has none.
- The new `## v0.2` section heading is the only addition beyond the D-entries.

## 9. Open questions for you

1. **PM and the report contract.** SubagentStop checks every `agent-org:*` agent, the PM included, so the PM now starts its reply with `Outcome: PASS` and `deliver` strips that line before saving. The alternative is to exempt the PM in claim-check. Keep the line, or exempt it?
2. **PASS for agents with no shell.** For the PM, the three architects and UI/UX, "a successful command" is impossible, so I count any successful tool call (a Read). The alternative is to have them never report PASS (use `NOT RUN` for checks they can't run). Keep this?
3. **Repo outside git.** I used the basename of `cwd` (D6: "working directory outside git"), so it matches where `deliver` saves the intent. The prompt's §5 says "outside git, the directory", which, read literally, would split one non-git project's counter across subdirectories. OK?
4. **Rotated file names** follow the spec (`<repo>-<n>.jsonl`). A repo literally named `foo-1` next to a repo `foo` that rotated would share a file. Rotation never overwrites an existing file, and the head keeps the rotated list, but the names can still clash. Accept, or change the scheme (for example `<repo>.<n>.jsonl`) in v0.2?
5. **Rotated files at session start.** The incremental check covers the active file from its checkpoint. A rotated file is fully checked only by `/agent-org:audit-verify`, or at the first session start before any checkpoint exists. Acceptable?
6. **Risky-path asks** fire on each new risky file, not only the first risky file of the session. Fine?
7. **`BLOCK_FORM` env override** (`AGENT_ORG_BLOCK_FORM`). I added it so both forms can be tested without editing the file. Keep it, or hard-code the constant after Phase 6?
