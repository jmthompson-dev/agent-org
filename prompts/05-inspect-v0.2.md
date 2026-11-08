# Phase 5 — Inspect for v0.2 (verify before building)

v0.2 adds five things (see `docs/v0.2-plan.md`): a claim-evidence hook at every level, parallel specialists in one shared tree with an after-the-fact collision check, a model-independent audit log, a scope-growth guard, and agent teams as a justified fallback for coupled work (B4/B5). Each one depends on Claude Code behavior that hasn't been verified yet. This phase verifies it **before anything is built**, so the design bends to the platform rather than the reverse.

Read first: `docs/v0.2-plan.md`, `docs/decisions.md`, and `reports/01`–`04` (they hold the hook and permission behavior already verified, which you don't need to re-verify).

## Hard constraints

- Mostly read-only. The only repo file you write is `reports/05-inspect-v0.2-<YYYY-MM-DD>.md`.
- Don't modify `~/.claude`, the installed plugin, `agent-personas` or any application repo.
- **Live probes are allowed but bounded:** they run only in a scratch directory outside every real repo, use `--model haiku` (or `sonnet` where Haiku can't exercise the behavior), and load probe hooks or a probe plugin **only** through `--settings <file>` or `--plugin-dir <dir>` placed in the scratch directory. No settings files get edited. **Cost gate:** list the planned probes, their count and a rough cost, and wait for my go-ahead before the first one.
- Never use `--dangerously-skip-permissions`. Evidence over narration: a claim is VERIFIED only with a doc URL or observed output; otherwise mark it UNVERIFIED.
- Clean up everything you create, including scratch transcripts under `~/.claude/projects/<scratch-slug>/` and temp task-output folders.
- **Probes run in the real environment, on purpose.** The installed agent-org v0.1 plugin (its guard and escalation hooks) and the user's 102 ask rules stay active, because B5 needs to see how they behave with parallel agents. Give the probe plugin a different name (e.g. `probe`), list every hook active in each probe run, and say when a v0.1 hook, not the probe, caused an observed behavior.

## Questions to settle

Mark each **VERIFIED** (doc URL, or the probe and its observed output) or **UNVERIFIED**. Add **Design impact** for each: what the answer means for the v0.2 plan.

### A. Claim-evidence hook (`Stop` / `SubagentStop`)
1. Input fields for `Stop` and for `SubagentStop`: in particular `transcript_path`, `stop_hook_active`, and any agent identity (`agent_type`, `agent_id`), plus whether the subagent's own transcript path or final message is provided.
2. Can the hook **block** the stop and force a continuation? What's the exact output (`decision: "block"` plus a reason, exit code 2, or something else)? Does the model see the reason?
3. For `SubagentStop`: does blocking make the **subagent** continue, and does the reason reach the subagent rather than the main thread?
4. Loop control: how does `stop_hook_active` behave on the second stop? Is there a built-in cap?
5. Transcript format: how to find, within the **current turn**, each tool call and whether it succeeded (`tool_result` error flag, Bash exit code). How to find the turn boundary. How large transcripts get, and whether reading only the tail is safe.
6. Does `Stop` fire in headless `-p` runs, and after resumed sessions? Does it also fire at the end of every `<task-notification>` turn and at the end of a dispatch turn where the main thread is only waiting for background agents? (Each of these is a stop A1 has to judge correctly.)
7. **Probe (live):** a scratch probe hook that blocks once when the final message contains "tests pass" and no test command ran in the turn. Run one Haiku session prompted to claim that tests pass without running them. Record whether the model continued, what it saw, and whether the second stop went through.
8. **Citation check (plan A1).** Can the hook reliably pull file paths from `Read`/`Grep`/`Glob`/`Edit` tool inputs across the whole session (not just the turn), including after compaction, and normalize them (relative vs absolute, `./`) for matching against paths cited in the final message? If not, say so: the claim "caught at every level" then doesn't hold for Level 0.

### B. Parallel specialists in one shared tree (plan B2, B3)
Worktrees are dropped: parallel specialists share the checkout, and collisions are detected afterwards and re-planned.
1. **Edit attribution:** can a hook or the main thread attribute each changed file to the agent that changed it? Check `PreToolUse`/`PostToolUse` for `Edit`/`Write` (`agent_id`, `agent_type`, `tool_input.file_path`) and whether `SubagentStop` gives the subagent's own transcript path. Two instances of the same `agent_type` must be told apart, so confirm `agent_id` is unique per instance.
2. **Concurrent edits:** what happens when two subagents edit the same file in one tree? Does `Edit` refuse a stale file ("modified since read") or overwrite silently?
3. **Unnamed dispatch:** does `deliver` control whether its `Agent` calls carry a `name`? (Named calls become teammates while agent teams are enabled; see F1.)
4. **Background agents in one tree:** anything in the docs about parallel subagents sharing a working directory (locking, warnings, recommended limits)?
5. **Probe (live, mandatory, the headline mechanism):** a scratch repo and a probe plugin with one tiny agent. From a Sonnet main thread, dispatch it twice in parallel: run 1 on two different files, run 2 both on the same file. Record per-agent attribution evidence, what the second edit did in run 2, and every permission prompt or denial.

### C. Audit log
1. `PreToolUse` payload for the `Agent` tool: the fields that identify the dispatched agent (`subagent_type`?) and the model, if any.
2. `SubagentStop` (or `PostToolUse` for `Agent`): which fields identify the agent and its outcome. Can the model actually used be read from the payload, or only from the transcript?
3. Can a hook write to `~/.agent-org/audit/` without any permission rule? (Hooks run as processes, not tools; confirm that.)
4. Correlation: is there an id that links a dispatch to its result (`tool_use_id`, `agent_id`)?
5. **Tamper evidence (plan C2: hash chain, guard ask, SessionStart warning, verify command).** Can parallel hooks append to the chained log safely (atomic append, a lock so two hooks don't chain off the same previous line)? Can `SessionStart` show a warning **to the user**, not only inject context for the model (e.g. a `systemMessage` field)? How long does verifying a large log take inside the hook timeout, and should it verify only since the last good checkpoint?

### D. Scope-growth guard
1. Is `session_id` in every `PreToolUse` payload, and is it stable across resumes?
2. Can a hook keep per-session state in `~/.agent-org/state/` safely, given that parallel hooks could run at the same time (atomic writes, locking)?
3. Repo identity from a hook's `cwd` (subdirectories, symlinks; derive it from `git rev-parse --show-toplevel`).
4. Edit vs Write vs NotebookEdit vs MultiEdit (if it exists in this build): which tools change files, so the counter misses none. Bash writes (`sed -i`, `>`) bypass the counter; that gap is accepted (plan D5), so just confirm nothing cheaper closes it.
5. **Session-scoped approval (plan D4).** How does the approval get tied to a `session_id` a hook can read? E.g. a `PostToolUse` hook on the intent `Edit` that sees `APPROVED` and writes `~/.agent-org/state/<session_id>`. Confirm the fields exist, and what happens after `/resume`, `/clear` and compaction (same `session_id` or a new one?).

### E. General
1. Claude Code version, and any change since 2.1.319 that affects hooks, agents or agent teams (check the changelog).
2. Hook timeouts and the cost of reading a large transcript inside the 5s budget.
3. Any new hook event or agent feature that would simplify the plan, for example a built-in way to require evidence or to detect conflicting edits.
4. Agent teams: see section F.

### F. Agent teams fallback (plan B4, B5, C4)
Docs only in this phase: teammates only spawn in interactive sessions, and this phase runs headless. Don't enable the flag. Already known from https://code.claude.com/docs/en/agent-teams (re-confirm each): experimental; a **named** `Agent` call launches a teammate unless it passes `isolation` on the call or is a fork; teammates share one working tree; plugin subagent definitions can be used as teammate types (`tools`, `model`, body applied; `skills` not); teammate permission prompts appear in the lead session; no nesting; no resume.
1. **Staying subagents:** with the flag on, does an **unnamed** `Agent` call reliably launch a subagent? Can Claude name a subagent on its own even when `deliver` doesn't ask it to, and if so, how does `deliver` prevent that?
2. **Detecting the flag:** can `deliver` or a hook tell whether teams are enabled and the session is interactive (e.g. the env var in the hook process, a `SessionStart` payload field)? `deliver` needs this for the flag-off path.
3. **Hooks in teammate sessions (needed for the team collision check, plan B3/B4):** do plugin hooks (`PreToolUse` guard, `Stop`, `SubagentStop`) run for teammates? With what identity (`agent_type`, `agent_id`, a team or teammate name)? Does the QA test-path deny still apply to a QA teammate?
4. **Team hook payloads for the audit log:** the input fields of `TaskCreated`, `TaskCompleted` and `TeammateIdle`; their block semantics (exit 2 plus feedback); whether any hook exposes teammate-to-teammate messages, even as metadata.
5. **Claim checks for teammates:** can `TaskCompleted` or `TeammateIdle` act as A1/A2 for teammates (read the teammate transcript, block once, then allow)? Where are teammate transcripts?
6. **Spawning from definitions:** what exactly does the lead pass to spawn a teammate from `agent-org:<id>`, and does the persona body plus runtime binding arrive intact? Do pinned models (D8) hold?
7. **Validation plan:** since nothing here can be probed headless, write the exact interactive steps Phase 6 needs for the team checks (plan §Phases 3), and what evidence each step leaves on disk.

## Report

Write `reports/05-inspect-v0.2-<YYYY-MM-DD>.md`:
1. Summary (five bullets max): is the v0.2 design feasible as planned?
2. Capability matrix A–F: question, status, evidence, design impact
3. Probe results, with the commands, the observed output and the cost
4. **Plan changes:** concrete edits to `docs/v0.2-plan.md`, each tied to a finding. If something is infeasible, propose the closest workable alternative.
5. Proposed decisions D25–D30: the wording, with status Decided / Verified / Open
6. Open questions for me
7. Cleanup and isolation confirmation

## Stop
Print the summary and **stop**. Don't change the plugin, the generator or the plan.
