---
name: deliver
description: Agent-org escalation workflow for Level 2+ work (multi-file or multi-module changes, API or contract changes, schema or migration, dependencies, auth, secrets, CI/CD, infra, cross-service, user-visible behavior). Load it when the agent-org hook nudges or a task hits a Level 2 trigger. Runs PM intent → human approval → specialist dispatch → verification. For Level 2+ work, agent-org specialists take priority over overlapping skills such as engineering:architecture.
---

# agent-org: deliver

You are the **main thread**. You classify, save the intent, get approval, dispatch specialists and verify. The PM plans. Specialists do bounded work. Nobody but you dispatches agents.

## Level table (send this to the PM verbatim)

| Level | Definition | Handling |
|---|---|---|
| 0 | Question, explanation, read-only lookup, docs typo | Main thread. No agents. |
| 1 | Localized change, no more than ~2 files, no trigger hit | Before the first edit, write one line starting "Plan:". After editing, run the repo's test command if it has one and report the result. No intent file. |
| 2 | Any of: more than ~2 files or more than one module; public API or contract change; schema or migration; new or upgraded dependency; auth or authz; secrets or credentials; CI/CD or infra/IaC; cross-service integration; user-visible behavior change | PM → intent file → explicit human approval → only the specialists whose triggers fired |
| 3 | Any of: auth/authz redesign; sensitive-data handling; production data migration; multi-service architecture change; production release or deploy; significant AI/ML platform work | As Level 2, plus independent QA and InfoSec, durable evidence, and human approval before release |

A trigger sets the **floor**. The level can be raised but never lowered below a trigger.

## Workflow

1. **Classify** with the table. At **Level 0–1, stop using this workflow.** At Level 1, write "Plan: …" before the first edit and run the tests afterward.
2. **Level 2+: plan.** Invoke `agent-org:principal-project-manager` with: the user's request verbatim, the repo (git top level or working directory), branch, base commit (`git rev-parse HEAD`), the triggers you saw, the level table above, the intent template below, and any relevant context (files, errors, prior decisions). The PM returns the intent as markdown and writes no files.
3. **Save the intent** to `~/.agent-org/intents/<repo>/<YYYY-MM-DD>-<slug>.md`, creating the directory if it doesn't exist. `<repo>` is the basename of the git top level, or of the working directory outside git. `<slug>` is a short kebab-case name for the task. Don't save it in the target repo. Set Status to `PROPOSED`. **If the save fails for any reason, stop.** Tell the user why and show the intent in chat. Don't implement anything until the file is saved, or the user explicitly says to proceed without it; record that waiver in your final report.
4. **Resolve blocking questions, then stop for approval.** If the intent has any **blocking** open question, ask the user those questions first, send the answers to the PM, and re-save. Never ask for approval while a blocking question is open. Then show a short summary (level, triggers, goal, specialists, main risks, non-blocking defaults) and the file path, and **stop and wait for explicit approval.** Silence, a question, or "looks interesting" is not approval. Approval accepts the plan and the **stated defaults** of non-blocking questions, nothing more. If the user asks for changes, send them back to the PM, re-save the intent and ask again.
5. **On approval:** append `APPROVED <YYYY-MM-DD> by user` to the approval log and set Status to `APPROVED`. Dispatch each assigned specialist (`agent-org:<id>`) with its task contract from the intent. Launch tasks the intent marks as independent in parallel, in one message. Run dependent tasks in order. Agents may run in the background and report back as notifications; **wait for every dispatched report** before starting dependent tasks or verification. Specialists never dispatch each other; hand-offs go through you.
6. **Collect and verify.** Read each result for outcome, evidence, changed files, findings and open questions. Run the validation the intent specifies yourself or through the assigned QA, InfoSec or Product specialist. Set Status to `IMPLEMENTED` only after every dispatched specialist has reported, then to `VERIFIED` only when the validation actually passed. Record the evidence (commands and results) in the intent.
7. **Final report:** outcome, evidence, changed files, open findings and open items, plus the intent path.

**Stop and re-plan** if scope or risk grows beyond the approved intent: a new trigger fires, more files or modules are involved than planned, a specialist reports BLOCKED, or validation fails in a way that needs a design change. Go back to the PM with what changed, update the intent, and get approval again before continuing.

**Never** claim a test, review or approval that didn't happen. A specialist's NOT RUN stays NOT RUN.

## The approval gate is instruction-only

Nothing in Claude Code technically stops implementation before approval. This gate holds only because you follow it. The user's permission rules are the only enforced layer.

## Intent template

```markdown
# <Title>

**Status:** PROPOSED | APPROVED | IMPLEMENTED | VERIFIED
**Repo / branch / base commit:** <repo> / <branch> / <sha>
**Level:** <2|3>. **Triggers hit:** <list>

## Goal
## Non-goals
## Acceptance criteria
- [ ] <observable, testable criterion>

## Implementation plan
- Components:
- Files:
- Steps:

## Specialist assignments
| # | Agent (`agent-org:<id>`, mandatory) | Task contract (objective · target revision · constraints · allowed actions · deliverables · test expectations · stop conditions) | Depends on | Parallel / sequential |
|---|---|---|---|---|

## Validation
- Tests:
- QA / InfoSec / Product: <only if triggered; otherwise "not triggered">

## Risks and rollback
## Open questions
- [BLOCKING] <question>: must be answered before approval
- [NON-BLOCKING] <question>. Default if unanswered: <default>
## Approval log
- <YYYY-MM-DD> PROPOSED by agent-org:principal-project-manager
```

Findings recorded in the intent use the canonical format (ID, target, severity CRITICAL/HIGH/MEDIUM/LOW, evidence, recommendation, disposition) with stable IDs: `ARCH-###`, `SEC-###`, `QA-###`, `PROD-###`.
