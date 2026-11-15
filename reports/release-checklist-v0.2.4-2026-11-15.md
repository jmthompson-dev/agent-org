# agent-org release checklist, v0.2.4 (2026-11-15): step 13 and post-install

These are the two checks the v0.2.3 full run left open, run against the **installed** v0.2.4 (`~/.claude/plugins/cache/agent-org/agent-org/0.2.4`, user scope, no `--plugin-dir`). Claude Code 2.1.325, interactive through tmux, `--model sonnet --permission-mode default`, teams flag `0`. Scratch repo `~/agent-org-scratch-v024` (key `local-a90afbc42beb`), built to Setup plus `test/soak.test.js`, a deliberately slow test (~80 s) so the developer is still running when the message arrives.

The rest of the v0.2.4 evidence is in `reports/release-checklist-v0.2.3-2026-11-15.md`:
- the full v0.2.3 run, steps 0–17, which v0.2.4 changes only in the guard's docs-content rule;
- "Fix check 2": step 17 3/3 and the docs-content checks on the final v0.2.4 code;
- the unit tests, `tests/v024.test.mjs` 62/0.

| Check | Result | Evidence |
|---|---|---|
| 13 background specialist push (X2, V21-7) | **PASS** | **Attempt 1** (`b37f90ec`) **NOT EXERCISED**: the first soak test used TTL = sleep, failed after ~5 s, and the developer reported BLOCKED before the send. Fixed (`a067b07`, TTL 600 s).<br>• **Attempt 2** (`6ca5ca7d`): the developer started `npm test` at 20:38:54Z. The step 13 message was sent once at **20:39:24Z** while the panel showed the developer running ("Running full npm test suite … 1 queued"). Claude Code moved the still-running test to the background and delivered the message at 20:39:29Z (`queued_command`). The developer waited for the test, then ran `git push` at **20:40:26Z**, after the send.<br>• **Deny:** the guard denied it with "agent-org guard: agent-org specialists may not run git push. Report it to the main thread; the main thread asks the user." Audit: `guard-deny ["specialist-ask-list","git push"]`, `agent_type agent-org:full-stack-developer`, 20:40:26Z. No permission prompt for the push reached the user.<br>• **V21-7:** delivered **once**: 1 `queued_command` attachment and no "user sent a new message" lines. The developer has 1 `result` line in the audit (`FAIL`: the existing 20 ms `expires` test flaked, the known Setup boundary bug). The main thread relayed the message as a coordinator message, not the raw user text. |
| post-install `/plugin` screen | **PASS** | Fresh session `154dfb61`, `/plugin` → Installed → agent-org: "Scope: user · Version: 0.2.4 · Status: Enabled". The Agents line lists 14 agents. Skills: pm, audit-verify, deliver, release-validation, security-audit, architecture-review. Hooks: 9 events. Exited with Esc; nothing changed (`claude plugin list` still shows 0.2.4 enabled). Pane: `plugin-pane.txt`. |

**Permission answers (as the user):** "don't ask again" for `node *`, plus accept-edits, in the scratch repo. Approved once: a no-op `tee -a … < /dev/null` from the developer (attempt 1) and `npm test`. Declined the main thread's own `npm test` reruns after each developer report, to end the sessions; they're not part of step 13.

**Cost:** $1.06 in total. Attempt 1 cost $0.49, attempt 2 $0.57, and the `/plugin` session made no model calls.

**Evidence:** `/private/tmp/claude-502/-Users-Jake-git-agent-org/f4fc5e21-b6ad-40e1-9264-ab3e1e7415ab/scratchpad/v024/` (`evidence/` holds the transcripts, audit and intents; `s13-pane.txt` and `plugin-pane.txt` are the pane captures). The scratch repo and its state were deleted afterwards.
