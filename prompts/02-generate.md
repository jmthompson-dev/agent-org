# Phase 2 — Generate the plugin

You are generating the **agent-org** Claude Code plugin into `plugin/` in this repo.

Read these first, in this order:
1. `docs/decisions.md` — the design. **It wins over anything else.** If something here seems to conflict with it, stop and ask.
2. `reports/01-inspection-*.md` — verified capabilities, frontmatter fields and hook formats. Use only syntax it marks **VERIFIED**. For anything else, check the official docs and label it **UNVERIFIED** in your report.

## Hard constraints

- Write only inside this repo: `plugin/`, `.claude-plugin/marketplace.json`, `scripts/`, and `reports/02-generate-<YYYY-MM-DD>.md`.
- Do not modify `~/.claude`, the `agent-personas` repo, or any application repo.
- Do not install, enable or update the plugin or marketplace. Do not commit, push or tag.
- Do not launch subagents, agent teams or nested `claude` sessions. Live behavior is Phase 4's job.
- No secrets, absolute home paths or employer-specific details in anything you write (D17). Hooks resolve paths at runtime.
- Don't edit persona text. If a persona looks wrong, report it.

## Preconditions — check these first, and stop on any failure

1. `~/git/agent-personas` exists, the working tree is **clean**, and you're on `production`. If it's dirty, stop: the supervision fix must be committed first.
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
│   └── pm/SKILL.md
├── hooks/
│   ├── hooks.json
│   ├── escalate.mjs
│   ├── session-start.mjs
│   └── rule-card.md
└── README.md
scripts/sync-personas.mjs                 # repo-level, not shipped in the plugin
```
**No `plugin/settings.json`** (D1). **No `commands/`, `rules/` or plugin `CLAUDE.md`** (D13, D14). Remove `plugin/.gitkeep`.

### 1. `plugin.json`
- `name: agent-org`, `version: 0.1.0`, a one-line `description`, and `author`.
- `metadata`: `personasRepo` (the public GitHub URL), `personasCommit: PIN`, `personasBranch: production`.
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

**Runtime binding** (under 200 words each; it complements the persona and never contradicts it):
- The tools actually granted, and what is **enforced** (the tool list) versus **instruction-only** (e.g. "only write tests" when `Write` is granted). Be honest about the gaps.
- You report to the main thread. You never spawn agents.
- Expect a task contract: objective, target revision, constraints, allowed actions, deliverables, test expectations, stop conditions. If one is missing, ask instead of guessing.
- Return format: outcome (PASS / FAIL / BLOCKED / SKIPPED / NOT RUN), evidence (commands run, output), changed files, findings in the canonical finding format, open questions. Never claim a test, review or approval that didn't happen.
- **PM only:** you don't write files. Return the intent document as markdown for the main thread to save. Set the level using D5; triggers set the floor (D4). Pick only the specialists whose triggers fired. Mark independent tasks as parallelizable. Default to ordinary subagents; don't plan around agent teams (D7).

### 4. Skills

**`skills/deliver/SKILL.md`** — model-invocable. This is the full escalation workflow for the main thread:
1. Classify with D5. At Level 0–1, don't use this workflow: give a one-line "here's what I'll do", then do it.
2. Level 2+: invoke `agent-org:principal-project-manager` with the request, the repo, the branch and the relevant context.
3. Save the returned intent to `~/.claude/intents/<repo>/<YYYY-MM-DD>-<slug>.md`, creating the directory if it doesn't exist. `<repo>` is the basename of the git top level, or of the working directory outside git.
4. Show a short summary and the file path, then **stop and wait for explicit approval.** Silence, or a question, isn't approval.
5. On approval, add `APPROVED <date>` to the intent's approval log, then dispatch the assigned specialists, each with its task contract. Run independent tasks in parallel.
6. Collect results, run the validation the intent specifies, and update the intent's status (`IMPLEMENTED`, then `VERIFIED`) with evidence.
7. Final report: outcome, evidence, and any open items. Stop if scope or risk grows, and go back to the PM to re-plan.
- Embed the **intent template**: Title · Status (PROPOSED / APPROVED / IMPLEMENTED / VERIFIED) · Repo / branch / base commit · Level and the triggers hit · Goal · Non-goals · Acceptance criteria · Implementation plan (components, files, steps) · Specialist assignments (agent, task contract, dependencies, parallel or sequential) · Validation (tests; QA, InfoSec or Product only if triggered) · Risks and rollback · Open questions · Approval log.
- Say plainly that the approval gate is instruction-only (D6).
- The description must make it load on escalation, and say that agent-org specialists take priority over overlapping skills like `engineering:architecture` for Level 2+ work.

**`skills/pm/SKILL.md`** — `disable-model-invocation: true`. The user forces escalation with `/agent-org:pm <task>`. It runs the `deliver` workflow from step 2 for `$ARGUMENTS` at Level 2 or higher.

### 5. Hooks — Node, dependency-free, cross-platform (macOS, Linux, Windows)

**`hooks.json`:** use the verified plugin format with paths through `"${CLAUDE_PLUGIN_ROOT}"`.
- `UserPromptSubmit` → `escalate.mjs`, timeout 5s.
- `SessionStart` → `session-start.mjs`, timeout 5s.

**`escalate.mjs`:**
- Read the hook JSON from stdin and take the prompt text.
- Match case-insensitively with word boundaries against named trigger groups: auth (`authentication`, `authorization`, `oauth`, `sso`, `jwt`, `login`, standalone `auth`/`authn`/`authz`), secrets (`secret(s)`, `credential(s)`, `api key`, `password`), data (`migration`, `schema`, `alter table`, `ddl`), infra (`terraform`, `helm`, `kubernetes`, `k8s`, `kubectl`, `iam`, `infrastructure`), delivery (`ci/cd`, `pipeline`, `github actions`, `deploy`, `deployment`, `release`, `production`), cross-service (`across services`, `multiple services`, `microservices`). **Don't** match bare `token` (too noisy in LLM work) or `author`.
- On a match, emit `additionalContext` with a nudge: which groups matched; "this may be Level 2+ — consider loading the `agent-org:deliver` skill; if it's clearly Level 0–1, proceed normally." The output must be the same however often the hook fires.
- If `AGENT_ORG_HOOK_DEBUG=1`, append one line to `~/.claude/agent-org/hook-debug.jsonl` with a timestamp, the payload's **top-level key names**, prompt length and matched groups. **Never log prompt text.** Create the directory if needed.
- Fail open: catch everything and always exit 0. A hook error must never block a prompt.

**`session-start.mjs` and `rule-card.md`:**
- The script prints `rule-card.md` as session context and fails open.
- The rule card is **no more than ~150 words**: the D5 level table compressed, "Levels 0–1: just do it. Level 2+: load `agent-org:deliver`; nothing is implemented without an approved intent", and that the main thread dispatches specialists.

### 6. `scripts/sync-personas.mjs`
Node, dependency-free, cross-platform. It never fetches, pulls or modifies `agent-personas`.
- `--check` (the default): for each agent, compare the canonical block with `git show <pinned commit>:agents/<id>.md`. Report `OK`, `DRIFT`, `MISSING` or `NEW`. Also report whether the persona repo's `production` HEAD is ahead of the pin.
- `--bump <sha>`: rewrite **only** the canonical blocks, their `source=` stamps and `plugin.json` `metadata.personasCommit`. Leave frontmatter and runtime bindings untouched.
- Write to temporary files and rename, so a failure never truncates an agent file. Running it twice must change nothing. Exit non-zero on drift in `--check`.
- The persona repo path defaults to `~/git/agent-personas` and can be overridden with `--personas <path>`.

### 7. `plugin/README.md`
Cover install (`claude plugin marketplace add <repo path or URL>`, then `claude plugin install agent-org@agent-org`), what the plugin does, the levels, intent files, how to force escalation, debug logging, persona sync, and the known enforcement gaps. Keep it short.

## Verification (read-only, no installs)

1. `claude plugin validate ./plugin`, and validate the marketplace if the CLI supports it.
2. Run `node scripts/sync-personas.mjs --check`. It must report 14 × `OK` at `PIN`.
3. Feed `escalate.mjs` sample payloads on stdin:
   - `"fix the typo in README"` → no output
   - `"refactor auth middleware"` → nudge (auth)
   - `"thank the author"` → no output
   - `"add a migration for users"` → nudge (data)
   - malformed JSON → exit 0, no output
4. Run `session-start.mjs` and confirm it prints the rule card.
5. Check the frontmatter: every agent has `name`, `description`, `tools` and `model`, with no `inherit` and no `Agent`.
6. `grep` everything you generated for absolute home paths, bucket IDs and the words `secret=` / `token=`. There should be no hits.

## Report

Write `reports/02-generate-<YYYY-MM-DD>.md`:
1. Summary (five bullets max)
2. Pin (`PIN`, branch) and precondition results
3. Files created, with sizes
4. Agent table: id, model, tools, description, and any deviation from the defaults with its justification
5. Enforcement gaps: instruction-only versus enforced, per agent and for the approval gate
6. Verification results: each check marked PASS / FAIL / NOT RUN, with commands and output
7. UNVERIFIED items Phase 4 must test live: nesting, the hook payload filter, whether the main thread actually loads `deliver` on a nudge, whether `SessionStart` context lands
8. Open questions for me

## Stop
Print the summary and **stop**. Don't install anything and don't start Phase 3.
