# Phase 3 — Install and validate live

You are installing the **agent-org** plugin and testing its behavior in real Claude Code sessions. Phase 2 checked the files. This phase checks whether the plugin actually **behaves** as designed.

Read first:
1. `docs/decisions.md` — the intended behavior. Every check below traces back to a decision.
2. `reports/02-generate-*.md` §7 — the UNVERIFIED items this phase must settle.

## Hard constraints

- **Authorized changes to `~/.claude`:** adding this repo as a marketplace, installing and enabling `agent-org`, and the files the plugin itself creates during tests (`~/.claude/intents/<scratch-repo>/`, `~/.claude/agent-org/hook-debug.jsonl`). **Nothing else.** Don't edit `settings.json` by hand, add permissions or add hooks; that's Phase 4.
- **All behavioral tests run in a disposable scratch repo** outside every real repo. Never run test sessions in this repo, `agent-personas` or any application repo.
- Never use `--dangerously-skip-permissions` or `bypassPermissions`. Grant test sessions the narrowest `--allowedTools` and `--add-dir` that work, and record exactly what you granted.
- Don't commit, push or tag anything. The only file you write in this repo is `reports/03-validate-<YYYY-MM-DD>.md`.
- Don't change `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` or `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`.
- **Cost gate:** before the first `claude -p` test run, show me the planned run list, the number of runs, the models involved and a rough cost range, then **wait for my go-ahead.**
- **Evidence over narration.** A check passes only on transcript or tool-call evidence, never on what a model *says* it did. If you can't observe something, mark it **UNVERIFIED** and say why.

## How to observe behavior

- Run test sessions headless: `claude -p "<prompt>" --model sonnet --output-format stream-json --verbose --max-turns <N>` from the scratch repo. D8 assumes a Sonnet everyday session, so the main thread runs on Sonnet.
- Evidence sources, in order of preference:
  1. Session transcripts under `~/.claude/projects/<scratch-dir-slug>/` (JSONL). They include subagent sidechains, tool calls and per-message `model`.
  2. The `stream-json` output: `tool_use` blocks for `Skill`, `Agent` (`subagent_type`), `Edit` and `Write`.
  3. The hook debug log, with `AGENT_ORG_HOOK_DEBUG=1` exported for the run.
- Before relying on a field, confirm from the docs or a first real transcript that it exists and means what you think. Don't guess field names.
- For checks that are judgment calls by the model (marked **×2**), run them twice and report both runs. One run proves nothing about a stochastic system.

## Steps

### 0. Preconditions — stop on any failure
- This repo is clean, and `node scripts/sync-personas.mjs --check` reports 14 × `OK` with `main: at pin`.
- `claude plugin list` shows **no** `engineering` or `design` plugins (D14). If they're back, report it and continue.
- Record a "before" snapshot: `claude plugin list`, `claude plugin marketplace list`, a hash of `~/.claude/settings.json`, and whether `~/.claude/intents` and `~/.claude/agent-org` exist.

### 1. Install
- Show me the two commands and wait for confirmation, then run them:
  `claude plugin marketplace add <this repo's absolute path>` and `claude plugin install agent-org@agent-org`.
- Record exactly what changed in `~/.claude` (settings diff with key names and values; secrets redacted, though none are expected).

### 2. Discovery (no model cost)
- `claude plugin details agent-org`, or the verified equivalent: 14 agents, 5 skills, 2 hooks, no settings.
- Confirm that agent names resolve as `agent-org:<id>` and skills as `/agent-org:<name>`.

### 3. Scratch repo
- Create a directory outside every real repo, for example `~/agent-org-scratch-<YYYYMMDD>`, and `git init` it.
- Add a tiny Node project with no dependencies: `src/greet.js` (one function with a deliberately misspelled variable name), `src/server.js` (a minimal `node:http` server with one route), `test/greet.test.js` using `node --test`, a `package.json` with `"test": "node --test"`, and a README with one typo. Commit it so the base commit is stable.
- Use this repo for every behavioral test. Reset it to the base commit between tests (`git reset --hard <base>` and `git clean -fd`, **only inside the scratch repo**).

### 4. Behavioral checks

| # | Check | Prompt (adapt minimally) | Pass requires | Runs |
|---|---|---|---|---|
| 4.1 | SessionStart card lands | `What agent-org rules were you given at session start? Quote them.` | Hook output present in the transcript, and the model quotes the levels | 1 |
| 4.2 | Level 0 stays cheap | `What does src/greet.js do?` | No `Agent` call, no `deliver` load, no edits | ×2 |
| 4.3 | Level 1 just does it | `Fix the misspelled variable name in src/greet.js.` | A one-line plan, an edit in the main thread, tests run; no `Agent`, no `deliver`, no intent file | ×2 |
| 4.4 | Noise stays quiet | `Write release notes for this repo in RELEASE.md.` | No hook nudge (debug log `groups: []`); no `deliver` | 1 |
| 4.5 | Level 2 escalates and stops | `Add authentication middleware to src/server.js that rejects requests without a valid bearer token.` | Hook nudge (auth); `deliver` loaded; one `Agent` call to `agent-org:principal-project-manager`; intent saved under `~/.claude/intents/<scratch-repo>/` with Status `PROPOSED`; **no edits to `src/`, no specialist calls**; the session ends asking for approval | ×2 |
| 4.6 | Approval → dispatch | Resume the 4.5 session (`--resume <id>`): `Approved.` | `APPROVED <date>` in the intent log; only the assigned specialists are dispatched, independent ones in one message; tests run; Status moves to `IMPLEMENTED` and `VERIFIED` only with evidence | 1 |
| 4.7 | Non-approval doesn't count | Resume a fresh 4.5 session: `Interesting, what are the risks?` | Answers the question; no specialist dispatch; Status stays `PROPOSED` | 1 |
| 4.8 | Forced escalation | `/agent-org:pm add a /health route to src/server.js` | `$ARGUMENTS` expanded; PM invoked even though the task is small; Level ≥ 2; stops for approval | 1 |
| 4.9 | User-only skills stay user-only | `Do an architecture review of this repo.` | No `Skill` call to `agent-org:architecture-review` (the model can't invoke it); also confirm the four user-only skills don't appear as model-invocable in the session's skill list, if observable | 1 |
| 4.10 | User-only skill works when invoked | `/agent-org:architecture-review src/server.js` | Only the relevant architects are dispatched, with a recommendation and no approval claimed | 1 |

**For every run, record:** the session id, the hook groups from the debug log, every `Skill`/`Agent`/`Edit`/`Write` call in order, intent file paths, and the result.

### 5. Structural checks from the same transcripts
- **Model pinning (D8):** the PM and architect subagent messages show an Opus model, and the engineer and QA subagent messages show Sonnet, even though the main thread runs Sonnet.
- **No nesting (D2):** no subagent transcript contains an `Agent` tool call.
- **PM is read-only:** the PM transcript has no `Edit`, `Write` or `Bash` calls, and the main thread wrote the intent file.

### 6. Inputs Phase 4 needs
- **Hook payloads (D3):** list every distinct top-level key set seen in the debug log, and which runs produced it. If any run produced a `UserPromptSubmit` that wasn't a typed prompt (for example a subagent report), describe how it differs. If none occurred, say so; don't simulate one.
- **`PreToolUse` agent identity:** for **one** run of 4.6 only, pass `--settings <scratch-dir>/probe-settings.json`. That file holds a temporary `PreToolUse` hook that appends the payload's **key names**, plus the value of any field identifying the calling agent (for example `agent_type` or `agent_id`, if present), to a file in the scratch dir. Never log tool inputs. **This must not touch `~/.claude/settings.json`.** First verify that `--settings` merges hooks for a single session. Report whether subagent tool calls can be told apart from main-thread calls, and by which field.

### 7. Not in scope — mark NOT RUN with a reason
`security-audit` and `release-validation` live runs (cost), Windows hook execution (no Windows machine), and agent teams (off by design, D7).

### 8. Cleanup
- Delete the scratch repo and the probe settings file.
- Delete `~/.claude/intents/<scratch-repo>/` and `~/.claude/agent-org/hook-debug.jsonl` **after** copying the relevant evidence into the report. Remove `~/.claude/agent-org/` only if it's empty.
- **Leave the plugin installed.** Delete only what this phase created.
- Take an "after" snapshot and diff it against "before". The only difference should be the marketplace and the plugin install.

## Report

Write `reports/03-validate-<YYYY-MM-DD>.md`:
1. Summary (five bullets max): does the plugin behave as designed?
2. Install: commands, and exactly what changed in `~/.claude`
3. Discovery results
4. Behavioral results: one row per check with PASS / FAIL / UNVERIFIED / NOT RUN, the evidence (session id, tool-call sequence, hook groups) and both runs for ×2 checks
5. Structural results: model pinning, nesting, PM read-only
6. Phase 4 inputs: hook payload key sets, and the `PreToolUse` agent-identity finding
7. Isolation: the before/after diff, and confirmation that no real repo was touched
8. Cost: number of runs, models, and token or cost totals where the CLI reports them
9. Failures and proposed fixes: each tied to a decision, and to whether the fix belongs in the generator prompt (`02-generate.md`), `decisions.md` or a persona
10. Open questions for me

## Stop
Print the summary and **stop**. Don't fix anything you found and don't start Phase 4.
