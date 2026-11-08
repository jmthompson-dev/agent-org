# agent-org

A Claude Code plugin that adds a Principal Project Manager and 13 specialists, built from the [agent-personas](https://github.com/jmthompson-dev/agent-personas) catalog, plus a level-based escalation workflow with an approval-gated intent file.

Plain Claude stays your main agent. Small work stays small. Bigger or riskier work goes through a plan you approve first.

## Install

```bash
claude plugin marketplace add <path-or-URL-of-the-agent-org-repo>
claude plugin install agent-org@agent-org
```

## What it does

- **14 agents** (`agent-org:<id>`), each one a verbatim persona pinned to an `agent-personas` commit, plus a short Claude Code runtime binding. Every model is pinned (Opus for the PM, solutions, AI/ML research and InfoSec architects; Sonnet for the rest). No agent has the `Agent` tool, so nothing nests.
- **`deliver` skill**: the only skill Claude loads on its own. PM writes an intent → you approve → the main thread dispatches the assigned specialists → validation → report.
- **User-only skills:** `/agent-org:pm <task>`, `/agent-org:architecture-review <scope>`, `/agent-org:security-audit <scope>`, `/agent-org:release-validation <candidate>`.
- **Hooks:** a `SessionStart` rule card with the levels, a `UserPromptSubmit` nudge that fires when a prompt mentions a hard trigger (auth, secrets, data, infra, delivery, cross-service, change), and a `PreToolUse` guard (see Enforcement).

## Levels

| Level | What | Handling |
|---|---|---|
| 0 | Question, lookup, docs typo | Main thread, no agents |
| 1 | ≤ ~2 files, no trigger | One-line plan, then do it |
| 2 | > ~2 files or modules, API/contract, schema/migration, dependency, auth, secrets, CI/CD or infra, cross-service, user-visible behavior | PM → intent → **your approval** → triggered specialists |
| 3 | Auth redesign, sensitive data, prod data migration, multi-service architecture, prod release, major AI/ML platform work | Level 2 + independent QA and InfoSec, durable evidence, approval before release |

A trigger sets the minimum level.

## Intent files

Saved to `~/.agent-org/intents/<repo>/<YYYY-MM-DD>-<slug>.md` (`<repo>` = git top-level basename). They live outside your application repos and outside `~/.claude`, which Claude Code protects from agent writes. Status moves PROPOSED → APPROVED → IMPLEMENTED → VERIFIED, and approval is recorded in the file's approval log.

## Force escalation

`/agent-org:pm <task>` runs the workflow at Level 2 or higher, whatever the classifier would say.

## Debug logging

Set `AGENT_ORG_HOOK_DEBUG=1` to append JSON lines to `~/.claude/agent-org/hook-debug.jsonl`:
- the prompt hook: timestamp, the payload's top-level key names, prompt length, matched groups, and whether it was a background-agent notification;
- the guard (`"hook":"guard"`): timestamp, tool name, `agent_type` if present, decision (`ask`/`deny`/`none`) and the matched rule name.

Prompt text, commands and file paths are never logged.

## Persona sync (maintainers)

From the repo root, not shipped in the plugin:

```bash
node scripts/sync-personas.mjs --check            # OK / DRIFT / MISSING / NEW, and whether the persona branch is ahead of the pin
node scripts/sync-personas.mjs --bump <sha>       # rewrite only canonical blocks + plugin.json personasCommit
```

`--personas <path>` overrides the default `~/git/agent-personas`. The script never fetches or modifies the persona repo.

## Enforcement

**Enforced by the `PreToolUse` guard** (`hooks/guard.mjs`). It only ever returns `ask` or `deny`, never `allow`, and fails open:
- **Risky shell commands → ask.** Bash and PowerShell commands are split on `&&`, `||`, `;`, `|`, `&`, `$(…)` and backticks, and normalized (env assignments, `sudo`/`timeout`/`env`-style wrappers, absolute executable paths, `git -C`/`--git-dir`, `sh -c`, `eval`, `pwsh -Command`/`-EncodedCommand`). Any segment matching git `commit`/`push`/`merge`/`rebase`/`reset --hard`/`clean`/`tag`/`branch -D`, `gh pr create|merge`, `gh release create`, `gh repo delete`, kubectl/helm/terraform mutations, gcloud/aws/az create/delete/update/deploy, `cf push|delete`, `rm -r` or `Remove-Item -Recurse` asks first, naming the pattern.
- **QA edits only tests.** `Edit`/`Write` calls from `agent-org:quality-assurance-architect` are denied unless the path is a test path (`test/`, `tests/`, `__tests__/`, `spec/`, `specs/`, `fixtures/`, `testdata/`, `src/test/`, `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*`). QA reports the needed change instead.

**Recommended in your user `settings.json`** (plugins can't ship permission rules): `permissions.ask` rules for the same commands, e.g. `Bash(git push *)`, `PowerShell(git push *)`, and `permissions.allow` `Edit(~/.agent-org/intents/**)` so intent files save without a prompt. Use `Edit(…)`: `Write(path)` rules are accepted but never match. Never a bare `Write` or `Edit`. The rules are the primary layer; the guard catches the spellings they miss (`git -C . push`, `/usr/bin/git push`, `sh -c '…'`).

In non-interactive runs (`claude -p`) an `ask` has no one to answer it, so the call is denied.

## Known enforcement gaps

- **The approval gate and blocking questions are instruction-only.** Nothing technically stops implementation before you approve.
- **QA can still change application code through Bash** (`sed -i`, redirects). The guard scopes only its `Edit`/`Write`. Other agents' "no deploy, no push" rules rely on the ask rules and the guard, and InfoSec/Product `Write` "for test artifacts only" is instruction-only.
- **The guard reads command text.** It can't see git aliases, scripts or Makefiles that run git themselves, interpreter one-liners (`python -c "os.system(...)"`), or commands built from variables (`$CMD push`). A quoted mention such as `echo "git push"` is correctly not treated as a command.
- **The prompt hook is a nudge, not a gate.** Prompts that never mention a trigger rely on the rule card and the model's judgment.
