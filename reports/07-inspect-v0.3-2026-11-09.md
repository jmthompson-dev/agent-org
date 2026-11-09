# Phase 7: Inspect for v0.3 (2026-11-09)

Claude Code 2.1.319 (still the changelog's newest entry, the same build as `reports/06b`), macOS (Darwin 25.6.0), Node 24.18.0. Installed: `agent-org@agent-org` 0.2.0 (user scope, enabled); `design@synced` and `engineering@synced` disabled. `ANTHROPIC_API_KEY` is unset (subscription login). Four live probe sessions plus seven headless screen calls cost **≈ $0.0097** in total. The only repo file written is this report.

## 1. Summary

- **Feasible, with four design changes.** Capture, screening, lazy filing, the remote-based key, capped loading and usage counting all work on this platform. Nothing in M1–M12 is blocked.
- **M4's "no custom code" screen isn't possible.** A `type:"prompt"` hook runs on `SubagentStop` and can be pinned to Haiku, but only by full model id: the alias `haiku` failed with "Hook evaluator API error". Its only output is `{ok, reason}`, and `ok:false` makes the subagent **continue** with the reason, as P2b showed. Nothing tells the capture hook to keep a proposal out of `inbox/`. **Use a command hook that runs `claude -p --model haiku`** (1.9–2.8 s per call, ≈ $0.0002–0.0007, auth works from inside a hook). It needs `--settings '{"disableAllHooks":true}'` and an env guard: `--bare` needs an API key, and without it the child would load agent-org's hooks again.
- **The screen works on all five samples, but only as two checks together.** The regex catches the AWS key and the bearer token. Haiku rejects the person-plus-address and the tracking number, and passes the clean lesson **and the credentials** (as asked: it judges only personal data). Failures (model error, timeout, unparseable reply) are all distinct from `clean`. **One defect:** the draft AWS-secret regex matches any 40-character commit SHA, so it would reject every note that has `evidence:`.
- **Filing at `SessionStart` works if it's detached.** A detached child spawned by a `SessionStart` hook took 2 ms to launch and survived the end of `claude -p` (re-parented to PID 1, wrote its marker 3.6 s after exit). `lib/lock.mjs` fails open as described. A PID-plus-TTL lock that fails closed is feasible with `process.kill(pid, 0)`.
- **Two gaps the plan doesn't cover:**
  - **No reviewed main-thread work.** Lessons come only from specialist reports, so Level 0–1 work (no agents) never produces a proposal.
  - **Claude Code's own auto memory is on and overlaps M2/M8.** It keeps a per-repo `MEMORY.md` under `~/.claude/projects/<p>/memory/`, loaded every session. Even `claude -p --no-session-persistence` created that directory for its cwd, until `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` was set.

## 2. Capability matrix

**Hooks active in the live runs (P2, P2b):**
- **Installed agent-org 0.2.0:** `UserPromptSubmit` escalate, `SessionStart` session-start (rule card plus audit verify), `PreToolUse` guard (`Bash|PowerShell|Edit|Write|NotebookEdit|Agent`) and team-audit (`SendMessage`), `PostToolUse` record (`Edit|Write|NotebookEdit|Agent|SubagentHandback`), `Stop`/`SubagentStop` claim-check, and `TaskCreated`/`TaskCompleted`/`TeammateIdle` team-audit.
- **Probe (`probe@inline` 0.0.1, `--plugin-dir`):** `SessionStart` log plus detached spawn; `PostToolUse(Read)` log; `SubagentStop` command (lessons parse plus `claude -p` screen) and `SubagentStop` prompt (`model` = `haiku` in P2, `claude-haiku-5-5` in P2b).
- **Built-ins:** `cc-plugin-agents-md`, `-telemetry`, `-privacy`, `-plugin-authoring`, none with hooks that matter here.

**Effects of the v0.2 hooks:** the v0.2 `record.mjs` wrote a dispatch record for each probe session (`~/.agent-org/state/<sid>/state.json`, `agentType: "probe:lessoner"`). I removed both (§7). claim-check ignored `probe:lessoner` (not `agent-org:*`), so no audit lines were written; `~/.agent-org/audit/agent-org.jsonl` is unchanged (1278 bytes, mtime Nov 8 19:58). **Every behavior reported below came from the probe hooks, not v0.2.** The P1 screen calls ran with `disableAllHooks`.

### A. Capture (M3)

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| A1 | Where the report contract lives; least change for `lessons:` | **VERIFIED** (code) | **Defined** in three places that must stay in sync:<br>• every specialist binding's **Return** line (e.g. `plugin/agents/full-stack-developer.md:53`); the PM is exempt (`plugin/agents/principal-project-manager.md:65`)<br>• the spec, `prompts/02-generate.md:127` and `:273`<br>• `deliver` (`plugin/skills/deliver/SKILL.md:45`)<br>**Enforced** in `plugin/hooks/claim-check.mjs:245-320` (`checkSubagentStop`): the first line must be `Outcome:` (`parseOutcome`, `plugin/hooks/record.mjs:31-36`), with a fallback to the last `Outcome:` line, and a PASS must be backed by a successful command. Nothing else in a report is parsed. The rule card has no contract text | **Least change:** append one optional sentence to the Return line ("Optionally end with a `lessons:` block, format below; only lessons about code or process"), and add a separate `memory-capture.mjs` `SubagentStop` hook. **Leave `claim-check.mjs` unchanged:** the A2 checks don't read past the outcome line, so a trailing block can't weaken them. The capture hook must ignore a stop that claim-check blocked (see A2) |
| A2 | Can `SubagentStop` read the report; parsing; malformed blocks | **VERIFIED** (P2, P2b, local unit test; P5 A1; 6b B-1) | **P2b:** `last_assistant_message` held the full report, and the parser returned `{topic, applies_when, scope, lesson}`, `status:"ok"`. **P2:** the subagent paraphrased the block (dropped `applies_when`/`scope`). Parser `status:"malformed"`, **zero lessons, no block, exit 0**. **Unit test:** missing field → malformed; prose after `lessons:` → malformed; no block → absent; null text → no-text. All gave zero lessons. **Two stops per agent:** in P2b the prompt hook's `ok:false` made the subagent stop a second time (`stop_hook_active:true`) with the same block. **Hand-back:** when a specialist reports through `SubagentHandback`, `last_assistant_message` isn't the report (docs, https://code.claude.com/docs/en/hooks#subagentstop-input; 6b B-1). `lastHandbackMessage()` in `lib/transcript.mjs` already recovers it | **Read** the text exactly as claim-check does (`last_assistant_message`, else the last hand-back message). **Parse** only the last `lessons:` block: `- key: value` items with all four keys required, otherwise drop the whole block. **Fail open:** never block, never write on error. **De-duplicate** by `(session, agent_id, sha256(lesson))`: one proposal file per hash, overwritten in place, so the stop after a claim-check retry wins. **Run capture after claim-check's verdict:** hooks for one event run in parallel, so the capture hook can't see claim-check's verdict. Have it write the proposal anyway; filing (C3) drops it unless the agent's **last** audit `result` line is PASS |
| A3 | Teammates (D30) | **Partly VERIFIED** (Phase 6 Part B step 3; 06c steps 3 and 7) | `SubagentStop` fires **once per teammate turn** (dev ×3, qa ×2), with a stable `agent_id` and `agent_type` = the teammate's name. claim-check resolves the type through the dispatch record (`effectiveType`, `lib/state.mjs`), and 06c shows a `result` line for every teammate stop. **Not verified:** whether a teammate's `last_assistant_message` carries a full report on each turn. Teammates report to the lead by message, and 06c V21-1 shows relays arriving as `teammate-message` | **Teammate lessons are technically in scope:** the same hook, with `effectiveType`, sees them. Because a teammate stops many times, treat only the **last** stop per `agent_id` before the intent turns VERIFIED as the report. That falls out of the C3 join. **Recommendation:** ship teammates in scope, but mark them UNVERIFIED until a checklist step confirms one teammate lesson end to end |

### B. Screening (M4)

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| B1 | Prompt-based hooks | **VERIFIED** (docs and P2/P2b) | **Docs** (https://code.claude.com/docs/en/hooks#prompt-based-hooks):<br>• **Events:** `type:"prompt"` is supported on `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `Stop`, **`SubagentStop`**, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `UserPromptSubmit` and `UserPromptExpansion` (plus `PermissionRequest`). **Not on `SessionStart` or `SessionEnd`.**<br>• **Model:** defaults to the "background functionality" model; a `model` field overrides it.<br>• **Timeout:** 30 s by default.<br>• **Reply:** `{ok, reason, impossible}`. On `SubagentStop`, `ok:false` feeds `reason` back to the subagent and it continues.<br>• **Concurrency:** at most 12 prompt or agent hooks run at once.<br>**P2** (`model:"haiku"`): stderr `[claude-code:unrecognized_model] {"model":"haiku","query_source":"hook_prompt"}`. Subagent transcript: `hook_non_blocking_error` "Hook evaluator API error: There's an issue with the selected model (haiku)…". The stop was allowed (fails open).<br>**P2b** (`model:"claude-haiku-5-5"`): the reason "PROMPT-HOOK-SAW-LESSONS…" appeared as a `user` entry in the subagent transcript, and a second `SubagentStop` followed with `stop_hook_active:true`.<br>**Cost:** not itemized. `modelUsage` showed only `claude-haiku-5-5` at $0.0027 for the whole P2b session, so the hook's own cost is **UNVERIFIED** | **A prompt hook can't do M4.** It judges and redirects the agent; it can't hand a verdict to the hook that writes `inbox/`, and an `ok:false` costs an extra subagent turn. Pin by full id if one is ever used. **Drop the "no custom code" goal from M4** |
| B2 | Cheapest alternative | **VERIFIED** (P1, P2b) | A command hook spawns `claude -p "<prompt>" --model haiku --tools "" --strict-mcp-config --no-session-persistence --settings '{"disableAllHooks":true}' --output-format json`.<br>**Latency:** 2.0–2.8 s standalone (P1); **1.9 s inside a `SubagentStop` hook** (P2b).<br>**Auth:** works from the hook environment (subscription login, inherited env). There is no API key, so **`--bare` isn't usable**: per https://code.claude.com/docs/en/headless#start-faster-with-bare-mode it "never reads OAuth credentials".<br>**Network:** needed, and available in the hook.<br>**Hook env** includes `CLAUDE_CODE_SESSION_ID`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`, `CLAUDE_CODE_CHILD_SESSION` and others. The child ran fine with them.<br>**Recursion guard:** `disableAllHooks` stops the child running hooks (docs: https://code.claude.com/docs/en/hooks#disable-or-remove-hooks); `--strict-mcp-config` keeps the claude.ai connectors out (their instructions appeared inside a Read result again in P2) | **Hook budget:** v0.2 hooks use a 5 s timeout. Give the capture hook **its own** `timeout: 30` and a 20 s internal kill. **Better: `async: true`.** Capture never blocks, so nothing waits on the screen. Docs: async output is delivered on the next turn, and `-p` kills a still-running async hook at teardown (outcome `cancelled`) (https://code.claude.com/docs/en/hooks#run-hooks-in-the-background). A killed screen must leave no file in `inbox/`. **Decided (§6a Q4):** a synchronous hook parses the block, runs the regex blocklist (milliseconds) and writes only passing proposals to `inbox/`. The Haiku check runs at filing time (C1), so no model call runs inside a session. **Child env:** `AGENT_ORG_MEMORY_CHILD=1` (belt and braces with `disableAllHooks`), `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and a temp cwd (see H2) |
| B3 | Probe on five samples | **VERIFIED** (P1) | See §3, P1 table. Combined result: clean → **file**; AWS → **reject** (regex); bearer → **reject** (regex); person → **reject** (Haiku); tracking → **reject** (Haiku). Haiku alone passed the AWS key and the JWT ("credentials are a security concern but not the listed category"), so **neither check is enough on its own**. **Regex false positive:** `aws-secret` `/\b[A-Za-z0-9/+=]{40}\b/` matched a 40-hex commit SHA (P1f) | **Keep both checks.** Fix the AWS-secret rule: require a key-name context (`aws_secret_access_key`, `secret`) or require mixed case plus `/`/`+`, and exclude `^[0-9a-f]{40}$`. **Screen only the lesson body and `applies_when`, never `evidence`** (SHAs, paths). **Add validation samples:** a commit SHA, a UUID, a sha256 digest, and an internal hostname, all of which must pass |
| B4 | Failure modes distinct from clean | **VERIFIED** (P1f) | **Model error:** `--model claude-nonexistent-model-0` → `is_error`, exit 1, $0 → `error:model`.<br>**Timeout:** 1 s kill → `error:timeout`.<br>**Unparseable** (fixed strings through the same parser): prose, `{"personal_or_customer_data":"no"}` (wrong type), and empty all → `error:unparseable`.<br>**Spawn failure** → `error:spawn` (code path).<br>Only `{"personal_or_customer_data": false}` with a boolean yields `clean` | **Rule:** file only on `verdict === 'clean'` **and** an empty blocklist. Any `error:*` leaves the proposal in `inbox/` with `screen: error:<kind>` and a retry count (retried next run, rejected after 3), never filed. Log the verdict kind, never the text |

### C. Filing (M5)

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| C1 | Trigger | **VERIFIED** (docs and P2/P2b) | **`Stop`:** fires "per turn" (https://code.claude.com/docs/en/hooks; P5 A6: once per turn, plus once per task-notification turn).<br>**`SessionEnd`:** "1.5-second budget", JSON output discarded, `prompt` hooks unsupported (https://code.claude.com/docs/en/hooks#sessionend), so it can't be relied on for a model call.<br>**`SessionStart`:** command hooks only. Interactive sessions run them **in the background**, but "Claude's first response still waits for the hooks to finish" (https://code.claude.com/docs/en/hooks#sessionstart), so a synchronous filing run would delay the first answer by N × 2 s.<br>**Detached spawn (P2, P2b):** `spawn(..., {detached:true, stdio:'ignore'}).unref()` took **2 ms**; `claude -p` exited at t+12.0 s; the child wrote its marker at t+15.6 s with **`ppid:1`**. Docs agree: "If your hook's work must outlive a `claude -p` session, start a fully detached process from it" | **Keep `SessionStart` as the trigger, but spawn a detached filer** (`node filer.mjs`, stdio ignored, `unref`). The hook itself exits at once, so session start isn't delayed. The filer takes the filing lock (C2) and does all screening and merge calls. Also offer `/agent-org:memory-file` (user-only) to run it in the foreground |
| C2 | Lock | **VERIFIED** (code and local test) | **`lib/lock.mjs`:**<br>• `STALE_MS = 2000`, `GIVE_UP_MS = 3000` (`plugin/hooks/lib/lock.mjs:8-9`)<br>• an unexpected error proceeds unlocked (`:32`), and so does giving up (`:37`, "Fail open")<br>• staleness is judged by directory **mtime**, with no owner recorded<br>**PID check (local, macOS):** `process.kill(pid,0)` returns normally for self, `ESRCH` for an exited child and for an unused PID, and `EPERM` for PID 1 (alive, another user's). Linux has the same semantics (POSIX `kill(2)`); **not run on Linux** | **Filing lock spec:** create `memory/.filing.lock/` with `mkdir`, then write `owner.json` `{pid, host, started, nonce}`.<br>• **Held** if the PID is alive (`kill(pid,0)` succeeds, or throws `EPERM`) **and** age < TTL (10 min).<br>• **Stale** if `ESRCH`, or age > TTL, or `owner.json` is missing **and** the dir is older than 30 s (crash between mkdir and write).<br>• **Takeover:** rename the stale dir to `.filing.lock.stale-<nonce>`, then `mkdir` again, so two takeovers can't both win.<br>• **Fail closed:** any other error means skip filing.<br>• **PID reuse:** the TTL bounds the risk; `host` guards against a home dir synced between machines |
| C3 | Review signal | **VERIFIED** (fields); rule **Open** | **Audit fields** (`plugin/hooks/lib/audit.mjs:109-113`, `record.mjs:184-189`, `claim-check.mjs:311-315`): every line has `ts, repo, session`; `intent` is added only once an approval is recorded (`auditBase`, `record.mjs:85-92`); `dispatch` has `agent_id, agent_type, model, tool_use_id, outcome`; `result` has `agent_id, agent_type, outcome` (PASS/FAIL/BLOCKED/SKIPPED/NOT RUN/plan/MISSING/unknown), `commands`, `flags`.<br>**Real lines** (`~/.agent-org/audit/agent-org.jsonl`): `{"event":"dispatch","agent_type":"agent-org:full-stack-developer","intent":"agent-org/2026-11-08-pygame-tic-tac-toe.md",…}`; the PM's dispatch and result lines have **no** `intent` (written before approval).<br>**No audit event records VERIFIED.** The intent file's `**Status:**` line does. **Several `result` lines per agent** after a block and retraction (06 A7: take the last) | **Join:** proposal `{session, agent_id}` → last audit `result` for that `agent_id` → `outcome == PASS` and no `unbacked-*` flag → that session's `dispatch` line for the `agent_id` carries `intent` → `~/.agent-org/intents/<intent>` has `**Status:** VERIFIED`. **Proposed rule:** "passed review" = a PASS result **and** the intent VERIFIED (the main thread's own verification at Level 2; QA reproduction at Level 3). An intent still IMPLEMENTED stays in the inbox; filing retries until it ages out after 14 days. **Level 0–1:** there are no agents, so no SubagentStop and no proposal; the question is moot unless main-thread capture is added. Proposal (open): v0.3 captures **specialist lessons only**; Level 0–1 lessons enter only via a user-only `/agent-org:remember`, where the user typing it counts as the review. **Improvement:** have `record.mjs` audit an `intent-status` event when the main thread sets VERIFIED, so the join never has to parse markdown |
| C4 | Merge call | **VERIFIED** (mechanism and cost from P1/P2b); merge prompt **UNVERIFIED** | Same `claude -p --model haiku` call as B2, with `--json-schema` available for structured output (https://code.claude.com/docs/en/headless). One call of about 300 input tokens cost **$0.0002–0.0007** and took **1.9–2.8 s**. A merge prompt carries two notes (≈ 1–2k tokens), so ≈ $0.001–0.003 (estimate) | Expected reply: `{"action":"merge"|"supersede"|"keep_both", "merged_body"?: string}`. **Any `error:*` or schema miss means keep both**, filing the new note with `related: <old>`. Never edit an existing note in place: supersede writes a new note and flips the old one's `status`, as M10 says |

### D. Storage and project key (M2)

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| D1 | D6 basename key and its collision | **VERIFIED** (code and local test) | `repoName()` = `path.basename(repoRoot(...))` (`plugin/hooks/lib/repo.mjs`, `repoName`). Two scratch repos `…/a/app` and `…/b/app`: `D6 names: app app`. The audit file, head record and intents directory are all keyed by that name, so v0.2 **already** merges same-named repos in the audit log | Memory must not inherit the collision. For audit and intents it's a v0.2 bug, to be fixed in v0.2.1 (§6a Q6) |
| D2 | Remote-based key | **VERIFIED** (local test) | Normalizer: strip the scheme and `user@`, convert `host:path` to `host/path`, drop `.git` and a trailing `/`. `git@github.com:acme/app.git`, `https://github.com/acme/app`, `https://github.com/Acme/App.git/`, `ssh://git@github.com/acme/app.git` and `https://user@github.com/acme/app.git` all map to `github.com/acme/app`. `git remote get-url origin` costs **9.2 ms** | **Key:** lowercase the host; **lowercase the path only for known case-insensitive hosts** (github.com, gitlab.com, bitbucket.org), and keep the path case elsewhere. **No remote:** `local-<sha256(realpath(toplevel))[:12]>`. **Several remotes:** `origin`, else the alphabetically first. **Fork with `origin` and `upstream`:** key on `origin` (the user's fork; lessons about their branch practices), and record `upstream` in the note header for an optional cross-key search. **Directory name:** the key with `/` → `__` (e.g. `github.com__acme__app`). **Join:** every note stores `repo: <D6 name>`, and the project folder holds `KEY.json` `{key, remote, d6Names:[…]}`, so audit and intent lookups (keyed by D6 name) go through the note header. A repo whose `origin` changes gets a new key; `KEY.json` lists the old remote so a migration command can find it |
| D3 | Is the memory root inside a work tree? | **VERIFIED** (local) | `git -C ~/.agent-org rev-parse --is-inside-work-tree` → exit 128 ("not a git repository"); the same for `~`. Cost **8.2 ms** average | **Check:** refuse to write when the command prints `true`; treat exit 128 as outside. **Blind spot:** a bare-repo dotfiles setup (`git --git-dir=~/.cfg --work-tree=~`) isn't detected, because `rev-parse` doesn't see it without `GIT_DIR`. Also refuse if `GIT_DIR`/`GIT_WORK_TREE` are set in the env, and document the gap. Run the check once per filing run, not per hook |

### E. Loading and search (M8, M9)

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| E1 | `SessionStart` size limit | **VERIFIED** (docs and code) | "A hook's `additionalContext`, `systemMessage`… are capped at 10,000 characters… Claude Code measures each string on its own, **even when several hooks run for the same event**." Over the limit, the text goes to a file with a 2,000-character preview, and "Claude Code doesn't ask Claude to read the file" (https://code.claude.com/docs/en/hooks#json-output). Today `session-start.mjs` sends the rule card (`rule-card.md`, **1,256 bytes**) as `additionalContext` (`plugin/hooks/session-start.mjs:38`), and the audit warning goes in `systemMessage` | **Use a separate `memory-load.mjs` `SessionStart` hook:** its own 10,000-character budget, and it can't push the rule card over. **Cap: 6,000 characters total** (≈ 1.5k tokens): about 2,000 for `global/INDEX.md` and 4,000 for the project index, cutting lowest `use_count`, then oldest `last_used`, and ending with "N more: use memory-search". That stays far below the cap and well below auto memory's 25 KB |
| E2 | `PostToolUse` on `Read` | **VERIFIED** (P2, P2b; docs) | Logged `{tool:"Read", file_path:"/private/tmp/…/repo/notes/sample-note.md", abs:true, agent_id:"a6f27f6bbdb18abdc", agent_type:"probe:lessoner"}`, **from inside the subagent**. Docs: `file_path` is "Absolute path to the file to read"; plugin hooks "also run inside subagents" (https://code.claude.com/docs/en/hooks) | Counting works for the main thread and subagents. **Cost control:** use the documented `if` field, `"if": "Read(~/.agent-org/memory/**)"` (permission-rule syntax, https://code.claude.com/docs/en/hooks#common-fields), so Node starts only for note reads; not probed live. **Gaps:** `cat`/`sed` reads through Bash aren't counted (macOS default tool set, P5 A8), so the search script increments counts for the notes it prints. Update counts under the short `lib/lock.mjs` lock: a lost increment is harmless |
| E3 | Is `rg` guaranteed? | **VERIFIED: no** (local) | `rg` in Claude's Bash is **a shell function** from `~/.claude/shell-snapshots/…` that runs the `claude` binary as `ARGV0=rg`. No `rg` exists at `/opt/homebrew/bin`, `/usr/local/bin` or `/usr/bin`, and a plain `zsh -f` finds none. A `node` script spawned by a hook or skill doesn't get the function | **The search script uses a pure-Node scan.** After header filtering it reads at most a few hundred small files, which is fast enough. Use `rg` only if `which rg` finds a real binary. Don't depend on `CLAUDE_CODE_EXECPATH` plus `ARGV0` (undocumented) |
| E4 | Skill-bundled script paths | **VERIFIED** (docs and v0.2 usage) | `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_SKILL_DIR}` are substituted in plugin skill markdown and in `allowed-tools` Bash rules (https://code.claude.com/docs/en/skills#available-string-substitutions). In use today: `plugin/skills/audit-verify/SKILL.md` runs `node "${CLAUDE_PLUGIN_ROOT}/hooks/audit-verify.mjs"`, released in v0.2.0 | Ship `plugin/skills/memory-search/search.mjs` and call it as `node "${CLAUDE_SKILL_DIR}/search.mjs" …`. Add a matching `allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/search.mjs *)` so it runs without a prompt (D10: ask rules live in the user's settings, so check this doesn't collide). `memory-search` needs model invocation to be useful, which **conflicts with D14** ("deliver is the only model-invocable skill"). Decide in D35 |

### F. Toggle (M11)

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| F1 | How v0.2 reads configuration | **VERIFIED** (code) | **Env vars only:** `AGENT_ORG_HOOK_DEBUG` (`escalate.mjs:49`, `guard.mjs:519`), `AGENT_ORG_AUDIT_MAX_BYTES` (`lib/audit.mjs:33`) and `CLAUDE_CODE_SESSION_ID` (`record.mjs:246`). There's no config file. Env vars set in settings `env` reach hooks (P5 F2) | **Switch:** `AGENT_ORG_MEMORY` env var (`1`/`0`) **overrides** `~/.agent-org/config.json` `{"memory":{"enabled":false}}`. The default is **off** (opt-in), since v0.3 must not change v0.2 behavior for anyone who doesn't ask. **Each hook** checks the env var first, then one `readFileSync` of the config (< 1 ms), and exits 0 when off. Plugin `userConfig` (`CLAUDE_PLUGIN_OPTION_<KEY>`) is an alternative, but it prompts at enable time and lives under `~/.claude`; not recommended |
| F2 | Hooks in `plugin/hooks/hooks.json`, no-op when off | **VERIFIED** (D11 and docs) | Plugin hooks merge with user hooks and are loaded from the plugin (https://code.claude.com/docs/en/plugins-reference). v0.2 already ships everything this way (`plugin/hooks/hooks.json`) | **Cost when off:** each extra memory hook still starts Node (~60 ms, P5 E2) per firing. That's fine for `SessionStart`/`SubagentStop`. Use `if` on `PostToolUse(Read)` (E2), so it doesn't fire per Read when off. **Fold capture into the existing `SubagentStop` command** (`claim-check.mjs` calls `memory/capture.mjs` behind the toggle) rather than adding a second process per stop. That keeps one Node start, and capture still never changes claim-check's output |

### G. Eval harness

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| G1 | Point memory at a scratch root | **VERIFIED** (mechanism: P5 F2 settings `env` reaches hooks; P2b hook env) | The env vars visible in the hook (§3 P2b `hookEnv`) are inherited from the CLI process. An `AGENT_ORG_MEMORY_ROOT` set in the shell or in `--settings '{"env":{…}}'` reaches every hook and child | Add `AGENT_ORG_MEMORY_ROOT`. **Also add `AGENT_ORG_HOME`** (overrides `orgDir()` in `lib/state.mjs`): the review-signal join reads the audit log and intents, so an eval that isolates only memory still writes eval runs into the real `~/.agent-org/audit/` |
| G2 | Cost and turns from `-p` | **VERIFIED** (docs and P1/P2) | "With `--output-format json`, the response payload includes `total_cost_usd` and a per-model cost breakdown"; on `--resume` it reports the whole conversation's total (https://code.claude.com/docs/en/headless). Observed fields: `total_cost_usd`, `num_turns`, `duration_ms`, `modelUsage[<model>].costUSD`, `is_error`, `subtype` | Read `total_cost_usd` and `num_turns` from the final `result` object (stream-json: the last line). Use fresh sessions per arm so resumed totals don't mix. Add `--max-budget-usd` per run as a guard |
| G3 | Task pairs, runs and cost | Proposal | See §4 item 12 | **5 runs per arm,** 3 pairs, Sonnet main thread at Level 2. Estimate ≈ **$30–50** per full eval, from Phase 6's $17.05 / 37 Sonnet sessions ≈ $0.46 per session (seeding sessions with dispatches cost more) |

### H. General

| # | Question | Status | Evidence | Design impact |
|---|---|---|---|---|
| H1 | Version and changes since 06b | **VERIFIED** | `claude --version` → 2.1.319. The changelog's top entry is `2.1.319` (https://code.claude.com/docs/en/changelog), the build 06b and 06c ran on, so **no changes**. Docs facts that matter here and that earlier phases didn't record:<br>• prompt-hook `continueOnBlock` and `impossible`<br>• async hooks are cancelled at `-p` teardown<br>• the `if` field<br>• the 10,000-character cap is measured per string<br>• the SessionEnd 1.5 s budget<br>• `--bare` needs an API key | Pin v0.3 behavior to 2.1.319, and re-check prompt-hook model aliases at the v0.3 release |
| H2 | Built-in memory overlap | **VERIFIED** (docs and local) | **Auto memory** (https://code.claude.com/docs/en/memory#auto-memory):<br>• a per-project directory at `~/.claude/projects/<project>/memory/` with a `MEMORY.md` index, "one line per memory", and topic files<br>• "first 200 lines… or the first 25KB" are loaded every session<br>• the project is "derived from the git repository", so worktrees share it<br>• controlled by `autoMemoryEnabled`, `autoMemoryDirectory` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`<br>**It's on in this account** (this session has an auto memory directory for agent-org). **Side effect, observed:** each P1 `claude -p --no-session-persistence` call created `~/.claude/projects/<scratch slug>/memory/`; the P2b child with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` in a temp cwd created none. `/memory` and `CLAUDE.md` are the other built-ins | **Overlap:** the same pattern (index plus topic files, loaded at start). **Differences that justify M1–M12:** review gating, screening, a cross-repo global scope, supersede and archive, and storage outside `~/.claude` (D6). **Collisions:**<br>• two indexes in context can disagree. The rule card should say agent-org notes are leads (M7) and that auto memory is the user's own<br>• auto memory may record the same lesson unreviewed. That's acceptable, but document it<br>• screen and merge children must set `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and run in a temp cwd, or they create `~/.claude/projects/<repo>/memory/` dirs<br>• never name the store `MEMORY.md` (use `INDEX.md`, as planned) |

## 3. Probe results

**Setup:** scratch at `…/scratchpad/07/probe/`, holding `repo/` (git, base `a8b152d`: `package.json`, `notes/sample-note.md`), `plugin/` (`probe` 0.0.1: agent `lessoner` with `model: haiku`, `tools: Read`; `hooks/log.mjs`; `hooks.json` as listed in §2), `screen.mjs` (blocklist plus screen) and `samples.json`. No settings file was edited and no `--dangerously-skip-permissions` was used.

**Screen command** (P1, P1f, and inside the P2b hook):
```
claude -p "<screen prompt + sample>" --model haiku --tools "" --strict-mcp-config --no-session-persistence \
  --settings '{"disableAllHooks":true}' --output-format json
```
The prompt asks for JSON only: `{"personal_or_customer_data": true|false, "reason": "<short>"}`. It defines personal or customer data (names tied to records, postal addresses, emails, phones, account or order ids, **tracking numbers**, customer records) and says internal hostnames, paths and code are allowed. All samples are synthetic: the AWS pair is the documented `AKIAIOSFODNN7EXAMPLE` example, the person and address are invented, and the tracking number is the UPS sample format.

### P1: five fixed samples

| Sample | Blocklist | Haiku verdict | Haiku reason (abridged) | ms | Cost | **Combined** |
|---|---|---|---|---|---|---|
| clean (test-runner lesson) | none | clean | "only a test-runner instruction with a repo-relative file path" | 2160 | $0.00069 | **file** |
| aws (key id plus secret) | `aws-access-key`, `aws-secret` | clean | "credentials… not the listed personal/customer data category" | 2638 | $0.00026 | **reject** |
| bearer (JWT header) | `bearer`, `jwt` | clean | "internal staging hostname, a generic auth header with a placeholder-style JWT" | 2377 | $0.00026 | **reject** |
| person (name plus street address) | none | reject | "a real person's full name tied to a customer record… postal address" | 2806 | $0.00022 | **reject** |
| tracking (`1Z999AA10123456784`) | none | reject | "Contains a shipment tracking number" | 2006 | $0.00022 | **reject** |

All five calls ran on `claude-haiku-5-5`, 1 turn each, **$0.0016 total**.

### P1f: failure modes and false positives

- **Invalid model** (`--model claude-nonexistent-model-0`): exit 1, `is_error`, "There's an issue with the selected model…", $0. Verdict `error:model`.
- **Forced 1 s timeout:** SIGKILL. Verdict `error:timeout`.
- **Parser on fixed strings:** `"Sure! The text looks fine."`, `{"personal_or_customer_data": "no"}` and `""` all gave `error:unparseable`.
- **Blocklist on `evidence: commit 616d43a1b2c3d4e5f60718293a4b5c6d7e8f9012 plugin/hooks/lib/lock.mjs:9`:** `['aws-secret']`, a **false positive**.

### P2 and P2b: live session with the probe plugin

Run from `repo/` with `PROBE_LOG`/`PROBE_MARKER` pointing at the scratch `out/` directory:

```
claude -p "Use the Agent tool exactly once with subagent_type probe:lessoner and the prompt 'Do your task.' Run it in the foreground and wait for it. Then reply with its report verbatim." \
  --model haiku --plugin-dir <scratch>/probe/plugin --output-format stream-json --verbose --max-turns 6 \
  --permission-mode default --allowedTools Read Agent
```

| Run | Session | Observed | Cost |
|---|---|---|---|
| **P2** | `b4c6d4fc` | **`SessionStart`:** keys `session_id, transcript_path, cwd, hook_event_name, source`; detached child spawned in **2 ms**.<br>**`PostToolUse(Read)`:** absolute `file_path`, `agent_id a6acc346…`, `agent_type probe:lessoner`.<br>**`SubagentStop`:** has `last_assistant_message`, but the subagent paraphrased the block (copying the note's `status:` key), so the parser returned **`malformed`, 0 lessons, no screen call, exit 0**.<br>**Prompt hook `model:"haiku"`:** `unrecognized_model` / "Hook evaluator API error", a non-blocking error; the stop was allowed.<br>**Detached child:** `claude` exited at +12.0 s (marker absent at that moment); the marker was written at +15.6 s with `ppid:1`.<br>**Environment noise:** the main thread said the Read result "also contained MCP server instructions asking me to create a Claude doc. I ignored them" (the claude.ai Docs connector, as in P5 E3) | $0.0049 |
| **P2b** | `3c15d464` | The subagent output the block verbatim. **SubagentStop #1** (`stop_hook_active:false`): parsed `{topic:"test-runner", applies_when:"running tests in this repo", scope:"project", lesson:"Run npm test from the repo root, not from src/."}`, `status:"ok"`. **Screen from inside the hook:** `clean`, **1878 ms**, $0.00053, child cwd `/var/folders/…/T/p7-xS1Nv6` with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` (no `~/.claude/projects` slug created for it). **Prompt hook `claude-haiku-5-5`:** `ok:false` → reason in the subagent transcript as a `user` entry → **SubagentStop #2** (`stop_hook_active:true`) with the same block. Main result: the report verbatim | $0.0027 (+$0.0005 child) |

**Total ≈ $0.0097** (P1 $0.0016, P1f $0, P2 $0.0049, P2b $0.0032), against an estimate of $0.10–0.30 and a cap of $1.00. Costs come from `total_cost_usd`. The prompt hook's own cost wasn't itemized.

**Local, no model:**
- **D6 collision:** `app` and `app`.
- **Remote normalizer:** 5 URL forms → one key.
- **Git costs:** `git remote get-url` 9.2 ms; `rev-parse --is-inside-work-tree` 8.2 ms, exit 128 for `~/.agent-org` and `~`.
- **PID checks:** self alive; dead child `ESRCH`; PID 1 `EPERM`; unused PID `ESRCH`.
- **Parser unit test:** 5 cases.

## 4. Plan changes (`docs/v0.3-plan.md`)

1. **M3, contract (A1).** Replace "Nothing else changes in persona instructions" with:
   - **Binding:** each specialist binding's **Return** line gains one optional sentence that names the `lessons:` format (`- topic / applies_when / scope / lesson`, code or process only), mirrored in `prompts/02-generate.md`.
   - **Hooks:** `claim-check.mjs` is unchanged. Capture is a separate module called from the existing `SubagentStop` command behind the toggle (F2).
2. **M3, extraction (A2, A3).** Add:
   - **Report text:** the same source claim-check uses (`last_assistant_message`, else the last `SubagentHandback` message).
   - **Block:** only the last `lessons:` block; all four keys or nothing.
   - **Failure:** never block, never throw.
   - **De-duplication:** one proposal per `(session, agent_id, sha256(lesson))`, overwritten in place.
   - **Teammates:** included, through `effectiveType`; the last stop before VERIFIED wins.
3. **M4, mechanism (B1, B2).** Replace "Verify in Inspect: whether a Claude Code prompt-based hook can run the Haiku check with no custom code" with: "**Prompt hooks can't screen**: they can only redirect the agent. The Haiku check is `claude -p --model haiku --tools "" --strict-mcp-config --no-session-persistence --settings '{"disableAllHooks":true}' --output-format json`, run by the filer, with `AGENT_ORG_MEMORY_CHILD=1`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` and a temp cwd. `--bare` isn't used: it needs an API key."
4. **M4, when it runs (B2, C1). Revised after §6a Q4.** My first draft moved both checks to filing time, which quietly reversed M4's "before anything reaches `inbox/`". The decision is now split:
   - **At capture:** the **regex blocklist** runs in the `SubagentStop` hook (milliseconds). A match is rejected before any write. Only the hook's verdict kind is logged, never the text. **No credential ever reaches disk.**
   - **At filing:** the **Haiku personal-data check** runs in the detached filer. Capture writes `inbox/<hash>.json` with `screen: regex-passed, haiku: pending`. Nothing leaves `inbox/` without `clean`.
   - **Remaining exposure:** text with personal or customer data but no credential pattern can sit in `inbox/` (owner-only permissions, never loaded or searched) until the next filing run. Document it in the plan's "floor, not a guarantee" note.
   - **Plan wording:** M4's "Before anything reaches `inbox/`, two checks run" becomes "The blocklist runs before anything reaches `inbox/`; the Haiku check runs before anything leaves it."
5. **M4, rules (B3, B4).** Add:
   - **Blocklist:** the AWS-secret rule needs key context and excludes pure hex. Screen the lesson body and `applies_when` only, never `evidence`.
   - **Filing rule:** only `clean`; the blocklist already ran at capture (item 4). Any `error:*` stays in the inbox with a retry count; it's rejected after 3.
  - **Capture-time blocklist:** it runs on the lesson body and `applies_when` before the proposal file is written. The SHA exclusion matters most here, because a false positive at capture silently drops the lesson.
   - **Validation set:** the 5 samples, plus a commit SHA, a UUID, a sha256 digest and an internal hostname, which must pass.
6. **M5, trigger (C1).** Replace "at the next `SessionStart`" with: "a `SessionStart` hook spawns a **detached** filer (`detached:true`, stdio ignored, `unref`) and exits at once. Verified to take 2 ms and to outlive `claude -p`. Also available as the user-only `/agent-org:memory-file`."
7. **M5, lock (C2).** Add the lock spec from C2 to step 1:
   - **Owner record:** `mkdir` plus `owner.json {pid, host, started, nonce}`.
   - **Liveness:** `kill(pid,0)`, where `EPERM` counts as alive.
   - **TTL:** 10 minutes.
   - **Takeover:** rename the stale lock first.
   - **Failure:** fail closed.
8. **M5, review (C3).** Replace step 2 with:
   - **Join:** the proposal's `(session, agent_id)` → the **last** audit `result` for that `agent_id` (outcome `PASS`, no `unbacked-*` flag) → the `dispatch` line's `intent` → `**Status:** VERIFIED` in the intent file.
   - **Not yet:** an IMPLEMENTED intent waits, up to 14 days.
   - **Audit event:** `record.mjs` adds an `intent-status` event so the join doesn't parse markdown.
   - **Level 0–1:** see §6 Q2.
9. **M2, key (D1, D2).** Settle the key:
   - **Normalization:** host lowercased, path lowercased only for known case-insensitive hosts. Fallbacks as D2: `origin`, else the alphabetically first remote, else `local-<hash>`.
   - **`KEY.json`:** each project folder holds `{key, remote, upstream?, d6Names}`.
   - **Note header:** `repo` is the D6 name.
   - **v0.2 bug, not v0.3 scope (§6a Q6):** the audit log and intents share one name across same-named repos. Fix it in **v0.2.1**; v0.3 bundles no migration.
10. **M2, work-tree check (D3).** Add: also refuse when `GIT_DIR` or `GIT_WORK_TREE` is set, and document the bare-repo dotfiles blind spot. Run the check once per filing run.
11. **M8 and M9 (E1–E4, H2).**
    - **M8:** a separate `memory-load.mjs` `SessionStart` hook (its own 10,000-character budget) with a **6,000-character** cap for both indexes.
    - **M9 search:** pure-Node text search, `rg` only if a real binary exists. Call the script by `${CLAUDE_SKILL_DIR}`.
    - **M9 counting:** `PostToolUse` with `"if": "Read(~/.agent-org/memory/**)"`, plus counting in the search script for the results it prints.
    - **D14:** decide whether `memory-search` is model-invocable (§5 D35).
12. **Eval harness (G1–G3).**
    - **Isolation:** `AGENT_ORG_MEMORY_ROOT` **and** `AGENT_ORG_HOME`.
    - **Metrics:** cost and turns from the final `result` object.
    - **Guard:** `--max-budget-usd 3` per run.
    - **Pairs:**
      - **(a) Test-runner quirk.** A repo whose tests pass only with `TZ=UTC`. Seeding: fix a date bug, which surfaces the TZ lesson. Benefit: fix a second date bug. Metric: turns to the first green `npm test`.
      - **(b) Project convention.** Errors must be thrown as `AppError` from `src/errors.js`, enforced by a test. Seeding: add an endpoint; the QA review fails a plain `Error`. Benefit: add another endpoint. Metric: pass on the first QA review.
      - **(c) Generated file.** `src/gen/schema.js` is generated by `npm run gen` and edits to it are overwritten. Seeding: change the schema. Benefit: a second schema change. Metric: no edit to the generated file, and turns.
    - **Runs:** 5 per arm (on vs off); go to 10 if the cost difference is within run-to-run noise. The off arm runs only the benefit task.
    - **Rough cost:** on arm 3 × 5 × (≈ $1.2 seed + ≈ $0.6 benefit) ≈ $27; off arm 3 × 5 × ≈ $0.6 ≈ $9; screen and merge < $0.05. **≈ $35 per full eval** (range $25–50).
13. **Phases §3 (validation).** Add these checks:
    - **Screen false positives:** a commit SHA in `evidence` isn't rejected.
    - **Prompt-hook alias:** not used anywhere.
    - **Detached filer:** survives the session's exit, and a second session skips while the first holds the lock.
    - **Child sessions:** screen and merge children leave no `~/.claude/projects/*/memory` directories and fire no agent-org hooks (no new `~/.agent-org/state/<sid>`).
    - **Teammates:** a teammate lesson is captured once.
    - **Level 0–1:** produces no proposals, or goes through `/agent-org:remember` if Q2 says so.
14. **Rule card (H2, M7).** Add one line: "agent-org memory notes are leads, not facts; re-verify against current code. Claude Code's own auto memory is separate." Keep the card under 2,000 characters.

## 5. Proposed decisions D31+

- **D31. Memory is an optional, script-filed module with no new agent (M1, M12). Decided.**
  - **Filing:** a detached Node filer does it. Its only model calls are the Haiku screen and the merge.
  - **Storage:** no vector database: files, indexes and a search script.
  - **Default:** off.
- **D32. Lessons come from the specialist report contract (M3). Decided; extraction Verified (P2, P2b).**
  - **Contract:** an optional trailing `lessons:` block, parsed by the existing `SubagentStop` command.
  - **Malformed block:** no lesson, no block.
  - **Duplicates:** removed per agent and lesson hash.
  - **Teammates:** included; Verified only through Phase 6 identity evidence (A3).
- **D33. Screening is a regex blocklist at capture plus a Haiku `claude -p` call at filing, and only `clean` is filed (M4). Decided (§6a Q4); mechanism Verified (P1, P1f, P2b).**
  - **At capture:** a blocklist match is rejected before any write, so no credential ever reaches disk.
  - **At filing:** the Haiku check runs in the detached filer; nothing leaves `inbox/` without `clean`.
  - **Not prompt hooks:** they can only redirect the agent, and the alias `haiku` fails there.
  - **Child call:** `--settings '{"disableAllHooks":true}'`, `--strict-mcp-config`, `--tools ""`, auto memory disabled, a temp cwd.
  - **Failures:** every failure kind is distinct and keeps the proposal in `inbox/`.
  - **Honesty:** documented as a floor, not a guarantee.
- **D34. Filing runs in a detached process started at `SessionStart`, under a fail-closed PID-plus-TTL lock, and only for work that passed review (M5). Decided (§6a Q2, Q7); detach and PID check Verified.**
  - **Passed review:** the agent's last audit `result` is PASS and its intent's last audit `intent-status` is VERIFIED. A new `record.mjs` event records the status change, so filing never parses intent markdown.
  - **Level 0–1:** specialist lessons only. The user-only `/agent-org:remember <lesson>` covers the rest, where the user typing it counts as the review. It still runs the capture-time blocklist and the filing-time Haiku check.
- **D35. Search and loading (M8, M9). Decided (§6a Q3); caps Verified in docs.**
  - **D14 exception:** `memory-search` is model-invocable, the second skill after `deliver`. It's read-only, and without it the feature depends on the 6,000-character index alone.
  - **Loading:** a separate `SessionStart` hook within 6,000 characters.
  - **Search:** a pure-Node search script in the `memory-search` skill.
  - **Counting:** usage counted by an `if`-filtered `PostToolUse(Read)` and by the script.
- **D36. The project key is the normalized `origin` remote (M2). Decided (§6a Q1).** For a fork, `origin` is the user's own fork.
  - **Fallbacks:** `local-<path hash>` with no remote, else the first remote alphabetically. `upstream` is recorded, not keyed.
  - **Joins:** to the audit log and intents through the note's `repo` (the D6 name) and `KEY.json`.
- **D37. Memory never lives in a git work tree or under `~/.claude`, and child sessions never touch `~/.claude/projects/*/memory` (M2, H2). Decided; check Verified (D3, P2b).**
- **D38. One switch, env first, default off (M11). Decided (§6a Q5).**
  - **Switch:** `AGENT_ORG_MEMORY` overrides `~/.agent-org/config.json`.
  - **When off:** every memory hook exits 0 at once.
  - **Isolation:** `AGENT_ORG_MEMORY_ROOT` and `AGENT_ORG_HOME` keep evals off the real store.
- **D39. Lessons are leads (M7). Decided.** Every runtime binding and the rule card says it, and auto memory is named as separate.

## 6. Open questions for you

1. **Project key (D36).** Is the normalized `origin` remote OK, with `local-<hash>` as the fallback? For a fork with `origin` and `upstream`, should lessons key on the fork (my recommendation) or the upstream?
2. **Review signal at Level 0–1 (D34).** Level 0–1 has no specialists, so no report and no audit `result`. Options:
   - **(a)** v0.3 files **specialist lessons only** (simplest, no review gap)
   - **(b)** add a user-only `/agent-org:remember <lesson>`, where the user typing it is the review (my recommendation, together with a)
   - **(c)** capture main-thread lessons at `Stop` and treat a passing Level 1 test run as review (weak, and A1-dependent)
3. **D14 exception.** Should `memory-search` be model-invocable? Without that, Claude can't look up a lead on its own, and the gain depends on the 6,000-character index alone. It would be the second model-invocable skill.
4. **Unscreened text in `inbox/`.** Screening at filing time means a proposal containing a secret sits in `~/.agent-org/memory/inbox/` until the next session (owner-only permissions, never loaded or searched). Is that acceptable? The alternative is an `async: true` capture hook that screens before writing; in `-p` runs it can be cancelled at teardown, which loses the lesson.
5. **Default off?** I propose memory ships disabled and you turn it on with `AGENT_ORG_MEMORY=1` or the config file.
6. **v0.2 basename collision (D1).** The audit log and intents already merge same-named repos. Fix that in v0.3 by moving them to the new key (a migration), or leave it documented?
7. **`intent-status` audit event (C3).** OK to add a small `record.mjs` change in v0.3 so VERIFIED is recorded in the audit log?

## 6a. Resolved (user answers, 2026-11-09)

| Q | Answer | Effect on this report |
|---|---|---|
| 1. Project key | Key on `origin` (the user's fork), with the path-hash fallback | D36 Decided |
| 2. Level 0–1 | (a) plus (b): specialist lessons only, plus a user-typed `/agent-org:remember`. Not (c): a passing test run is too weak to count as review | D34 |
| 3. Model-invocable search | Yes. Search only reads, so the D14 exception is low risk | D35 |
| 4. Unscreened text in `inbox/` | Split it: the regex runs at capture, so no credential ever reaches disk; Haiku runs at filing. My first draft had moved both checks to filing, reversing M4 without saying so | §4 items 4–5, D33 |
| 5. Default off | Yes | D38 |
| 6. Same-named repos | A v0.2 bug: fix in **v0.2.1**. v0.3 bundles no migration | §4 item 9; add it to the v0.2.1 backlog |
| 7. `intent-status` audit event | Yes; parsing markdown for VERIFIED is fragile | D34; C3's join uses the event |

All seven questions are closed. The plan edits in §4 still apply to `docs/v0.3-plan.md` in the Generate phase.

## 7. Cleanup and isolation

- **Deleted:**
  - `~/.claude/projects/-private-tmp-…-scratchpad-07-probe/` (an empty `memory/` created by auto memory during P1)
  - `~/.claude/projects/-private-tmp-…-scratchpad-07-probe-repo/` (two sessions plus subagent transcripts)
  - `/private/tmp/claude-502/-private-tmp-…-scratchpad-07-probe-repo/` (task outputs)
  - the temp cwd `/var/folders/…/T/p7-xS1Nv6`
  - **`~/.agent-org/state/3c15d464-…/` and `~/.agent-org/state/b4c6d4fc-…/`**: dispatch records the installed v0.2 `record.mjs` wrote for the two probe sessions. Their content was only `dispatch: {<id>: {agentType: "probe:lessoner"}}`
- **Checked afterwards:**
  - no probe slugs under `~/.claude/projects`, and no probe directories under `/private/tmp/claude-502`
  - `~/.agent-org/` holds `audit backups intents state`, as before
  - `state/` holds only the pre-existing `audit-agent-org.head`, `b002a4fa…` and `f18b37e1…`
  - `~/.agent-org/audit/agent-org.jsonl` is unchanged (1278 bytes, Nov 8 19:58)
  - `~/.agent-org/memory/` was never created
  - the detached probe children have exited (marker files written, no process left)
- **Untouched:**
  - `~/.claude/settings.json` (mtime Nov 8 19:49, before this session)
  - the installed plugin (`claude plugin list`: agent-org 0.2.0 enabled)
  - `agent-personas`, and any application repo
  - the probe loaded only through `--plugin-dir` (P2) and `--settings` JSON (P1)
- **Not mine:** `~/.claude/teams/session-51359469/` and `~/.claude/tasks/session-51359469/` were created at 09:30 by Claude Code for **this** interactive session (the hook env shows `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` set in this environment). Left alone.
- **Evidence kept** in this session's scratchpad only (`…/scratchpad/07/`): `docs/` (doc snapshots), `probe/out/` (P1/P1f output, P2/P2b stream-json and hook logs, the markers, and copies of both probe transcripts and state records), the probe plugin and `screen.mjs`. It's outside the repo and goes away with the session.
- **This repo:** only this report was added. No commits, pushes or tags.
