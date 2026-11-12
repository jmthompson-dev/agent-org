# Design decisions

Status key: **Decided** · **Verified** (confirmed in Phase 1 against docs or the CLI) · **Open** (needs a live test in Phase 3)

## Orchestration

### D1. Plain Claude stays the default agent — Decided, Verified
The plugin ships **no** `settings.json`, so it never changes the main thread. A PM that can't edit code would turn every small fix into a two-agent handoff, which defeats the minimum-effective-agents principle.

### D2. The PM plans; the main thread dispatches — Decided
On escalation, the main thread calls `agent-org:principal-project-manager`. The PM classifies the task, sets the level and returns an intent document and specialist assignments. The **main thread** writes the intent file, gets approval and dispatches the specialists.
- The PM has **no `Agent` tool**. Specialists have no `Agent` tool either, so nothing nests.
- Why not let the PM dispatch, given that nesting works (Phase 1 §5d)? Specialist output would be buried two levels down; agent teams, if enabled, forbid nesting; and the PM would become a relay bottleneck. Dispatching from the main thread works in every configuration.

### D3. Escalation is hook-first, judgment-second — Decided
- A `UserPromptSubmit` hook pattern-matches hard triggers using **word boundaries** (so `author` doesn't match `auth`) and injects a *nudge* to load the `agent-org:deliver` skill. It is not an order.
- A short `SessionStart` rule card gives the main thread the level definitions in every session, so model judgment covers what the hook misses.
- The hook fails open, has no dependencies, uses a short timeout and produces the same output however often it fires.
- Trigger groups: auth, secrets, data, infra, delivery, change (dependencies, upgrades, breaking changes, public API). Bare `production`, `release`, `pipeline` and `token` are excluded: they fire on ordinary prompts, and a nudge that fires constantly gets ignored.
- `UserPromptSubmit` also fires on background-agent reports. Phase 3 showed this happens on **every** escalation: agents run in the background by default, and each report arrives as a prompt starting `<task-notification>`, with the same payload keys as a typed prompt. The hook skips those. **Verified** (Phase 3 §6). Cross-session messages weren't observed.

### D4. Hard triggers set the minimum level — Decided
A trigger sets the floor. The PM can raise a level but never lower it below a trigger.
**v0.2.2 (D34):** the floor is enforced for the main thread. A request's level never goes down: a later level check, the PM or the guard can only raise it. "Unsure" counts as yes.

### D5. Levels are defined by concrete triggers, not adjectives — Decided
| Level | Definition | Handling |
|---|---|---|
| 0 | Question, explanation, read-only lookup, docs typo | Main thread. No agents. |
| 1 | Localized change, no more than 2 files, no trigger hit. Copy-only text changes, and bug fixes that restore intended behavior, are Level 1. | Main thread runs the level check (D34), then does it with focused tests. No intent file. |
| 2 | Any of: more than 2 files or more than one module; public API or contract change; schema or migration; new or upgraded dependency; auth or authz; secrets or credentials; CI/CD or infra/IaC; cross-service integration; user-visible behavior change, meaning a change to what the user can do or what the system returns, beyond restoring intended behavior | PM → intent file → **your approval** → only the specialists whose triggers fired |
| 3 | Any of: auth/authz redesign; sensitive-data handling; production data migration, meaning moving, transforming, deleting or backfilling existing production data (a new nullable column with no backfill is Level 2 through the schema trigger); multi-service architecture change; production release or deploy; significant AI/ML platform work | As Level 2, plus independent QA and InfoSec, durable evidence, and human approval before release |

Level 2 catches most real work, so the line between 1 and 2 is drawn by triggers to avoid both needless approval stops and risky changes slipping through.
**v0.2.2 (Phase 10):** "~2 files" became "2 files". "User-visible behavior change" is defined as a change to what the user can do or what the system returns; copy-only text changes are Level 1. Why: report 10 found the line ambiguous in both directions. The 3-file refactor (B3) went Level 1 in 5/5 runs. The 2-file copy change (B4) also went Level 1 in 5/5, which you ruled correct, so the definition now says so. Phase 10 Part 3 split two controls on wording: a bug fix (C1a) answered `behavior=y` in 2 of 4 runs, and a nullable-column migration (C2a) answered `proddata=?` in 2 of 4. So bug fixes that restore intended behavior aren't behavior changes, and "production data migration" means moving, transforming, deleting or backfilling existing production data.

### D6. Level 2+ work requires an approved intent file — Decided
- The PM writes the content. The main thread saves it to `~/.agent-org/intents/<repo>/<YYYY-MM-DD>-<slug>.md` and creates the directory if it's missing.
- **Not under `~/.claude`.** Claude Code treats every path there as a sensitive file and refuses agent writes even with explicit allow rules (Phase 3 F1). That protection is worth keeping.
- **The save is a hard gate.** If it fails, the workflow stops: no implementation until the file exists or you explicitly waive it (Phase 3 F2).
- **Open questions are `[BLOCKING]` or `[NON-BLOCKING]` with a stated default.** A blocking question has **no default and no recommended answer**; if the PM would recommend one, it's non-blocking. Blocking questions are asked in a turn that doesn't request approval, and "approved" never answers one (Phase 3b N1: a bare approval settled a blocking question). "Approved" accepts the plan and the stated non-blocking defaults, nothing more.
- Specialists are named by exact `agent-org:<id>` from a roster the main thread sends the PM (Phase 3b: without it, the PM invented ids in 3/5 runs).
- Phase 4: held 4/4 (G1×2, G2×2). Blocking questions were asked without an approval request, and "Approved." never answered one. The roster held in 3/3 PM drafts with no invented ids. The main thread must not suggest answers to blocking questions (G2b offered an example).
- Intent files are written with the Write and Edit tools, never Bash. Write creates missing directories, so no `mkdir` permission is needed (Phase 3b N3).
- **Nothing is implemented until you explicitly approve.** The approval is recorded in the file.
- Not stored in the target repo, so application repos stay untouched. Not stored in session memory, because it would be lost on session end or compaction. Not stored in an OS cache folder, which can be wiped at any time. Not stored in `~/Library/Application Support`, because that path is macOS-only. Not stored in `~/.claude`, which is write-protected for agents. `~/.agent-org` works on every OS.
- `<repo>` is the basename of the git top level, or of the working directory outside git.
- The approval gate is an **instruction, not enforcement**. Nothing technically stops a model from skipping it. That gap is documented, not hidden.
- **v0.2.1 (V21-9, V21-10, V21-3):** `<repo>` is now the repo key's directory form (D31), and the file name carries a session prefix: `~/.agent-org/intents/<repo key>/<YYYY-MM-DD>-<slug>-<session prefix>.md`, from `record.mjs --intent-path`. Each intent records its repo key, top level and owning session (D32). v0.2.0 intents under the basename folder stay readable but never approve (Phase 9 review). After `VERIFIED` the main thread offers to commit and never commits, pushes or tags unless you ask in that session (Phase 6c: an unrequested commit attempt).

### D7. Agent teams are out of scope for v0.1 — Superseded by D30
Superseded by D30: agent teams are a justified, approved and guard-enforced fallback in v0.2.
They're off on this machine. With teams enabled, a named subagent becomes a teammate and teammates can't nest. D2 avoids depending on nesting, so turning teams on later doesn't break the design.

## Models

### D8. Pin every agent's model; never use `inherit` — Decided
`inherit` silently drops architects to Sonnet in a Sonnet session, or puts everything on Opus at Opus prices.
- **opus:** `principal-project-manager`, `solutions-architect`, `information-security-architect`, `ai-ml-research-architect`
- **sonnet:** all others

Run the everyday session on Sonnet. Levels 0–1 never spawn an agent, so trivial fixes cost only the session model. Use the built-in `Explore` agent for cheap lookups; don't add a Haiku agent.

## Packaging

### D9. Delivered as a plugin through a marketplace in this repo — Decided
`.claude-plugin/marketplace.json` at the repo root points to `./plugin`. The generated plugin is committed, so every regeneration is a reviewable diff.

### D10. Plugin settings can't carry permissions — Verified
Plugin `settings.json` honors only `agent` and `subagentStatusLine`. Ask rules live in user `settings.json`. **Installed in Phase 4:** 102 ask rules (Bash and PowerShell forms) plus one scoped allow (D22). Backup in `~/.agent-org/backups/`.

### D11. Hooks live only in the plugin — Decided
Plugin hooks and user hooks aren't de-duplicated, so Phase 4 must not copy the plugin's hooks into user settings.

### D12. The command guard — Decided, Verified
Ask rules match command text only (`git -C . push` slips past `Bash(git push *)`). The plugin's `PreToolUse` guard (`hooks/guard.mjs`) normalizes and splits shell commands (wrappers, absolute paths, `git -C`, `sh -c`, `$(…)`, global flags) and returns `ask` on the user ask list, naming every match. It also **denies** `agent-org:quality-assurance-architect` `Edit`/`Write` outside test paths, using `agent_type`. It never returns `allow` and fails open, so the ask rules stay the primary layer. Verified live: `git -C . push` stopped (Phase 4 G6), QA's `src/` edit denied (G5′).
Out of reach, by design: git aliases, scripts or Makefiles that run git, interpreter one-liners (`python -c "os.system(...)"`), and variable-built commands. QA's Bash isn't path-scoped.
**v0.2.2 (D34):** the guard returns one `allow`: for the main thread's exact level-check call (`node <this plugin>/hooks/record.mjs --level-check "<answers>"`, optional `--source deliver|pm`). The command name in the raw text must be node itself, with no env prefix or wrapper. There is one segment, no redirect, substitution or operator, the script must be this plugin's own `record.mjs`, and the answers must be well-formed. Why: the check runs before every Level 1 edit, so a permission prompt each time would train you to click yes. The command only prints the mapping and writes nothing (the guard records the check).
**v0.2.1:** the specialist ask-list deny and the QA test-path deny are audited as `guard-deny` (V21-2; Phase 6c had no audit line for three push denies). A new deny protects intents another session owns (D32). Engineer bindings now list commit, push, merge, tag and deploy commands as guard-enforced, not instruction-only (V21-8); routes the guard can't see stay instruction-only.

### D13. No rules or CLAUDE.md in the plugin — Verified
A plugin's root `CLAUDE.md` isn't loaded. Orchestration policy lives in the `deliver` skill, the `SessionStart` rule card and the agents' runtime bindings.

### D14. One model-facing entry point; everything else is user-only — Decided
`deliver` is the **only** skill Claude can invoke by itself, so every self-started piece of work goes through the PM, one set of level rules and one approval gate. Inside `deliver`, the PM already assigns architects and InfoSec when their triggers fire, so model-invocable review skills would be a second, competing route to the same work.
| Skill | Invocation | Purpose |
|---|---|---|
| `deliver` | model + user | The escalation workflow: PM → intent → approval → dispatch → verify |
| `pm` | user only | Force escalation: `/agent-org:pm <task>` |
| `architecture-review` | user only | Standalone design review with only the relevant architects; recommends, never approves |
| `security-audit` | user only | Standalone audit: scope check → threat analysis → justified scans → evidence → retest; never accepts risk |
| `release-validation` | user only | Pin the candidate; collect QA, Product and InfoSec dispositions and human approvals; never deploys |

All are main-thread workflows that dispatch agent-org specialists, which keeps D2 intact. User-only skills don't sit in Claude's context as matching candidates, so this also cuts always-loaded text. The `engineering` and `design` plugins, synced from claude.ai, duplicated the specialists and carried failing connectors. **Decided: disabled** at the claude.ai source, since a local-only disable may be re-synced. Phase 3 confirmed they still appear in `claude plugin list` but are disabled.

## Personas

### D15. Persona text is verbatim and pinned to a commit — Decided
- Each agent embeds its canonical persona body unchanged, between marker comments, stamped with the source commit.
- The plugin pins a specific `agent-personas` commit, recorded in `plugin.json` `metadata`. It does **not** follow the persona repo's `main` HEAD. Bump the pin deliberately by regenerating.
- First pin: the commit that contains the event-driven supervision fix, which replaced the PM's unenforceable "every 60 seconds" clauses at the source instead of overriding them in the plugin.

### D16. The infra agents get disjoint descriptions — Decided
- **devops:** pipelines, CI files, release and promotion. Owns IaC wiring into pipelines, and pipeline secret references.
- **platform:** shared runtime (orchestration clusters, service mesh, internal developer platform, paved paths). Owns reusable IaC modules for shared services, and runtime secret injection.
- **cloud:** provider accounts, network, IAM, cost and quotas. Owns provider-resource IaC, and provider secret stores.
- **v0.2.1:** descriptions are now built from the personas' Use for / Not for lines (D33), so the D16 split lives in the infra trio's persona Not for lines.

## Repo

### D17. This repo is public — Decided
No secrets, tokens, absolute home paths, synced-bucket IDs or employer-specific details in the prompts or the generated plugin. Licensed MIT.

### D18. Validate before permissions — Decided
Phase 3 is live validation and Phase 4 is permissions. The permissions work depends on answers only a live run gives: whether `PreToolUse` input identifies the calling agent (which decides whether QA's `Edit` can be limited to test paths), and what real `UserPromptSubmit` payloads look like (for the hook filter).

### D19. Background agents: wait for every report — Decided
In this build, `Agent` calls run in the background by default and report back as notifications (Phase 3 §6). That's kept. `deliver` waits for **every** dispatched report before starting dependent tasks, setting `IMPLEMENTED` or verifying. `IMPLEMENTED` is saved as its own edit before validation (verified, Phase 4 G4c).

### D20. Level 1 is an instruction, not a description — Decided
Phase 3 (F3, 2/2 runs) showed "one-line plan, then do it with focused tests" gets skipped. The rule card now ties the plan to the tool call: the first Edit or Write must come after a line starting "Plan:"; then run the repo's tests. Phase 3b: tests ran 2/2, plan-before-edit 1/2. Phase 4, after the tool-tied wording: 2/2. This stays instruction-only and best-effort; a hook isn't worth it for Level 1.

**v0.2.2 (D34):** superseded for the Level 1 plan line. The unenforced "Plan:" line is replaced by the enforced level check. The rule card no longer asks for "Plan:", and the "run the tests after editing" instruction stays.

### D21. Install from a pinned remote; develop with `--plugin-dir` — Decided, Verified
Installed from the local folder, the plugin is read live from the working tree, so any edit or branch switch changes the running plugin (Phase 3 §2). That breaks the pinned-and-versioned promise of D15. Target: tag releases on `production` and install from GitHub, pinned to the tag; test development changes with `claude --plugin-dir ./plugin`. Verified in Phase 4: `claude plugin marketplace add jmthompson-dev/agent-org@vX.Y.Z` pins to a tag, and the install is cached by `plugin.json` `version`, so **every release must bump `version`** or updates silently do nothing. `claude --plugin-dir ./plugin` silently shadows the installed copy for that session. Re-pin by removing and re-adding the marketplace, then reinstalling: removing the marketplace also uninstalls the plugin, so `claude plugin update` fails with "not installed" (v0.2.1 release). `~/.agent-org` is untouched. Pin to tags, not the `production` branch: tags don't move.

### D22. Write permissions must be scoped — Decided, Verified
An unscoped `Write` allow rule permits writes outside the working directories (Phase 3b N4). The installed rule is `Edit(~/.agent-org/intents/**)`: `Write(path)` rules never match, and `Edit` rules cover Write. That rule alone allows the intent writes outside the working directory, with no `additionalDirectories` (Phase 4 G1, G4). No bare `Write` or `Edit`.

### D23. Headless `ask` means deny — Decided, Verified
In `claude -p` runs, an `ask` from a rule or the guard has no one to answer, so the call is denied (Phase 4 G6). Specialists running headless can't commit or push, which is intended. Interactive sessions prompt; guard prompts are labelled `[plugin:agent-org]`. The user `git commit` ask rule was confirmed interactively after Phase 4: asking Claude to commit raised an approval prompt.

### D24. Specialists write files with Edit/Write, not Bash — Decided
Phase 4 G4b: a developer bundled `git checkout -b … && cat > file <<EOF … && npm test` into one Bash call, and one unapproved part blocked the whole call. Runtime bindings for every specialist with Bash now say: create and change files with Edit/Write, and keep each Bash call to one purpose.

## v0.2

### D25. Hallucination checks scale with the level and are hook-enforced from Level 0 — Decided; mechanism Verified (P5 P1a, P3)
A1 (`Stop`, main thread) and A2 (`SubagentStop`, agent-org specialists) read `last_assistant_message`, require a successful matching tool call in the current turn for each verification claim, and check that every cited file was opened this session. Block once when `stop_hook_active` is false, then allow with a warning. Relayed claims are recognized by matching specialists' own reports. Fails open, logs no content, catches invented files, not misread lines. Tool-output instructions are data (A3).
Verified in Phase 5: P5 A1–A8 (P1a, P3), `reports/05-inspect-v0.2-2026-11-08.md`.
**Phase 6 changes:** the citation check covers only `path:line` citations, skips negated and future-tense sentences, and counts paths seen in tool output (17 of 21 blocks were false before). Claims in a turn with no tool calls may be backed by the previous turn. The block form is `hookSpecificOutput.additionalContext` ("Stop hook feedback", not "Stop hook error"). The PM is exempt from the report contract on `SubagentStop` and `SubagentHandback`.
**Phase 6b changes:** when `SubagentStop` has no `last_assistant_message` (the specialist reported through `SubagentHandback`), the report text comes from that hand-back message. Hedges and estimates aren't claims. A later `Outcome:` line is used when the first line has none. `VERIFIED` requires every acceptance criterion met or waived by the user.
**v0.2.2 changes (Phase 10 C0: 4 of 5 Level 0 runs blocked falsely):** `path:line` pairs shown in Grep or Read output count as opened. A Grep over one file (`path` = that file) prints numbered lines with no path, so that file counts when its output shows numbered lines. A `path:line` pair inside Read output counts too, but a bare path there doesn't. Failed Greps and `files_with_matches` output don't count. Test: the C0-1 transcript shape (`tests/v022.test.mjs`). Also, "I ran no …" (and "ran none", "executed no") negates, but only after a run verb, so the "no errors" claim kind still counts (Phase 10 x1c: "I ran no level check" was blocked falsely).
**v0.2.1 changes (V21-1, Phase 6c: 6 of 7 main-thread blocks false):** finished teammates' `<teammate-message>` reports (idle-notification results; plain messages once the teammate finished) join the relay pool; "none of" and "not yet" negate; status sentences ("Status:", "marked VERIFIED"), "verified" as an adjective and purpose clauses ("Goal:", "so that", "to make … pass") aren't claims; a turn whose only calls edit intent files may restate the previous turn's evidence. Two additions beyond the 6c fix list, both needed to clear its cases on replay: a list item whose bold label is negated, hedged or a goal qualifies its whole line, and relay matching ignores a few filler words and accepts any non-negated specialist sentence. Every skip rule judges each `;` clause on its own, so "Not run yet: integration; unit tests pass" still blocks. Tests: `node tests/run.mjs`. Replay of the seven 6c blocks: 0 of 6 false blocks remain, the true one still blocks (Phase 9).

### D26. Parallel specialists share one tree; collisions are prevented where possible, detected always, and re-planned — Decided; mechanism Verified (P5 P2)
Parallel only when B1 holds. A `PostToolUse` ledger keyed by `agent_id` attributes edits; the guard denies an edit to a file another agent of the same parallel group changed; the main thread detects the five collision shapes of B3. Response: stop, name file and agents, PM re-plans sequentially, user approves. No fixer agent. Edit for existing files.
Verified in Phase 5: P5 B1–B5 (P2), `reports/05-inspect-v0.2-2026-11-08.md`.

### D27. The audit log is hook-written, hash-chained, rotated and tamper-evident — Decided; locking and verification Verified (P5 local tests); `systemMessage` display Verified (Phase 6)
Dispatch from `PostToolUse(Agent)` with `resolvedModel`; result from `SubagentStop`. Locked appends, head record, rotation at 10 MB with the chain carried across files, full verify of the active file at SessionStart with a user warning (Phase 6: the incremental checkpoint missed a same-length edit; `systemMessage` confirmed visible in the terminal), full verify of rotated files on demand (the hash covers parsed content, so a whitespace-only edit shows as a head mismatch, not by line), guard `ask` on `~/.agent-org/audit/` and `~/.agent-org/state/`. Never content.
Verified in Phase 5: P5 C1–C5, `reports/05-inspect-v0.2-2026-11-08.md`.
**v0.2.1 (V21-9):** files and head records are named by the repo key's directory form (D31); each line also carries `key`, with `repo` kept as the display name. v0.2.0 files named by basename stay in place, still listed and verified. Not migrated: you chose the fallback (2026-11-11), so new data uses the key and old files stay where they are.

### D28. The scope-growth guard is session-scoped and always asks — Decided; fields Verified (P5 D1–D5)
Main-thread edits to more than ~3 files, or a first risky-path edit, with no approval recorded for this `session_id`, trigger `ask`. Approval is recorded by a `PostToolUse` hook; it survives resume and compaction, not `/clear` or a fork. Bash edits are a documented gap.
Verified in Phase 5: P5 D1–D5, `reports/05-inspect-v0.2-2026-11-08.md`.
**v0.2.2:** amended by D34 for the main thread in the working directory's repo, for payloads with a `prompt_id`: the level gate denies instead of asking, counts files per request instead of per session, and denies at the 3rd file instead of asking at the 4th. Other repos and payloads without a `prompt_id` keep this rule unchanged.
**v0.2.1 (V21-9, V21-10):** approvals, the scope counter and risky kinds are keyed by the repo key (D31), and an approval comes only from an intent whose recorded key matches its folder (D32). Before this, an approval in `…/a/app` silenced the guard in `…/b/app`, within one session or via another session's intent (Phase 9, tested on the v0.2.0 code).

### D29. At Level 3, the independent QA reviewer reproduces the key claims — Decided
The Level 3 QA reviewer (already required by D5) also reproduces the key claims before VERIFIED: it reruns the stated commands, re-checks the stated files, edits nothing, and marks each claim REPRODUCED or NOT REPRODUCED with evidence. If that QA instance wrote code or tests in this job (it appears in the edit ledger), it isn't independent, so a fresh `quality-assurance-architect` instance that took no part does the reproduction instead. VERIFIED requires every key claim REPRODUCED. No separate auditor agent: a dedicated one would duplicate the Level 3 reviewers and need a persona that doesn't exist in agent-personas (D15). The no-edit rule is instruction-only (QA can still edit test paths). Acceptance in Phase 6.

### D30. Agent teams are a justified fallback, gated by approval and enforced by the guard (supersedes D7) — Decided; docs Verified; teammate hook identity Verified (Phase 6)
Subagents by default; `Mode: team` only when a hand-off can't be pinned, justified in the intent and approved. The guard denies named `agent-org:*` dispatches without an approved team mode and sends the main thread back to re-plan. Requires the flag and an interactive session, otherwise both options are offered. In-process only; the lead never names a teammate model; strict "Owns"; B3 and the audit apply; conflicts escalate only through re-planning.
Verified in Phase 5: P5 B3, F0–F6, `reports/05-inspect-v0.2-2026-11-08.md`.
**Phase 6 changes:** teammate hooks carry a stable `agent_id` but `agent_type` = the teammate's name, so every check resolves the agent-org type through the dispatch record. Teammates ran in `permissionMode: "auto"` under a default-mode lead, so the guard denies ask-list commands from teammates instead of asking. **Phase 6b:** a background specialist ran `git push` in an auto-mode session after the guard only asked, so the deny now covers every agent-org specialist, teammate or subagent; the main thread keeps the `ask`. **Release check:** with the teams flag set, a named dispatch of any non-agent-org agent (no `isolation`) gets a guard `ask`, because it would start a team without the PM or the user's approval. The main thread never changes an approved plan itself; other edits to an approved intent are audited. Conflicts are recorded as `result` lines with outcome `BLOCKED`.
**v0.2.1:** the claim check relays finished teammates' messages (D25). Whether one panel message is re-delivered to a background agent (V21-7) couldn't be settled from the 6c evidence, so it's a release-checklist step, not a code change.

## v0.2.1

### D31. Repos are keyed by their normalized remote, not their basename — Decided; normalizer Verified (report 07 D2, Phase 9 unit tests)
The audit log, head records, approvals, the scope counter and intents are keyed by the normalized `origin` remote URL, else the alphabetically first remote, else `local-<sha256(realpath(top level))[:12]>`. Normalized: scheme, `user@` and port stripped, `host:path` → `host/path`, `.git` and trailing `/` dropped, host lowercased, path lowercased only on github.com, gitlab.com and bitbucket.org. On disk the key's `/` becomes `__`. The D6 basename stays for display. Why: two repos named `app` shared one audit chain, one intents folder and each other's approvals (report 07 D1, V21-9). Two clones of one remote share a key on purpose: it's the same project. A repo whose `origin` changes gets a new key. Report 07 proposed this as D36 for memory; memory was dropped (report 08), and the key landed here instead.

### D32. Each intent has one owning session and one repo — Decided
Intent files are named `<date>-<slug>-<session prefix>.md` under the repo key's folder, from `record.mjs --intent-path`, which never returns an existing path. Each records `**Repo key:**`, `**Top level:**` and `**Session:**`. The guard denies any write to an intent another session owns, and a `Write` over an intent with no recorded owner, so nothing is overwritten blind (report 08: 16 Level 2 runs left 5 files; one was written by 6 runs). An approval counts only for the key the intent records, and only if that key matches its folder. v0.2.0 intents stay readable and editable but never approve: nothing in them names their repo, so a same-named repo could otherwise claim one. Consequence: after `/clear` (a new session) the old intent can't be edited; save a new one with `--supersedes <old path>`, which records `**Supersedes:**` in its header. Review skills attach findings only to an intent their own session owns, otherwise they report in chat.

### D33. Agent descriptions are built from the persona's Use for / Not for lines — Decided (landed before Phase 9: `4ebfb6d`, `903e4ef`, `e2d959d`)
Each description is `Use for <use> <agent-org clause> Not for <not>`, with `<use>` and `<not>` taken from the persona's `**Use for:**` and `**Not for:**` lines at the pin (markdown stripped, not reworded). Only the agent-org clause is written in the plugin. Every Not for names the owner of the excluded work, so the PM can route on descriptions alone. `sync-personas.mjs --check` reports `DESC` when a description stops matching its persona; `--bump` rewrites the persona parts. Pin: `agent-personas@12a0c9c`. Why: one source for the routing text, kept in the persona repo and checked by `sync-personas`.

## v0.2.2

### D34. The level is chosen deterministically: a level check mapped by code, enforced at the first edit — Decided; mapping unit-tested (`tests/v022.test.mjs`); live behavior is Phase 10 Part 3
**What the main thread does.** Before the first file edit of each request, it answers the D5 Level 2 and Level 3 triggers (15 keys) with `y`, `n` or `?` in one Bash call: `node <plugin>/hooks/record.mjs --level-check "files=n api=n …"`.

**The mapping.** A pure function, `lib/level.mjs` `levelFromAnswers`. Unsure counts as yes; any Level 3 answer gives 3; else any Level 2 answer gives 2; else 1. Malformed or missing answers map to null.

**What the guard does with the call (`PreToolUse`):**
- records the check for the payload's `prompt_id`; the level never goes down (D4);
- audits a `level` event: the level, the source (`checklist`, `deliver`, `pm` or `floor`), the prompt id, and the answers as booleans, with `unsure` listing the unsure keys. No text;
- allows the call (D12 note).

A re-check that doesn't raise the level writes no event, so a job has one level event plus one per raise.

**The gate (amends D28 for the main thread).** It applies to a main-thread `Edit`/`Write`/`NotebookEdit` inside the working directory's repo, with a `prompt_id`, when the session has no approval for the repo key. The edit is **denied**, with no `ask`, in any of these cases:
- no check for this request: the reason gives the exact command and questions;
- the check maps to Level 2+: "load agent-org:deliver";
- the edit would be the request's third distinct file;
- the edit touches a D2 risky path (migration, CI, infra, auth).

The last two raise the request to Level 2 (`level` event, source `floor`). Files are counted per request (`prompt_id`), not per session.

**Exemptions and failure:**
- **Exempt:** paths outside the working directory's repo, including `~/.agent-org/` (intents) and the scratchpad. Other repos keep the D28 session ask.
- **Fail open:** with no `prompt_id`, unreadable state or any error, the old D28 behavior or no decision applies.

**Why:**
- **Nothing scored the level.** Report 10 found every level rule instruction-only below Level 2. The keyword nudge fired on 2 of 10 prompts, and B3 (3 files) went Level 1 5/5 with no "Plan:" line, under a scope guard that asks only at the 4th file.
- **The answers can't go in the message.** A `Level check:` block in the same message as the first edit isn't in the transcript when `PreToolUse` fires (probe, 0/3; the docs say the transcript may lag). A tool call's input is always visible.
- **Same answers, same level:** the choice is reproducible and explainable from the audit.

**Limits:**
- A model that answers `n` to everything is caught only by the deterministic floors (3rd file, risky path). An `n` on `behavior` or `api` in two ordinary files is taken on trust, but recorded.
- Bash-made edits stay a gap (as in D28).
- `prompt_id` in hook payloads was observed on `PreToolUse` and `UserPromptSubmit` (Phase 10 probe). Whether a Stop-hook continuation keeps the same `prompt_id` is unverified; if it doesn't, the model re-runs the check (one extra call).

**Cost:** one tool call per Level 1 job, or two more when the model forgets the check (deny, check, retry). Level 0 needs no check, because it makes no edits.
**Phase 10 Part 3 fixes:**
- **Chained checks:** a command that runs `record.mjs --level-check` but isn't the allowed shape on its own (chained, piped, redirected, behind an env prefix or wrapper) is denied with "run the level check as its own call" (`level-check-shape`, audited). 11 of 33 jobs had chained the check with git calls, so nothing was recorded.
- **File counts:** `files` takes a file count (more than 2 → y), because 8 of 33 first checks answered `files=2`.
- **Wording:** the `behavior` and `proddata` questions follow the D5 wording above.

