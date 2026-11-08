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

### D5. Levels are defined by concrete triggers, not adjectives — Decided
| Level | Definition | Handling |
|---|---|---|
| 0 | Question, explanation, read-only lookup, docs typo | Main thread. No agents. |
| 1 | Localized change, no more than ~2 files, no trigger hit | Main thread gives a one-line "here's what I'll do", then does it with focused tests. No intent file. |
| 2 | Any of: more than ~2 files or more than one module; public API or contract change; schema or migration; new or upgraded dependency; auth or authz; secrets or credentials; CI/CD or infra/IaC; cross-service integration; user-visible behavior change | PM → intent file → **your approval** → only the specialists whose triggers fired |
| 3 | Any of: auth/authz redesign; sensitive-data handling; production data migration; multi-service architecture change; production release or deploy; significant AI/ML platform work | As Level 2, plus independent QA and InfoSec, durable evidence, and human approval before release |

Level 2 catches most real work, so the line between 1 and 2 is drawn by triggers to avoid both needless approval stops and risky changes slipping through.

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

## Repo

### D17. This repo is public — Decided
No secrets, tokens, absolute home paths, synced-bucket IDs or employer-specific details in the prompts or the generated plugin. Licensed MIT.

### D18. Validate before permissions — Decided
Phase 3 is live validation and Phase 4 is permissions. The permissions work depends on answers only a live run gives: whether `PreToolUse` input identifies the calling agent (which decides whether QA's `Edit` can be limited to test paths), and what real `UserPromptSubmit` payloads look like (for the hook filter).

### D19. Background agents: wait for every report — Decided
In this build, `Agent` calls run in the background by default and report back as notifications (Phase 3 §6). That's kept. `deliver` waits for **every** dispatched report before starting dependent tasks, setting `IMPLEMENTED` or verifying. `IMPLEMENTED` is saved as its own edit before validation (verified, Phase 4 G4c).

### D20. Level 1 is an instruction, not a description — Decided
Phase 3 (F3, 2/2 runs) showed "one-line plan, then do it with focused tests" gets skipped. The rule card now ties the plan to the tool call: the first Edit or Write must come after a line starting "Plan:"; then run the repo's tests. Phase 3b: tests ran 2/2, plan-before-edit 1/2. Phase 4, after the tool-tied wording: 2/2. This stays instruction-only and best-effort; a hook isn't worth it for Level 1.

### D21. Install from a pinned remote; develop with `--plugin-dir` — Decided, Verified
Installed from the local folder, the plugin is read live from the working tree, so any edit or branch switch changes the running plugin (Phase 3 §2). That breaks the pinned-and-versioned promise of D15. Target: tag releases on `production` and install from GitHub, pinned to the tag; test development changes with `claude --plugin-dir ./plugin`. Verified in Phase 4: `claude plugin marketplace add jmthompson-dev/agent-org@vX.Y.Z` pins to a tag, and the install is cached by `plugin.json` `version`, so **every release must bump `version`** or updates silently do nothing. `claude --plugin-dir ./plugin` silently shadows the installed copy for that session. Re-pin by removing and re-adding the marketplace. Pin to tags, not the `production` branch: tags don't move.

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

### D26. Parallel specialists share one tree; collisions are prevented where possible, detected always, and re-planned — Decided; mechanism Verified (P5 P2)
Parallel only when B1 holds. A `PostToolUse` ledger keyed by `agent_id` attributes edits; the guard denies an edit to a file another agent of the same parallel group changed; the main thread detects the five collision shapes of B3. Response: stop, name file and agents, PM re-plans sequentially, user approves. No fixer agent. Edit for existing files.
Verified in Phase 5: P5 B1–B5 (P2), `reports/05-inspect-v0.2-2026-11-08.md`.

### D27. The audit log is hook-written, hash-chained, rotated and tamper-evident — Decided; locking and verification Verified (P5 local tests); `systemMessage` display Open (Phase 6)
Dispatch from `PostToolUse(Agent)` with `resolvedModel`; result from `SubagentStop`. Locked appends, head record, rotation at 10 MB with the chain carried across files, incremental verify at SessionStart with a user warning, full verify on demand, guard `ask` on `~/.agent-org/audit/` and `~/.agent-org/state/`. Never content.
Verified in Phase 5: P5 C1–C5, `reports/05-inspect-v0.2-2026-11-08.md`.

### D28. The scope-growth guard is session-scoped and always asks — Decided; fields Verified (P5 D1–D5)
Main-thread edits to more than ~3 files, or a first risky-path edit, with no approval recorded for this `session_id`, trigger `ask`. Approval is recorded by a `PostToolUse` hook; it survives resume and compaction, not `/clear` or a fork. Bash edits are a documented gap.
Verified in Phase 5: P5 D1–D5, `reports/05-inspect-v0.2-2026-11-08.md`.

### D29. At Level 3, the independent QA reviewer reproduces the key claims — Decided
The Level 3 QA reviewer (already required by D5) also reproduces the key claims before VERIFIED: it reruns the stated commands, re-checks the stated files, edits nothing, and marks each claim REPRODUCED or NOT REPRODUCED with evidence. If that QA instance wrote code or tests in this job (it appears in the edit ledger), it isn't independent, so a fresh `quality-assurance-architect` instance that took no part does the reproduction instead. VERIFIED requires every key claim REPRODUCED. No separate auditor agent: a dedicated one would duplicate the Level 3 reviewers and need a persona that doesn't exist in agent-personas (D15). The no-edit rule is instruction-only (QA can still edit test paths). Acceptance in Phase 6.

### D30. Agent teams are a justified fallback, gated by approval and enforced by the guard (supersedes D7) — Decided; docs Verified; teammate hook identity Open (Phase 6)
Subagents by default; `Mode: team` only when a hand-off can't be pinned, justified in the intent and approved. The guard denies named `agent-org:*` dispatches without an approved team mode and sends the main thread back to re-plan. Requires the flag and an interactive session, otherwise both options are offered. In-process only; the lead never names a teammate model; strict "Owns"; B3 and the audit apply; conflicts escalate only through re-planning.
Verified in Phase 5: P5 B3, F0–F6, `reports/05-inspect-v0.2-2026-11-08.md`.
