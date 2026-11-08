---
name: audit-verify
description: Fully verify the agent-org audit log's hash chain and head record for one repo or all repos, and report the result without changing anything.
argument-hint: "[repo]"
disable-model-invocation: true
---

# agent-org: audit verify

Repo (optional): $ARGUMENTS

Run exactly one Bash call:

- With a repo name: `node "${CLAUDE_PLUGIN_ROOT}/hooks/audit-verify.mjs" --repo <repo>`
- Without one: `node "${CLAUDE_PLUGIN_ROOT}/hooks/audit-verify.mjs"`

It checks every audit file under `~/.agent-org/audit/`, rotated ones included, recomputes every hash, checks every link, and compares the end of the chain with the head record in `~/.agent-org/state/`. It prints one line per repo and exits 1 on any break.

Relay its output **verbatim**, then stop. Never edit, repair, truncate, rotate or delete the log or the head record, and don't offer to. A break means the log was changed outside the hooks: say which file and lines it names and leave the investigation to the user. The log is tamper-evident, not tamper-proof.
