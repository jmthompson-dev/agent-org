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
- **User-only skills:** `/agent-org:pm <task>`, `/agent-org:architecture-review <scope>`, `/agent-org:security-audit <scope>`, `/agent-org:release-validation <candidate>`, `/agent-org:audit-verify [repo]`.
- **Hooks:** a `SessionStart` rule card with the levels (plus an audit check), a `UserPromptSubmit` nudge that fires when a prompt mentions a hard trigger (auth, secrets, data, infra, delivery, cross-service, change), a `PreToolUse` guard (see Enforcement), a `PostToolUse` recorder (edit ledger, dispatch audit, approvals, scope counter), a claim check on every `Stop` and `SubagentStop`, and team-event auditing.

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
- the guard (`"hook":"guard"`): timestamp, tool name, `agent_type` if present, decision (`ask`/`deny`/`none`) and the matched rule names.

Prompt text, commands and file paths are never logged.

## Verification at every level

- **Claim check** (`Stop`, every level): a sentence in Claude's final message that claims verification ("tests pass", "I ran", "build succeeds", "verified", "no errors", "N/N passed") needs a successful matching command in the same turn (in a turn with no tool calls, the previous turn's command counts). Relayed specialist claims, quoted text, and negated, hypothetical or future-tense sentences are skipped.
- **Citation check:** every `path:line` citation in the final message must name a file opened this session (Read, Edit, Write, NotebookEdit, or a single-purpose `cat`/`head`/`tail`/`sed -n`/`grep`/`rg`/`nl`) or seen in successful Grep, Glob or Bash output, by the main thread or a specialist. Bare paths, planned files, URL routes and negated or future-tense sentences aren't checked. It catches invented or unopened files cited with a line, not misread lines.
- **Block once:** a failed check continues the turn with the reason (shown as "Stop hook feedback"); on the second stop it only warns.
- **Report contract** (`SubagentStop`, `SubagentHandback`): agent-org specialists start their report with `Outcome: PASS | FAIL | BLOCKED | SKIPPED | NOT RUN`, and a PASS needs a successful command in their own transcript (for agents with no shell, any successful tool call). The PM is exempt: it returns an intent, saved as is.
- **Level 3:** the independent QA reviewer reproduces the key claims before VERIFIED (a fresh QA instance if the reviewer wrote code or tests in the job). No extra auditor agent.

## Parallel work

Parallel specialists share one working tree. The PM marks tasks parallel only when they own disjoint files ("Owns" column), don't consume each other's interface (or it's pinned in the intent) and each is worth a specialist. A ledger records which agent changed which file; the guard denies an edit to a file another agent of the same parallel group already changed (same dispatch turn, or, when that id is missing, an agent that hasn't finished yet). Before validation, `deliver` checks the ledger against "Owns" and `git diff`. Any collision stops the job and goes back to the PM for a sequential rerun and a new approval. There is never a fixer agent. After approval the main thread doesn't change the plan itself: edits to an approved intent outside the status line, approval log, evidence and validation are audited as `intent-edited-after-approval`.

## Agent teams (optional, experimental)

A justified fallback, not a default: the PM may mark a task group `Mode: team` only when a hand-off can't be written down up front, and you approve the mode at the normal gate. It needs `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and an interactive session; in-process teammates only. Without an approved team mode, the guard denies any named `agent-org:*` dispatch (a named call would start a team). Teammate hooks carry the teammate's name as `agent_type`, so every check maps the teammate back to its `agent-org:*` type through the dispatch record. Teammates run in auto permission mode, so the guard denies them ask-list commands (commit, push, deploy, …) instead of asking: they report to the lead, and the lead asks you.

## Audit log

Hooks append to `~/.agent-org/audit/<repo>.jsonl`: dispatches (with the resolved model), results (outcome, command counts, flags), collisions, guard denies, claim flags and team events. Metadata only: never prompts, commands, file content, messages or report text. Each line is hash-chained to the previous one; a head record in `~/.agent-org/state/` catches an edited last line or a truncated tail. Files rotate at 10 MB to `<repo>.jsonl.<n>` with the chain carried across. Each session start fully verifies the active file (at most 10 MB) and the head record, and warns in the terminal if either is broken; rotated files are fully checked only by `/agent-org:audit-verify`. A specialist conflict is recorded as its `result` line with outcome `BLOCKED`. **Tamper-evident, not tamper-proof:** the model can still reach the files through Bash, behind a guard `ask`.

## Scope guard

Without an approval recorded in this session for the repo, a main-thread edit that would make more than 3 distinct files edited, or the first edit of each kind (migration, CI, IaC/k8s/helm, auth) to a risky path, gets an `ask`; once an edit of a kind has gone through, later files of that kind don't ask again. Approving an intent (`**Status:** APPROVED`) records the approval for the session: it survives resume and compaction, not `/clear` or a fork.

## State files

`~/.agent-org/state/<session_id>/` holds approvals, the scope counter, risky kinds seen, dispatch and finish records, and the edit ledger; `~/.agent-org/state/audit-<repo>.head` holds the audit head records. Safe to delete when no session is running: deleting resets approvals and counters, and a deleted head record means the next check can't detect tail edits made before it.

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
- **QA edits only tests.** `Edit`/`Write`/`NotebookEdit` calls from `agent-org:quality-assurance-architect` are denied unless the path is a test path (`test/`, `tests/`, `__tests__/`, `spec/`, `specs/`, `fixtures/`, `testdata/`, `src/test/`, `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*`). QA reports the needed change instead.
- **Parallel collisions, teams, the audit log and scope growth** (v0.2): the same-group edit deny, the team gate, an `ask` on tool calls that touch `~/.agent-org/audit/` or `~/.agent-org/state/`, and the scope guard, described above.

**Recommended in your user `settings.json`** (plugins can't ship permission rules): `permissions.ask` rules for the same commands, e.g. `Bash(git push *)`, `PowerShell(git push *)`, and `permissions.allow` `Edit(~/.agent-org/intents/**)` so intent files save without a prompt. Use `Edit(…)`: `Write(path)` rules are accepted but never match. Never a bare `Write` or `Edit`. The rules are the primary layer; the guard catches the spellings they miss (`git -C . push`, `/usr/bin/git push`, `sh -c '…'`).

In non-interactive runs (`claude -p`) an `ask` has no one to answer it, so the call is denied.

## Known enforcement gaps

- **The approval gate and blocking questions are instruction-only.** Nothing technically stops implementation before you approve.
- **QA can still change application code through Bash** (`sed -i`, redirects). The guard scopes only its `Edit`/`Write`. Other agents' "no deploy, no push" rules rely on the ask rules and the guard, and InfoSec/Product `Write` "for test artifacts only" is instruction-only.
- **The guard reads command text.** It can't see git aliases, scripts or Makefiles that run git themselves, interpreter one-liners (`python -c "os.system(...)"`), or commands built from variables (`$CMD push`). A quoted mention such as `echo "git push"` is correctly not treated as a command.
- **The prompt hook is a nudge, not a gate.** Prompts that never mention a trigger rely on the rule card and the model's judgment.
- **Bash edits aren't counted or attributed** (`sed -i`, redirects, scripts): the scope counter and the ledger see only Edit, Write and NotebookEdit.
- **Citation checks miss paths built from variables or globs** and bare-path mentions, and check that a file was opened or seen, not that it was read correctly.
- **Teammates without a dispatch record** (the mapping failed) fall back to v0.1 checks; the `git diff` comparison against "Owns" remains.
- **Connector text can appear inside tool output.** Agents treat it as data, not instructions.
