# Phase 2 — Generate the plugin

You are generating the **agent-org** Claude Code plugin into `plugin/` in this repo.

Read these first, in this order:
1. `docs/decisions.md` — the design. **It wins over anything else.** If something here seems to conflict with it, stop and ask.
2. `reports/01-inspection-*.md` — verified capabilities, frontmatter fields and hook formats. Use only syntax it marks **VERIFIED**. For anything else, check the official docs and label it **UNVERIFIED** in your report.

## Hard constraints

- Write only inside this repo: `plugin/`, `.claude-plugin/marketplace.json`, `scripts/`, `LICENSE`, and `reports/02-generate-<YYYY-MM-DD>.md`.
- Do not modify `~/.claude`, the `agent-personas` repo, or any application repo.
- Do not install, enable or update the plugin or marketplace. Do not commit, push or tag.
- Do not launch subagents, agent teams or nested `claude` sessions. Live behavior is Phase 3's job.
- No secrets, absolute home paths or employer-specific details in anything you write (D17). Hooks resolve paths at runtime.
- Don't edit persona text. If a persona looks wrong, report it.

## Preconditions — check these first, and stop on any failure

1. `~/git/agent-personas` exists, the working tree is **clean**, and you're on `main`. If it's dirty, stop: persona changes must be committed first.
2. Record `PIN = git -C ~/git/agent-personas rev-parse HEAD`.
3. At `PIN`, `agents/principal-project-manager.md` contains no `60 seconds` (`git show PIN:agents/principal-project-manager.md`). If it does, stop: the pin predates the supervision fix (D15).
4. All 14 persona files exist at `PIN`.

**Read persona text only via `git show PIN:agents/<id>.md`,** never from the working tree, so the pin is exact.

## What to generate

```
.claude-plugin/marketplace.json          # repo root; one plugin, source "./plugin"
plugin/
├── .claude-plugin/plugin.json
├── agents/<id>.md                        # 14 files
├── skills/
│   ├── deliver/SKILL.md
│   ├── pm/SKILL.md
│   ├── architecture-review/SKILL.md
│   ├── security-audit/SKILL.md
│   └── release-validation/SKILL.md
├── LICENSE
├── hooks/
│   ├── hooks.json
│   ├── escalate.mjs
│   ├── session-start.mjs
│   ├── guard.mjs
│   └── rule-card.md
└── README.md
scripts/sync-personas.mjs                 # repo-level, not shipped in the plugin
```
**No `plugin/settings.json`** (D1). **No `commands/`, `rules/` or plugin `CLAUDE.md`** (D13, D14). Remove `plugin/.gitkeep`.

`marketplace.json` lives at the repo root, not inside `plugin/`.

### 1. `plugin.json`
- `name: agent-org`, `version: 0.1.0`, a one-line `description`, and `author`.
- `metadata`: `personasRepo` (the public GitHub URL), `personasCommit: PIN`, `personasBranch: main`.
- `license: MIT`. Also write an MIT `LICENSE` (holder: jmthompson-dev, current year) at the repo root and at `plugin/LICENSE`.
- Don't set `agents`, `commands` or `skills` paths; default scanning is correct (Phase 1 §5a: setting them replaces the defaults).

### 2. `marketplace.json`
Use the verified marketplace schema. One entry: `agent-org`, source `./plugin`. Name the marketplace `agent-org`.

### 3. Agents — `plugin/agents/<id>.md`

```markdown
---
name: <id>
description: <see rules below>
tools: <see table>
model: <see table>
---

<!-- agent-org:canonical:begin source=agent-personas@<PIN> path=agents/<id>.md -->
<persona body, byte-for-byte from git show>
<!-- agent-org:canonical:end -->

## Claude Code runtime binding
<see rules below>
```

**Tools and models.** These are defaults derived from the personas' boundaries and D2/D8. If a persona's Boundaries section clearly needs a different set, change it and justify the change in the report.

| Agent | model | tools |
|---|---|---|
| principal-project-manager | opus | Read, Grep, Glob, WebFetch, WebSearch |
| solutions-architect | opus | Read, Grep, Glob, WebFetch, WebSearch |
| ai-ml-research-architect | opus | Read, Grep, Glob, WebFetch, WebSearch |
| information-security-architect | opus | Read, Grep, Glob, Bash, Write, WebFetch, WebSearch |
| data-knowledge-architect | sonnet | Read, Grep, Glob, WebFetch, WebSearch |
| technical-product-manager | sonnet | Read, Grep, Glob, Bash, Write |
| quality-assurance-architect | sonnet | Read, Grep, Glob, Bash, Edit, Write |
| ui-ux-designer | sonnet | Read, Grep, Glob, Edit, Write, WebFetch |
| full-stack-developer, ai-engineer, ml-engineer, devops-engineer, platform-engineer, cloud-engineer | sonnet | Read, Grep, Glob, Bash, Edit, Write, WebFetch, WebSearch |

- **No agent gets `Agent`** (D2). Never use `inherit` (D8).
- Don't use frontmatter that Phase 1 says plugin agents ignore (`permissionMode`, `hooks`, `mcpServers`, `initialPrompt`).

**Descriptions** load into every session, so keep them short:
- One or two sentences: what the agent owns, when to use it, and what it does *not* own.
- The PM description must make it the escalation entry point: "Use for Level 2+ work: classifies the task, writes the intent document, and assigns specialists. Does not edit code or dispatch agents."
- Specialists: "Dispatched from an approved agent-org intent." This discourages ad-hoc spawning at Levels 0–1.
- The infra trio must use the D16 split, with the ownership tie-breakers spelled out.

**Runtime binding** (under 250 words each; bindings load only when the agent is spawned; it complements the persona and never contradicts it):
- The tools actually granted, and what is **enforced** (the tool list) versus **instruction-only** (e.g. "only write tests" when `Write` is granted). Be honest about the gaps.
- You report to the main thread. You never spawn agents.
- Expect a task contract: objective, target revision, constraints, allowed actions, deliverables, test expectations, stop conditions. If one is missing, ask instead of guessing.
- Specialists with `Bash` (engineers, InfoSec, QA, TPM): create and change files with Edit/Write, and keep each Bash call to one purpose; never bundle file writes, branch changes or extra commands into one call (D24: one unapproved part blocks the whole call).
- QA: state that `Edit`/`Write` outside test paths are **denied by the guard** (report needed changes as findings), and that Bash is not path-scoped and must not be used to change application code.
- Return format: outcome (PASS / FAIL / BLOCKED / SKIPPED / NOT RUN), evidence (commands run, output), changed files, findings in the canonical finding format, open questions. Never claim a test, review or approval that didn't happen.
- **PM only:** you don't write files. Return the intent document as markdown for the main thread to save. Set the level using D5; triggers set the floor (D4). Pick only the specialists whose triggers fired, by exact `agent-org:<id>` from the roster the main thread sends; never invent an id. Mark every open question `[BLOCKING]` (no default, no recommendation) or `[NON-BLOCKING]` with a stated default; if you'd recommend an answer, it's non-blocking (D6). Mark independent tasks as parallelizable. Default to ordinary subagents; don't plan around agent teams (D7).

### 4. Skills

**`skills/deliver/SKILL.md`** — model-invocable. This is the full escalation workflow for the main thread:
1. Classify with D5. At Level 0–1, don't use this workflow. At Level 1: write "Plan: …" before the first edit, and run the repo's test command afterward if it has one.
2. Level 2+: invoke `agent-org:principal-project-manager` with the request, the repo, the branch, the level table, the **roster** and the relevant context. Embed a **Roster** section in the skill: all 14 `agent-org:<id>` values, each with a lane of a few words taken from its description (D6: the PM invented ids in 3/5 Phase 3b runs without it).
3. Save the returned intent to `~/.agent-org/intents/<repo>/<YYYY-MM-DD>-<slug>.md` **with the Write tool**, which creates missing directories. Never use Bash for intent files. `<repo>` is the basename of the git top level, or of the working directory outside git. **If the save fails, stop:** explain why, show the intent in chat, and don't implement until it's saved or the user explicitly waives the file (D6).
4. A `[BLOCKING]` question has no default and no recommended answer. If any is open, ask only those, in a message that does **not** request approval, and end the turn; don't suggest or hint at an answer. Approval never answers a blocking question; if the user says "approved" while one is open, ask it again. Re-plan with the answers. Then show a short summary (including non-blocking defaults) and the file path, and **stop and wait for explicit approval.** Silence, or a question, isn't approval. Approval accepts the plan and the stated non-blocking defaults only.
5. On approval, add `APPROVED <date>` to the intent's approval log, then dispatch the assigned specialists, each with its task contract. Run independent tasks in parallel. Agents may run in the background and report as notifications; wait for **every** report before dependent tasks or verification.
6. Collect results. When the last report arrives, save Status `IMPLEMENTED` **before** validation; set `VERIFIED` in a separate edit only after validation passes. Record the evidence.
7. Final report: outcome, evidence, and any open items. Stop if scope or risk grows, and go back to the PM to re-plan.
- Embed the **intent template**: Title · Status (PROPOSED / APPROVED / IMPLEMENTED / VERIFIED) · Repo / branch / base commit · Level and the triggers hit · Goal · Non-goals · Acceptance criteria · Implementation plan (components, files, steps) · Specialist assignments (agent as `agent-org:<id>`, mandatory; task contract; dependencies; parallel or sequential) · Validation (tests; QA, InfoSec or Product only if triggered) · Risks and rollback · Open questions (each `[BLOCKING] … (no default)`, or `[NON-BLOCKING]` with a default) · Approval log.
- Say plainly that the approval gate is instruction-only (D6).
- The description must make it load on escalation, and say that agent-org specialists take priority over overlapping skills like `engineering:architecture` for Level 2+ work.

**`skills/pm/SKILL.md`** — `disable-model-invocation: true`. The user forces escalation with `/agent-org:pm <task>`. It runs the `deliver` workflow from step 2 for `$ARGUMENTS` at Level 2 or higher.


**Shared rules for the three workflow skills below:**
- Each is a **main-thread** workflow that dispatches agent-org specialists with task contracts. The specialists never dispatch each other (D2).
- All three are **user-only** (`disable-model-invocation: true`). `deliver` is the only skill the model can invoke (D14). Inside `deliver`, the PM assigns architects and InfoSec, so these skills are only for standalone reviews you start yourself.
- Keep each description to one sentence that names its agent-org specialists.
- If the work would change code, config or infra, it goes through `deliver` and an approved intent first. These skills review and validate; they don't implement.
- Findings use the canonical format with stable IDs (`ARCH-###`, `SEC-###`, `QA-###`, `PROD-###`), numbered within the review or intent. Never invent a review, test or approval.

**`skills/architecture-review/SKILL.md`** — `disable-model-invocation: true`. Run with `/agent-org:architecture-review <scope>`.
1. Pick **only** the relevant architects: solutions for system and service boundaries, data-knowledge for data models, stores and pipelines, ai-ml-research for model and AI design, information-security when trust boundaries change. State why each one is included.
2. Each returns the smallest viable design, at least one credible alternative, tradeoffs, risks and a recommendation. Run them in parallel when they're independent.
3. The main thread synthesizes, and surfaces disagreements instead of averaging them away.
4. Output is a recommendation for the human to decide on. **It never approves itself.** If an intent exists, attach the review to it.

**`skills/security-audit/SKILL.md`** — `disable-model-invocation: true`. Run with `/agent-org:security-audit <scope>`.
1. **Authorization and scope first:** what's in scope, which repo and revision, which tests are allowed. No live or production testing without explicit permission. If scope is unclear, stop and ask.
2. Dispatch `information-security-architect` for threat analysis, then justified checks: static review, dependency, secret, configuration and container scanning, and bounded live tests only if authorized. Every check is justified by a threat.
3. Report `SEC-###` findings with severity and evidence. After remediation, run a retest and record its result.
4. **It never accepts risk.** Risk acceptance belongs to a named human and is recorded as theirs.

**`skills/release-validation/SKILL.md`** — `disable-model-invocation: true`. The user runs `/agent-org:release-validation <candidate>`.
1. Pin the candidate: exact commit, tag or artifact digest. If it's ambiguous, stop.
2. Collect dispositions independently: `quality-assurance-architect` (regression and release tests), `technical-product-manager` (acceptance criteria), and `information-security-architect` (open `SEC` findings and release scan). Reuse existing evidence only if it's tied to the same candidate.
3. Produce a checklist: each disposition PASS / FAIL / BLOCKED / NOT RUN with evidence, open findings, and the human approvals still needed, named by role.
4. **It never deploys, tags, merges or publishes.** It stops at the checklist.

### 5. Hooks — Node, dependency-free, cross-platform (macOS, Linux, Windows)

**`hooks.json`:** use the verified plugin format with paths through `"${CLAUDE_PLUGIN_ROOT}"`.
- `UserPromptSubmit` → `escalate.mjs`, timeout 5s.
- `SessionStart` → `session-start.mjs`, timeout 5s.
- `PreToolUse` with matcher `Bash|PowerShell|Edit|Write` → `guard.mjs`, timeout 5s.

**`escalate.mjs`:**
- Read the hook JSON from stdin and take the prompt text.
- Match case-insensitively with word boundaries against named trigger groups, in this fixed order: auth (`authentication`, `authorization`, `oauth`, `sso`, `jwt`, `login`, standalone `auth`/`authn`/`authz`), secrets (`secret(s)`, `credential(s)`, `api key`, `password`), data (`migration`, `schema`, `alter table`, `ddl`), infra (`terraform`, `helm`, `kubernetes`, `k8s`, `kubectl`, `iam`, `infrastructure`), delivery (`ci/cd`, `github actions`, `deploy*`, `release to prod(uction)`, `prod(uction) deploy/release/rollout`), cross-service (`across services`, `multiple services`, `microservices`), change (`dependency`/`dependencies`, `upgrade*`, `breaking change(s)`, `public api`, `api contract(s)`). **Don't** match bare `token`, `author`, `release`, `production` or `pipeline`: they fire on ordinary prompts, and a nudge that fires constantly gets ignored.
- If the prompt (after leading whitespace) starts with `<task-notification>`, it's a background subagent report, not a user request: **never nudge** (D3).
- On a match, emit `additionalContext` with a nudge: which groups matched; "this may be Level 2+ — consider loading the `agent-org:deliver` skill; if it's clearly Level 0–1, proceed normally." The output must be the same however often the hook fires.
- If `AGENT_ORG_HOOK_DEBUG=1`, append one line to `~/.claude/agent-org/hook-debug.jsonl` with a timestamp, the payload's **top-level key names**, prompt length, matched groups and whether it was a task notification. **Never log prompt text.** Create the directory if needed.
- Fail open: catch everything and always exit 0. A hook error must never block a prompt.

**`session-start.mjs` and `rule-card.md`:**
- The script prints `rule-card.md` as session context and fails open.
- The rule card is **no more than ~150 words**: the D5 level table compressed, with Level 1 written as an instruction tied to the tool call ("Your first Edit or Write must come after a message containing a line starting 'Plan:'. After editing, run the repo's test command if it has one and report the result."), "Levels 0–1: just do it. Level 2+: load `agent-org:deliver`; nothing is implemented without an approved intent", and that the main thread dispatches specialists.

**`guard.mjs`** (D12) — the `PreToolUse` command and QA-scope guard:
- Output schema (verified, https://code.claude.com/docs/en/hooks#pretooluse-decision-control): `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask"|"deny","permissionDecisionReason":"…"}}`. For `ask` the reason is shown to the user in the prompt (and to Claude when `-p` auto-denies it); for `deny` it is shown to Claude. Deny and ask rules in settings are evaluated regardless of what the hook returns.
- It returns **only** `ask` or `deny`, **never** `allow`, so it can't loosen anything. No decision → no output.
- Dependency-free, cross-platform, **fail-open**: an error, malformed JSON or an unknown payload means no output and exit 0. The user's ask rules in `settings.json` stay the primary layer.
- **Bash and PowerShell:** read `tool_input.command`.
  - Split into segments on `&&`, `||`, `;`, `|`, `|&`, `&`, newlines and `( )`. Analyze the contents of `$(…)` and backticks as separate command lines, including inside double quotes. Honor single and double quotes (a quoted string is one word), and backslash escapes for Bash only (PowerShell paths keep their backslashes). `2>&1`-style redirections are not separators.
  - Normalize each segment: strip leading `VAR=value` assignments, shell keywords (`do`, `then`, `{`, `!` …) and leading redirections; strip the wrappers `env`, `sudo`/`doas`, `timeout`, `nice`, `nohup`, `time`, `noglob`, `stdbuf`, `exec`, `command`/`builtin` (but `command -v`/`-V` is a lookup and doesn't match) and `xargs` (with its options); reduce the executable to its lower-case basename without `.exe`/`.cmd`/`.bat`/`.ps1` (`/usr/bin/git` → `git`).
  - Unwrap and analyze recursively: `sh|bash|zsh|dash|ksh|fish -c '…'` (including combined flags like `-lc`), `eval …`, `pwsh|powershell -Command …` (any unambiguous prefix of `-Command`) and `-EncodedCommand <base64 UTF-16LE>`.
  - Match against the ask list, which mirrors the user's Part A ask rules:
    - **git:** skip global options (`-C`, `-c`, `--git-dir`, `--work-tree`, `--namespace`, `--super-prefix`, `--config-env`, `--exec-path` take a value, also as `--opt=value`), so `git -C . push` and `git --git-dir=… push` reduce to `git push`. Then the subcommand: `commit`, `push`, `merge`, `rebase`, `clean`, `tag`; `reset` with `--hard`; `branch` with `-D` (or `--delete`/`-d` plus `--force`/`-f`).
    - **gh:** the first two non-option words (skipping `-R/--repo <value>`) are `pr create`, `pr merge`, `release create` or `repo delete`.
    - **kubectl** `apply|edit|patch|delete|scale|rollout`, **helm** `install|upgrade|uninstall|rollback`, **terraform/tofu** `apply|destroy|import`, **gcloud** `create|delete|update|deploy`, **az** `create|delete|update`, **cf** `push|delete`: the verb appears as **any** non-option word, so global flags before it (`kubectl -n x apply`, `terraform -chdir=x apply`) can't hide it. False positives on a resource literally named like a verb are accepted.
    - **aws:** any non-option word starting with `create`, `delete`, `update` or `put`, or equal to `deploy`.
    - **rm:** any option before `--` containing `r`/`R`, or `--recursive`.
    - **PowerShell `Remove-Item`** and its aliases `ri`, `del`, `erase`, `rd` with `-Recurse` or any prefix of it (`-r`), case-insensitive.
  - Check **every** segment and collect **every** distinct matched pattern (not just the first), so a compound command such as `git add -A && git commit -m x && git -C . push` reports `git commit; git push`. On any match, return `ask` with a reason that names them: "agent-org guard: this command matches the ask list (<pattern>; <pattern>). Confirm before it runs." The debug log's `rule` carries the same joined list.
  - A quoted mention isn't a command: `echo "git push"` produces no decision. Known limits (documented in the README): git aliases, scripts and Makefiles that run git internally, and variable-built commands (`$CMD push`).
- **Edit and Write by `agent_type == "agent-org:quality-assurance-architect"`** (the field is present only on subagent tool calls; verified in Phase 3 §6): allow only test paths. Normalize `\` to `/` and resolve `..`; judge paths inside `cwd` relative to it (so a parent folder named `test` doesn't count). A test path has a directory segment `test`, `tests`, `__tests__`, `spec`, `specs`, `fixtures` or `testdata` (case-insensitive; covers Java `src/test/`), or a file name `*.test.*`, `*.spec.*`, `*_test.*` or `test_*.*`. Anything else → `deny`, reason: "agent-org guard: quality-assurance-architect may only edit test files (…). Do not make this change; report it to the main thread as a finding instead." Other agents and the main thread get no decision.
- **Never log tool inputs** (no commands, no paths). With `AGENT_ORG_HOOK_DEBUG=1`, append to the same file as `escalate.mjs` (`~/.claude/agent-org/hook-debug.jsonl`) one line per call: `ts`, `hook: "guard"`, `tool`, `agent_type` if present, `decision` (`ask`/`deny`/`none`) and `rule` (the matched pattern, `qa-test-paths-only`, or null).
- Export `analyzeCommand`, `isTestPath` and `decide` for testing, and run `main()` only when executed directly.

### 6. `scripts/sync-personas.mjs`
Node, dependency-free, cross-platform. It never fetches, pulls or modifies `agent-personas`.
- `--check` (the default): for each agent, compare the canonical block with `git show <pinned commit>:agents/<id>.md`. Report `OK`, `DRIFT`, `MISSING` or `NEW`. Also report whether the persona repo's `production` HEAD is ahead of the pin.
- `--bump <sha>`: rewrite **only** the canonical blocks, their `source=` stamps and `plugin.json` `metadata.personasCommit`. Leave frontmatter and runtime bindings untouched.
- Write to temporary files and rename, so a failure never truncates an agent file. Running it twice must change nothing. Exit non-zero on drift in `--check`.
- The persona repo path defaults to `~/git/agent-personas` and can be overridden with `--personas <path>`.

### 7. `plugin/README.md`
Cover install (`claude plugin marketplace add <repo path or URL>`, then `claude plugin install agent-org@agent-org`), what the plugin does, the levels, intent files, how to force escalation, debug logging (both hooks), persona sync, and an **enforcement** section: what the guard enforces (ask on the normalized command list; QA limited to test paths), that it never allows anything, that the recommended user ask rules live in `settings.json` because plugins can't ship them, and the remaining gaps (approval gate and blocking questions are instruction-only; QA can still write through Bash; the guard can't see git aliases, scripts or variable-built commands; headless `ask` means the call is denied). Keep it short.

## Verification (read-only, no installs)

1. `claude plugin validate ./plugin`, and validate the marketplace if the CLI supports it.
2. Run `node scripts/sync-personas.mjs --check`. It must report 14 × `OK` at `PIN`.
3. Feed `escalate.mjs` sample payloads on stdin:
   - `"fix the typo in README"` → no output
   - `"refactor auth middleware"` → nudge (auth)
   - `"thank the author"` → no output
   - `"add a migration for users"` → nudge (data)
   - `"write release notes for the ML pipeline"` → no output
   - `"production is down, check the logs"` → no output
   - `"upgrade spring boot to 4.1"` → nudge (change)
   - `"deploy to production"` → nudge (delivery)
   - `"<task-notification> auth migration deploy done"` → no output
   - malformed JSON → exit 0, no output
4. Run `session-start.mjs` and confirm it prints the rule card.
5. Pipe payloads to `guard.mjs` (`cwd` `/work/app`; paths below are relative to it) and check the decision:

   | Payload | Expected |
   |---|---|
   | Bash `git status` | no output |
   | Bash `git push origin main` | ask |
   | Bash `git -C . push` | ask |
   | Bash `/usr/bin/git push` | ask |
   | Bash `npm test && git push` | ask |
   | Bash `git add -A && git commit -m x && git -C . push` | ask, naming `git commit; git push` |
   | Bash `sh -c 'git push'` | ask |
   | Bash `FOO=1 kubectl apply -f x.yaml` | ask |
   | Bash `echo "git push"` | no output (a quoted mention, not a command; a false positive would be acceptable, a miss isn't) |
   | Bash `rm -rf build` | ask |
   | Bash `echo "$(git push)"`, `bash -lc "cd x; git push"`, `terraform -chdir=infra apply`, `kubectl -n prod rollout restart deploy/x`, `gh -R o/r pr merge 1` | ask |
   | Bash `git log --grep push`, `git branch -d old`, `rm file.txt`, `npm test 2>&1 \| tail -5`, `command -v git` | no output |
   | PowerShell `& "C:\Program Files\Git\cmd\git.exe" push`, `ri build -r`, `pwsh -Command "git push"` | ask |
   | Edit `src/greet.js`, no `agent_type` | no output |
   | Edit `src/greet.js`, `agent_type` QA | deny |
   | Edit `test/greet.test.js`, `agent_type` QA | no output |
   | Edit `src/test/java/FooTest.java`, `agent_type` QA | no output |
   | Write `test/../src/greet.js`, `agent_type` QA | deny |
   | Edit `src/a.js` with `cwd` `/home/test/app`, `agent_type` QA | deny |
   | Write `src/greet.js`, `agent_type` full-stack-developer | no output |
   | malformed JSON, empty stdin | no output, exit 0 |

   With `AGENT_ORG_HOOK_DEBUG=1` and a throwaway `HOME`, confirm the log lines contain no command text or file paths.
6. Check the skill frontmatter: `deliver` is the only skill **without** `disable-model-invocation: true`; the other four have it.
7. Check the frontmatter: every agent has `name`, `description`, `tools` and `model`, with no `inherit` and no `Agent`.
8. `grep` everything you generated for absolute home paths, bucket IDs and the words `secret=` / `token=`. There should be no hits.

## Report

Write `reports/02-generate-<YYYY-MM-DD>.md`:
1. Summary (five bullets max)
2. Pin (`PIN`, branch) and precondition results
3. Files created, with sizes
4. Agent table: id, model, tools, description, and any deviation from the defaults with its justification
5. Enforcement gaps: instruction-only versus enforced, per agent and for the approval gate
6. Verification results: each check marked PASS / FAIL / NOT RUN, with commands and output
7. UNVERIFIED items Phase 3 must test live: nesting, the hook payload filter, whether the main thread actually loads `deliver` on a nudge, whether `SessionStart` context lands
8. Open questions for me

## Stop
Print the summary and **stop**. Don't install anything and don't start Phase 3.
