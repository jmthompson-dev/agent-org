---
name: pm
description: Force agent-org escalation for a task, running the deliver workflow (PM intent, approval, dispatch) at Level 2 or higher.
argument-hint: <task>
disable-model-invocation: true
---

# agent-org: forced escalation

The user forced escalation for this task:

$ARGUMENTS

Run the `agent-org:deliver` workflow **starting at step 2**, and treat the task as **Level 2 or higher** even if no trigger fired. The PM may raise it to Level 3 but not lower it below 2. Load the `agent-org:deliver` skill for the level table, intent template and workflow if they aren't already in context.

Every rule of `deliver` applies: save the intent as `deliver` step 3 says (a new path from `record.mjs --intent-path`), stop for explicit approval, dispatch only the assigned specialists from the main thread, and verify before reporting. If no task was given, ask for one.
