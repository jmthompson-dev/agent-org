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
- **Hooks:** a `SessionStart` rule card with the levels, and a `UserPromptSubmit` nudge that fires when a prompt mentions a hard trigger (auth, secrets, data, infra, delivery, cross-service).

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

Set `AGENT_ORG_HOOK_DEBUG=1` to append one JSON line per prompt to `~/.claude/agent-org/hook-debug.jsonl`: timestamp, the hook payload's top-level key names, prompt length and matched groups. Prompt text is never logged.

## Persona sync (maintainers)

From the repo root, not shipped in the plugin:

```bash
node scripts/sync-personas.mjs --check            # OK / DRIFT / MISSING / NEW, and whether the persona branch is ahead of the pin
node scripts/sync-personas.mjs --bump <sha>       # rewrite only canonical blocks + plugin.json personasCommit
```

`--personas <path>` overrides the default `~/git/agent-personas`. The script never fetches or modifies the persona repo.

## Known enforcement gaps

- **The approval gate is instruction-only.** Nothing technically stops implementation before you approve.
- **Tool lists are enforced; everything finer is not.** QA has `Edit`/`Write` for tests, but nothing stops an application-code edit. InfoSec and Product `Write` are meant for test artifacts only. Engineers' "no deploy, no push" rules rely on the agent and on your permission rules.
- **Plugins can't ship permission rules.** Ask rules for push, deploy and similar actions belong in your user `settings.json`.
- **The hook is a nudge, not a gate**, and it also fires on non-user prompts (background-agent reports, cross-session messages). Prompts that never mention a trigger rely on the rule card and the model's judgment.
