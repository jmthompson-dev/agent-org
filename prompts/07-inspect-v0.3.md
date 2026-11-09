# Phase 7 — Inspect for v0.3 (verify before building)

v0.3 adds an optional memory module (see `docs/v0.3-plan.md`, M1–M12): lessons captured from specialist reports, screened, filed by a script after review, indexed, searched, and archived rather than deleted. Each piece leans on Claude Code behavior or on v0.2 internals that haven't been checked for this use. This phase checks them **before anything is built**, so the design bends to the platform rather than the reverse.

Read first: `docs/v0.3-plan.md`, `docs/decisions.md` (D1–D30), `docs/v0.2-plan.md`, `reports/05`–`06b`, and `plugin/hooks/` (especially `lib/repo.mjs`, `lib/lock.mjs`, `lib/state.mjs`, `lib/audit.mjs`, `record.mjs`, `claim-check.mjs`, `session-start.mjs`). Anything already VERIFIED in `reports/05`–`06b` doesn't need re-verifying; cite it.

## Hard constraints

- Mostly read-only. The only repo file you write is `reports/07-inspect-v0.3-<YYYY-MM-DD>.md`.
- Don't modify `~/.claude`, `~/.agent-org`, the installed plugin, `agent-personas` or any application repo.
- **Live probes are allowed but bounded:** they run only in a scratch directory outside every real repo, use `--model haiku` (or `sonnet` where Haiku can't exercise the behavior), and load probe hooks or a probe plugin **only** through `--settings <file>` or `--plugin-dir <dir>` placed in the scratch directory. Any probe that writes memory-like files uses a scratch root, never `~/.agent-org/memory/`. **Cost gate:** list the planned probes, their count and a rough cost, and wait for my go-ahead before the first one.
- Never use `--dangerously-skip-permissions`. Evidence over narration: a claim is VERIFIED only with a doc URL or observed output; otherwise mark it UNVERIFIED.
- Clean up everything you create, including scratch transcripts under `~/.claude/projects/<scratch-slug>/` and temp folders.
- The installed agent-org v0.2.0 plugin stays active during probes. Name the probe plugin `probe`, list every hook active in each probe run, and say when a v0.2 hook, not the probe, caused an observed behavior.

## Questions to settle

Mark each **VERIFIED** (doc URL, or the probe and its observed output) or **UNVERIFIED**. Add **Design impact** for each: what the answer means for the v0.3 plan.

### A. Capture (M3)
1. Where the v0.2 report contract is defined and enforced today (rule card, bindings, `claim-check.mjs`). What is the least change that adds an optional `lessons:` field without weakening the A2 checks?
2. Can the `SubagentStop` hook read the subagent's final report reliably (field or transcript path, verified in `reports/05`)? How does it parse a structured `lessons:` block, and what happens with a malformed one (must fail open: no lesson, no block)?
3. Teammates (D30): do team sessions produce reports this hook sees? If not, say whether teammate lessons are simply out of scope.

### B. Screening (M4)
1. **Prompt-based hooks:** does Claude Code support hooks of type `prompt` (a model judges the input)? Which events support them, which model runs them, can it be pinned to Haiku, what does it cost, what is its timeout, and what does it return? Doc URL required.
2. If prompt hooks can't run on `SubagentStop`, or can't return a verdict the hook can act on, what is the cheapest alternative (e.g. `claude -p --model haiku` from a command hook)? Its latency against the hook timeout, and whether it needs auth or network that a hook may lack.
3. **Probe (live):** run the chosen mechanism on five fixed samples: a clean code lesson, an AWS-style key, a bearer token, a lesson naming a person and street address, and a lesson containing a tracking number. Record each verdict, latency and cost. Also run the regex blocklist on the same samples.
4. Where the screen fails, it must reject, never file. Confirm the failure modes (timeout, model error, unparseable verdict) can be told apart from "clean".

### C. Filing (M5)
1. **Trigger:** confirm `Stop` fires every turn and `SessionEnd` can't be relied on for a model call (reuse `reports/05` where possible). Confirm `SessionStart` can launch filing without delaying session start past its timeout. If not, can it spawn a detached process, and does that survive?
2. **Lock:** `lib/lock.mjs` is stale at 2s, gives up at 3s and then proceeds unlocked. Confirm that from the code. Specify the filing lock: PID plus start time, stale only if the PID is dead or past a TTL, fail closed (skip). Is a PID check reliable on macOS and Linux from Node (`process.kill(pid, 0)`)?
3. **Review signal:** from `lib/audit.mjs` and a real log line, which fields prove a specialist's work passed review? Can a proposal be joined to its audit entries (session, `agent_id`, intent)? What counts as "passed" at Level 0–1, where no reviewer runs? Propose a rule and flag it as an open question.
4. **Merge call:** the cheapest way to make one model call from a script (same mechanism as B, or `claude -p`), its cost per call and its failure handling (failure means keep both, never overwrite).

### D. Storage and project key (M2)
1. From `lib/repo.mjs`: confirm repos are keyed by top-level basename (D6). Show a concrete collision (two scratch repos with the same basename).
2. Remote-based key: normalization rules for ssh and https (`git@host:org/repo.git` and `https://host/org/repo` map to the same key), repos with no remote, several remotes, and a fork with both `origin` and `upstream`. Recommend the key, and say how notes join back to the D6 name used by intents and the audit log.
3. Is `~/.agent-org` (or the user's home) ever inside a git work tree? Write the check (`git -C <root> rev-parse --is-inside-work-tree`) and its cost.

### E. Loading and search (M8, M9)
1. `SessionStart` output: the size limit on injected context, and how agent-org's existing rule card and audit check already use it. How much room is left for two indexes? Propose the cap.
2. `PostToolUse` on `Read`: is `tool_input.file_path` present and absolute, so a hook can match note paths and update `use_count`/`last_used`? Does it fire for subagents too?
3. Is `rg` guaranteed on the user's machine, or does the search script need a fallback?
4. Skill packaging: can a plugin skill ship a script and call it by a path that resolves after install (`${CLAUDE_PLUGIN_ROOT}` or equivalent)?

### F. Toggle (M11)
1. How v0.2 hooks read configuration today, if at all. Where the switch should live (`~/.agent-org/config` or an env var) and how each memory hook checks it cheaply.
2. Confirm the memory hooks can be shipped in `plugin/hooks/hooks.json` and no-op when off, with nothing merged into user settings.

### G. Eval harness
1. Can a headless run point memory at a scratch root (env var) so evals never touch `~/.agent-org/memory/`?
2. How to read cost and turns from a `claude -p --output-format json` run. Doc URL.
3. Propose 3 seeding/benefit task pairs, the number of runs per arm, and the rough cost per full eval.

### H. General
1. Claude Code version, and any change since the version recorded in `reports/06b` that affects hooks, skills or prompt hooks (check the changelog).
2. Any built-in memory feature in Claude Code (auto memory, `/memory`, memory files under `~/.claude`) that overlaps M1–M12 or could collide with it. Doc URL.

## Report

Write `reports/07-inspect-v0.3-<YYYY-MM-DD>.md`:
1. Summary (five bullets max): is the v0.3 design feasible as planned?
2. Capability matrix A–H: question, status, evidence, design impact
3. Probe results, with the commands, the observed output and the cost
4. **Plan changes:** concrete edits to `docs/v0.3-plan.md`, each tied to a finding. If something is infeasible, propose the closest workable alternative.
5. Proposed decisions D31+: the wording, with status Decided / Verified / Open
6. Open questions for me (at least: project key, review signal at Level 0–1)
7. Cleanup and isolation confirmation

## Stop
Print the summary and **stop**. Don't change the plugin, the generator or the plan.
