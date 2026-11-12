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

## Roster (send this to the PM verbatim)

Assign only these ids. If no id fits a task, say so in the intent instead of inventing one.

| Id | Lane |
|---|---|
| `agent-org:principal-project-manager` | Plans and classifies; never assigned work |
| `agent-org:solutions-architect` | Service boundaries, interfaces, integration contracts, NFRs (advisory) |
| `agent-org:data-knowledge-architect` | Data models, stores, provenance, retention, access (advisory) |
| `agent-org:ai-ml-research-architect` | AI/ML architecture, experiment design, eval rigor (advisory) |
| `agent-org:information-security-architect` | Threat modeling, security tests, SEC findings, retests |
| `agent-org:quality-assurance-architect` | Test strategy and execution, regression, release readiness |
| `agent-org:technical-product-manager` | Acceptance criteria, product acceptance |
| `agent-org:ui-ux-designer` | User flows, design specs, accessibility |
| `agent-org:full-stack-developer` | App features: frontend, backend, APIs, DB migrations |
| `agent-org:ai-engineer` | LLM and agent features, retrieval, tool adapters |
| `agent-org:ml-engineer` | ML pipelines, training, evaluation, model ops |
| `agent-org:devops-engineer` | Pipelines, CI, release and promotion; pipeline secret refs |
| `agent-org:platform-engineer` | Shared runtime, mesh, IDP; shared IaC modules; runtime secret injection |
| `agent-org:cloud-engineer` | Provider accounts, network, IAM, cost; provider IaC and secret stores |

## Workflow

1. **Classify** with the table. At **Level 0–1, stop using this workflow.** At Level 1, write "Plan: …" before the first edit and run the tests afterward.
2. **Level 2+: plan.** Invoke `agent-org:principal-project-manager` with: the user's request verbatim, the repo (git top level or working directory), branch, base commit (`git rev-parse HEAD`), the triggers you saw, the level table, the roster, the intent template below, and any relevant context (files, errors, prior decisions). The PM returns only the intent as markdown (no `Outcome:` line: it's exempt from the report contract) and writes no files.
3. **Save the intent** (the PM's reply as is; strip nothing) **with the Write tool**, which creates missing directories. Get its path first with one Bash call, `node "${CLAUDE_PLUGIN_ROOT}/hooks/record.mjs" --intent-path <slug>` (`<slug>`: a short kebab-case name for the task). It prints a new, unique path under `~/.agent-org/intents/<repo key>/` and three header lines (`**Repo key:**`, `**Top level:**`, `**Session:**`); put them right under the `**Status:**` line. They tie the intent to this repo and this session: its approval counts only in this repo, and the guard denies writes to an intent another session owns. Every new intent gets a new path from this command; re-save your own intent at the path you got. If the new intent continues one another session owns (for example after `/clear`, which starts a new session), add `--supersedes <old intent path>`: it prints a fourth line, `**Supersedes:**`, to put with the others. Don't use Bash (`mkdir`, `cat >`, `sed`) for intent files; use Write and Edit. Don't save it in the target repo. Set Status to `PROPOSED`. **If the save fails for any reason (a guard deny included), stop.** Tell the user why and show the intent in chat. Don't implement anything until the file is saved, or the user explicitly says to proceed without it; record that waiver in your final report.
4. **Resolve blocking questions, then stop for approval.** A `[BLOCKING]` question has **no default** and **no recommended answer**. If any is open, ask only those questions, in a message that does **not** ask for approval, and end your turn. Don't suggest or hint at an answer to a blocking question. When answered, send the answers to the PM and re-save. **Approval never answers a blocking question:** if the user says "approved" while one is open, ask it again. Only when none is open, show a short summary (level, triggers, goal, specialists, the **Mode** of each task group and, for `team`, the PM's justification, main risks, non-blocking defaults) and the file path, and **stop and wait for explicit approval.** Silence, a question, or "looks interesting" is not approval. Approval accepts the plan and the **stated defaults** of non-blocking questions, nothing more. If the user asks for changes, send them back to the PM, re-save the intent and ask again.
   - **Before asking to approve a `team` group,** check the flag with one Bash call, `printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, and confirm you're in an interactive session (you're talking to the user). If the flag isn't `1` or the session isn't interactive, say so and offer both options without picking one: enable the flag (then restart or re-run), or run the group sequentially with one specialist owning the coupled parts.
5. **On approval:** set the status line to exactly `**Status:** APPROVED` and append `APPROVED <YYYY-MM-DD> by user` to the approval log (one Edit or two, either works: a hook re-reads the intent on every edit and records the approval for this session). Then dispatch each assigned specialist (`agent-org:<id>`) with its task contract and "Owns" entry from the intent. Launch tasks the intent marks as parallel in one message. Run dependent tasks in order. Agents may run in the background and report back as notifications; **wait for every dispatched report** before starting dependent tasks or verification. Specialists never dispatch each other; hand-offs go through you.
   - **Never change an approved intent's plan yourself.** If the intent conflicts with itself or with the code after approval (Owns, contracts, acceptance criteria, tasks, mode), stop, send it back to the PM, and ask for approval of the revised intent. After approval you edit only the status line, the approval log and the evidence or validation sections; a hook audits any other edit as `intent-edited-after-approval`.
   - **Subagent dispatches never carry a `name`.** A named `Agent` call becomes a teammate while agent teams are enabled. The guard denies a named `agent-org:*` call unless this session has an approved `Mode: team`; if that happens, re-plan (step 7), don't retry.
   - **Team groups** (only with an approved `Mode: team`): you are the lead. Spawn in-process teammates from the assigned `agent-org:<id>` definitions, with names; **never name a model** in the spawn (it would override the pinned model); give each its task contract and "Owns" entry; wait for every teammate to finish.
6. **Collect and verify.** Read each result for outcome, evidence, changed files, findings and open questions. When the last dispatched report arrives, set and save Status `IMPLEMENTED` **before** running validation. Then, in a separate edit, set `VERIFIED` only if the validation actually passed and every acceptance criterion is met or waived (below). Record the evidence (commands and results) in the intent.
   - **Relay specialist claims as theirs** ("full-stack-developer reports: tests pass"), and don't present them as your own until you've re-verified them.
   - **Collision check, before validation.** Read the session ledger with one Bash call, `node "${CLAUDE_PLUGIN_ROOT}/hooks/record.mjs" --ledger` (per agent: the files it changed and any collision flags the hooks recorded; never content). Compare it with the "Owns" column and `git diff --name-only`. A **collision** is any of: a file changed by two agents; a file changed outside its owner's "Owns" entry; a changed file no agent accounts for; a refused "modified since read" edit or a guard deny flagged by the hooks; a specialist reporting `BLOCKED` on a file another agent changed. On any collision, **stop**: name the file and agents, go back to the PM to rerun the affected task sequentially on top of the current state, and get approval again. **Never dispatch a fixer agent.**
   - **A specialist's `BLOCKED`:** re-plan (step 7), with one exception: if the blocked item is **not** one of the intent's acceptance criteria (e.g. an optional manual check) and you covered it with your own successful run, you may continue; record the item, why it isn't an acceptance criterion, and your evidence in the intent.
   - **Re-verify (Level 2+):** rerun the intent's tests yourself, and compare each report's changed files with the ledger and the diff. Run the test command on its own: no pipes, `;`, `&&` or `echo` of the exit status (the tool result already reports success or failure).
   - **`VERIFIED` needs every acceptance criterion met.** Check each acceptance criterion against evidence you have (your own runs, or a specialist's backed report). If any is unmet or unchecked, keep `IMPLEMENTED`, list the open criteria, and ask the user: they can waive a criterion (record `WAIVED <criterion> <date> by user` in the approval log) or have it re-planned. Never set `VERIFIED` while saying a criterion is unmet.
   - **Never commit, push or tag** unless the user asks for it in this session. After `VERIFIED`, offer it ("Want me to commit this?") and wait; the guard asks before any commit, push or tag anyway.
   - **Level 3 claim reproduction:** after the specialists and before `VERIFIED`, the Level 3 QA reviewer `agent-org:quality-assurance-architect` reproduces the key claims: it reruns the stated commands, re-checks the stated files, edits nothing, and marks each claim REPRODUCED or NOT REPRODUCED with evidence. Put this in QA's task contract. If that QA instance wrote code or tests in this job (check the ledger), it isn't independent: a fresh `quality-assurance-architect` instance that took no part does the reproduction instead. `VERIFIED` requires every key claim REPRODUCED. Never add a separate auditor agent.
7. **Final report:** outcome, evidence, changed files, open findings and open items, plus the intent path. If the work is `VERIFIED` and uncommitted, end with the offer to commit, not a commit.

**Stop and re-plan** if scope or risk grows beyond the approved intent: a new trigger fires, more files or modules are involved than planned, a specialist reports `BLOCKED` (including a conflict with another agent's work), a collision is found, or validation fails in a way that needs a design change. Send the PM what happened (for a conflict, the specialist's `result` audit line with outcome `BLOCKED` is the record; there's no separate `conflict` event), have it revise the intent, and get approval again before continuing. If the PM proposes `Mode: team`, that's a new approval at the gate. Specialists never start teams.

**Never** claim a test, review or approval that didn't happen. A specialist's NOT RUN stays NOT RUN.

## What is enforced and what isn't

The approval gate is **instruction-only**: nothing in Claude Code technically stops implementation before approval, and it holds only because you follow it. The user's permission rules are enforced. The agent-org hooks enforce: the claim and citation checks at every stop, the specialist report contract, the edit ledger and the same-group edit deny, the team gate (named `agent-org:*` dispatches), the audit-log protection, the scope guard (an `ask` past ~3 files or on a risky path without an approval recorded in this session for this repo's key), and intent ownership (a deny on writing to an intent another session owns, or overwriting one with no recorded owner). They don't enforce the approval itself.

## Intent template

```markdown
# <Title>

**Status:** PROPOSED | APPROVED | IMPLEMENTED | VERIFIED
**Repo key:** <the main thread fills in the three lines from record.mjs --intent-path>
**Top level:** <path>
**Session:** <session id>
**Supersedes:** <only when replacing another session's intent>
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

## Execution mode
One line per task group. `subagents` is the default; `team` only when a hand-off can't be written down up front.
**Mode:** subagents (group A: tasks 1, 2)

## Pinned interfaces
- <contract written down up front, so parallel tasks don't consume each other's work>

## Specialist assignments
| # | Agent (`agent-org:<id>`, mandatory) | Task contract (objective · target revision · constraints · allowed actions · deliverables · test expectations · stop conditions) | Owns (files or directories) | Depends on | Parallel / sequential |
|---|---|---|---|---|---|

## Validation
- Tests:
- QA / InfoSec / Product: <only if triggered; otherwise "not triggered">
- Level 3: key claims for QA to reproduce (REPRODUCED / NOT REPRODUCED)

## Risks and rollback
## Open questions
- [BLOCKING] <question> (no default; must be answered before approval)
- [NON-BLOCKING] <question>. Default if unanswered: <default>
## Approval log
- <YYYY-MM-DD> PROPOSED by agent-org:principal-project-manager
```

For a team group, the mode line reads `**Mode:** team (group B: tasks 3, 4) — hand-off: <the interface, contract, constraint or hypothesis that can't be pinned>; why: <why it must be discovered while working>`. The word `team` comes right after `**Mode:**`; a hook reads it.

Findings recorded in the intent use the canonical format (ID, target, severity CRITICAL/HIGH/MEDIUM/LOW, evidence, recommendation, disposition) with stable IDs: `ARCH-###`, `SEC-###`, `QA-###`, `PROD-###`.
