# Phase 10, Part 1: Inspect level choice (2026-11-11)

Claude Code 2.1.322, macOS, Node 24.18.0. Plugin `./plugin` 0.2.1 (`065c147`, clean tree) loaded with `--plugin-dir`; every run's `init` listed `agent-org` at `…/git/agent-org/plugin` and `model: claude-sonnet-5-5`. 54 headless sessions: 6 probes ($0.321) and 48 baseline runs ($8.926), **$9.247 in total**, under the $10 cap. The only repo file written is this report.

## 1. Summary

- **The report 08 split did not reproduce.** All 10 prompts landed on one level in every run (48/48), and all six controls landed on their expected level. With report 08's rates, 5/5 Level 2 on (b) has a 59% chance and on (c) 17% (§3), so this narrows the split; it doesn't rule it out.
- **The real defect is consistent under-classification.** B3 (3 files, one module) and B4 (user-visible copy in 2 files) hit a D5 Level 2 trigger ("more than ~2 files"; "user-visible behavior change") and landed on **Level 1 in 5/5 runs each**. B3 skipped the "Plan:" line in 5/5 runs. The scope guard fired 0 times in 48 runs: B3's 3 files don't reach its `n > 3` threshold (`plugin/hooks/guard.mjs:505`).
- **Nothing scores the level today.** The rule card, `deliver` step 1 and the PM binding are instruction only. `escalate.mjs` nudged on 2 of 10 prompts, and only C2a and C3 among them. The only enforced floor is the edit-time scope guard. No hook checks Level 1's "Plan:" line.
- **Probe: a `Level check:` block in the same message as the first Edit isn't visible to `PreToolUse` (0/3).** A block in an earlier message is visible (3/3). The docs say the transcript "may lag".
- **Recommendation: A′.** The checklist goes in as one Bash call (`record.mjs --level-check …`), which the guard reads from its own state, keyed by `prompt_id`. It's mapped by a pure function, denied at the first edit when the result is ≥ 2 without an approved intent, and cross-checked against what the job actually edits (D1 tightened to > 2 files, D2 risky paths). It costs about one tool call per Level 1 job.

## 2. Where the level is decided today (1a)

| # | Place | What it does | Enforced or instruction |
|---|---|---|---|
| 1 | Rule card, `plugin/hooks/rule-card.md:1-7` (182 words), added by `session-start.mjs:34,38` | D5 table compressed; "a trigger sets the floor; never classify below it"; Level 1 "first Edit or Write must come after… 'Plan:'"; "Level 2+: load `agent-org:deliver`" | **Instruction only.** The hook only adds it to context |
| 2 | `escalate.mjs:14-22` (7 keyword groups), nudge text `:82-85` | On a keyword match it adds "This may be Level 2+ — consider loading… If it is clearly Level 0–1, proceed normally" | **Hook-injected advice.** It never blocks, and it explicitly lets the model decide. It sees only the prompt text |
| 3 | `deliver` step 1, `plugin/skills/deliver/SKILL.md:44`; table `:12-19` | "Classify with the table. At Level 0–1, stop using this workflow" | **Instruction only**, and reached only after the model has already chosen to load `deliver` |
| 4 | PM binding, `plugin/agents/principal-project-manager.md:61`; spec `prompts/02-generate.md:130` | "Levels: per the table sent; triggers set the floor" | **Instruction only**, and only at Level 2+. The PM can raise a level (C3 → 3) but never sees a job the main thread kept at Level 1 |
| 5 | Scope guard, `plugin/hooks/guard.mjs:483-507` (v0.2 plan D1/D2, D28) | Main thread, no approval for the repo key: `ask` on a file that would make **> 3** distinct files (`:504-506`), and on the first edit of each risky kind (migration, CI, infra, auth; `riskyKinds` `:311-323`) | **Enforced** (`ask`; headless `ask` = deny, D23), but only at edit time, only on file count and path, and a 3-file job never trips it |
| 6 | Level 1 "Plan:" line | — | **Not checked by any hook.** `grep -rn "Plan:" plugin/hooks` matches only `rule-card.md:3`. D20 (`docs/decisions.md:117-118`) keeps it instruction-only on purpose |

D4 ("a trigger sets the floor") exists only as text in items 1, 3 and 4. Below Level 2 no code applies it, except item 5's path and count floors.

## 3. Baseline (1b)

**Setup.**
- **Command:** `claude -p "<prompt>" --plugin-dir ./plugin --model sonnet --permission-mode default --output-format stream-json --verbose --strict-mcp-config --mcp-config '{"mcpServers":{}}' --max-budget-usd 1 --max-turns 60`.
- **Allowed tools:** `Read Grep Glob Skill Agent Edit(/**) Write(/**)` and Bash for `npm test`, `npm run`, `node`, read-only `git`, `ls`, `cat`, `printenv`.
- **Environment:** `ENABLE_CLAUDEAI_MCP_SERVERS=false`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, `TZ` unset.
- **Repos and order:** a fresh clone per run, interleaved round-robin with 3 at a time.
- **Stop rule:** `-p` ends at the first approval question, so no Level 2+ run implemented anything (0 files edited in all 23).

**How the level is scored:**
- **Level 2+:** `deliver` was loaded. The PM's level is read from the saved intent.
- **Level 1:** edits without `deliver`.
- **Level 0:** no edits.

**Fixtures:**
- `stockroom-api` and `orderbook`: report 08's original (b) and (c) repos at tag `benefit`, copied from that session's scratchpad.
- `notes-api`: new for this phase, with 15 files: `src/` (notes, store, format, paginate, slug, messages, server, `auth/apiKey.js`), `db/schema.sql`, `db/migrations/001_init.sql`, `public/index.html` and 2 test files. `npm test` passes 4/4, and there are no dependencies.

**Prompts.** Each was given word for word. Expected levels were fixed from D5 before any run. The last column shows the `escalate.mjs` nudge, checked offline by feeding each prompt to the hook.

| Id | Expected | Prompt | Nudge |
|---|---|---|---|
| C0 | 0 | What does `listNotes` in src/notes.js return when there are no notes? | — |
| C1a | 1 | `formatTitle` in src/format.js doesn't trim whitespace, so ' hi ' comes out as ' Hi '. Fix it and add a test. | — |
| C1b | 1 | `paginate` in src/paginate.js returns one item too many on each page. Fix it. | — |
| C2a | 2 | Add a nullable `archived_at` timestamp column to the notes table with a migration. | data |
| C2b | 2 | Use the `slugify` npm package to generate note slugs instead of our hand-written function in src/slug.js. | — |
| C3 | 3 | Replace our API-key check with per-user sessions: login with username and password, session cookies, and a role check so only admins can delete notes. | auth, secrets |
| B1 | borderline | Report 08 (b): Add POST /items/:id/adjust that takes { delta } and changes the item's qty. Reject a delta that isn't an integer, or one that would take qty below zero. | — |
| B2 | borderline | Report 08 (c): Products need a required sku field, a string. | — |
| B3 | borderline (> ~2 files) | Move the validation helpers out of src/notes.js into a new src/validate.js and update the imports in src/notes.js and test/notes.test.js. | — |
| B4 | borderline (user-visible) | Change the empty-state message from 'No notes yet' to 'Nothing here yet — add your first note' in public/index.html and src/messages.js. | — |

**Results.** Source: `b-results.jsonl`, written by the analyzer from each run's stream-json.

| Id | Runs | Levels (runs 1–5) | Split | Turns, median (range) | Cost | Files edited per run | "Plan:" before first edit | Scope guard fired |
|---|---|---|---|---|---|---|---|---|
| C0 | 5 | 0 0 0 0 0 | 5/5 L0 | 5 (3–5) | $0.328 | 0 | — | 0 |
| C1a | 5 | 1 1 1 1 1 | 5/5 L1 | 8 (8–8) | $0.334 | 2 | 5/5 | 0 |
| C1b | 5 | 1 1 1 1 1 | 5/5 L1 | 5 (5–6) | $0.281 | 1 | 5/5 | 0 |
| C2a | 5 | 2 2 2 2 2 | 5/5 L2 | 9 (9–9) | $1.422 | 0 (stopped at approval) | — | 0 |
| C2b | 5 | 2 2 2 2 2 | 5/5 L2 | 9 (9–9) | $1.528 | 0 | — | 0 |
| C3 | 3 | 3 3 3 | 3/3 L3 | 12 (9–12) | $1.423 | 0 | — | 0 |
| B1 | 5 | 2 2 2 2 2 | 5/5 L2 | 14 (9–15) | $1.498 | 0 | — | 0 |
| B2 | 5 | 2 2 2 2 2 | 5/5 L2 | 12 (12–16) | $1.407 | 0 | — | 0 |
| B3 | 5 | 1 1 1 1 1 | 5/5 **L1** | 8 (8–9) | $0.393 | **3** | **0/5** | **0** |
| B4 | 5 | 1 1 1 1 1 | 5/5 **L1** | 6 (6–6) | $0.311 | 2 | 5/5 | 0 |

**Notes behind the table:**
- **Analyzer correction:**
  - **The problem:** my analyzer first scored C3 run 3 as Level 2. It found no `**Level:** N` line, and its fallback for a `deliver` run is 2.
  - **The fix:** reading the saved intent showed "## Level and Triggers / **Level 3.**", and the final message says "**Level 3.**". C3 is 3/3.
  - **The other gaps:** 5 more Level 2 runs had no template `**Level:**` line (C2b-3, B1-1, B2-2, B2-3, B2-5). Each intent says Level 2 under a heading instead.
  - **Count:** 6 of 23 intents don't follow the template's `**Level:** <2|3>` line (`deliver/SKILL.md:82`), which matters for the audit (§5).
- **B3:**
  - **What happened:** each run went Read, Read, Grep, then Write `src/validate.js`, Edit `src/notes.js`, Edit `test/notes.test.js`, then `npm test`.
  - **What's missing:** no level reasoning and no "Plan:" line.
  - **Why the guard was silent:** the third file stays under `n > 3`, so the guard never asked.
- **B4:** each run wrote "Plan: Replace the string in `src/messages.js:1` and `public/index.html:6`…" and did it at Level 1. No run weighed "user-visible behavior change".
- **Why B1 and B2 didn't split:**
  - **What didn't change:** the rule card and `escalate.mjs` are unchanged since v0.2.0 (`git diff v0.2.0 -- plugin/hooks/rule-card.md plugin/hooks/escalate.mjs` is empty). `deliver` changed in v0.2.1, but that text is read only after the choice.
  - **The odds:** report 08 had (b) 9/10 and (c) 7/10 Level 2 in total. If those rates held, the chance of 5/5 Level 2 here is 0.9⁵ = 0.59 and 0.7⁵ = 0.17. The baseline doesn't show that the split is gone.
- **Side finding, outside this phase (for the backlog):** the claim check blocked 4 of the 5 C0 runs for `uncited-file` (audit `claim-flag ["uncited-file","blocked"]`, sessions `2a875c0f`, `60f8a5bc`, `8ff5063b`, `4d348e2b`). In C0-1 the model had seen the cited lines in **Grep** output, cited `src/store.js:5`, was blocked, then Read both files and confirmed. That's a false block: content seen through Grep doesn't count as opened.

## 4. What can see what (1c)

| Point | What it receives | Can it block or ask? | Evidence |
|---|---|---|---|
| `UserPromptSubmit` | Common fields plus `prompt`. Observed keys: `cwd, hook_event_name, permission_mode, prompt, prompt_id, session_id, transcript_path` | **Block** (`decision: "block"`, the prompt never reaches Claude) or **add context**. It can't ask | Docs: https://code.claude.com/docs/en/hooks#userpromptsubmit-input, #userpromptsubmit-decision-control. Probe: in 3/3 runs, `git ls-files` in `cwd` counted 15 files in **14–16 ms**, well inside the 5 s budget. |
| | It can read the repo, but it can't know which files or modules the job will touch, or whether it changes behavior: it has only the prompt | | B3 and B4 name their files in the prompt, but most prompts (B1, B2) don't |
| `PreToolUse`, first `Edit`/`Write`/`NotebookEdit` | `tool_name`, `tool_input`, `tool_use_id`, plus common fields. Observed keys: `cwd, effort, hook_event_name, permission_mode, prompt_id, session_id, tool_input, tool_name, tool_use_id, transcript_path`. **No field carries assistant text** | **`deny`, `ask`, `defer`** (`defer` only in `-p` with a single tool call). A headless `ask` is a deny (D23) | Docs: https://code.claude.com/docs/en/hooks#pretooluse-input, #pretooluse-decision-control. |
| | **Transcript:** the docs say `transcript_path` "is written asynchronously and may lag… may not yet include the current turn's most recent messages" (https://code.claude.com/docs/en/hooks#common-input-fields) | | **Probe P1–P3**, marker in the same message as the Write: `markerInTranscript: false` in 3/3, and the Write's own `tool_use` was also absent in 3/3. Stream: the marker and the Write shared one message id in each run |
| | | | **Probe P4–P6**, marker in a message with a Read, then the Write in the next message: `markerInTranscript: true` in 3/3 |
| | **`tool_input` of a Bash call is always visible**, with no lag: the guard already parses it (`guard.mjs:240-251`) | | — |
| Main thread, as instruction | Everything | Only by choosing | Baseline: it skipped the "Plan:" line on B3 5/5 and never weighed B4's "user-visible" trigger |

**How the probes ran.**
- **Hooks:** a scratch `--settings` added `UserPromptSubmit` and `PreToolUse(Edit|Write)` command hooks that logged booleans and counts only.
- **Code under test:** the agent-org plugin was loaded too.
- **Cost:** 6 runs, $0.321.
- **Scratch `HOME` failed:** with `HOME` pointing to a scratch directory, `claude -p` returned "Not logged in · Please run /login" ($0). So isolation used report 09's snapshot-and-diff instead (§7).

## 5. Design options (1d)

**A. Checklist block in the message, gated at the first edit (as specified).**
- **It fails on the probe as written.** A model that writes `Level check:` together with its first Edit, the natural form, is invisible to the guard (0/3). The guard would treat the block as missing and "ask once".
- **Interactive cost:** the user gets a permission prompt on every Level 1 job.
- **Headless cost:** the ask is a deny, and the model must repeat the block in a separate message, which costs one or two extra turns.
- **It works only if the block always sits in an earlier message than the edit.** That's an instruction the model can miss, and the transcript lag is documented without a bound.

**A′. Checklist as a tool call (recommended).**
- **Step 1, the check:** before the first file edit for a prompt, the main thread runs one Bash call: `node "<plugin root>/hooks/record.mjs" --level-check "<answers>"`. The answers are the D5 Level 2 and Level 3 triggers, each `y`, `n` or `?` (unsure). `record.mjs` maps them with a pure function `levelFromAnswers()`: any Level 3 `y`/`?` → 3; else any Level 2 `y`/`?` → 2; else 1; a malformed string → null. It stores `{level, answers}` in session state under the payload's **`prompt_id`** and repo key, and appends one `level` audit event (booleans only). It prints the level and, at ≥ 2, "load agent-org:deliver".
- **Step 2, the gate:** at the main thread's first `Edit`/`Write`/`NotebookEdit` in a repo with no approved intent, `guard.mjs` looks up the check for this `prompt_id`:
  - **missing or malformed:** deny with the exact command and question list (no user `ask`, so no interactive prompt);
  - **level ≥ 2:** deny with "load agent-org:deliver";
  - **level 1:** no decision.
- **Step 3, cross-checks** (deterministic, from what the edit actually does):
  - D1 tightened to match D5's "~2": a third distinct file in the repo → deny "this job is past Level 1", whatever the check said.
  - A D2 risky path whose trigger was answered `n` (migration ↔ schema, CI ↔ CI/CD, infra ↔ infra, auth ↔ auth) → deny, as a contradiction.
- **Why it beats A:** a tool call's `tool_input` reaches `PreToolUse` and `PostToolUse` in full, with no transcript reading and no lag. `prompt_id` is in every observed `PreToolUse` and `UserPromptSubmit` payload (§4), so each new request needs a new check, and a later bigger request in the same session isn't covered by an old one.

**B. Stronger prompt triggers in `escalate.mjs`.**
- **Coverage:** it nudged on 2 of 10 prompts. B1–B4 contain no trigger word, and none can be added without firing on ordinary prompts, which D3 excludes.
- **Limits:** it sees only the prompt (§4), so it can't count files or modules. A nudge is advice the model already overrides ("If it is clearly Level 0–1, proceed normally").
- **Verdict:** it can't make the choice reproducible. Not recommended, except as a pointer to the check.

**C. Only the edit-time floors (D1, D2), tightened.**
- **What it catches:** lowering D1 from `> 3` to `> 2` files would have caught B3 at its third file.
- **What it misses:** B4 (2 files, user-visible), and any Level 2 job done in ≤ 2 non-risky files (an API or behavior change in one route file). It records no reasons.
- **Verdict:** necessary but not enough. A′ includes it as a cross-check.

| | Same job, same level | Borderline goes up | D4 floor can't be argued down | Audit shows why | No needless escalation | Extra turns per Level 1 job |
|---|---|---|---|---|---|---|
| A (block in message) | Yes, if the block is seen | Yes (`?` = yes) | Yes, for answered triggers | Yes | Yes | **+1–2, plus an interactive prompt** whenever block and edit share a message |
| **A′ (tool call)** | Yes: same answers → same level | Yes (`?` = yes) | Yes; the path and count cross-checks catch contradictions | Yes, a `level` event with booleans | Yes: Level 0 never edits, so it never checks; clear Level 1 answers all `n` | **+1** (one Bash call, about $0.005–0.01 on a $0.05–0.08 job); +2 when forgotten (deny, check, retry) |
| B (keywords) | No | No | Keywords only | No | Risks noise | 0 |
| C (floors only) | Partly | Partly (> 2 files) | Paths and count only | No | Yes | 0, or an ask at file 3 |

**What A′ can't catch:**
- **A model that answers `n` to everything.** Only the deterministic cross-checks back it up: a third file, or a risky path answered `n`. A `n` on "user-visible behavior change" (B4) or "public API" in two non-risky files is taken on trust. The audit at least records the answer for review.
- **Edits through Bash** (`sed -i`, `cat >`). The same documented gap as D28.
- **A wrong but consistent check.** A′ makes the level reproducible for the same answers. If the model's answers vary run to run, the level still varies. Part 3 reports which question flipped.

**Overlaps and budgets:**
- **D1/D2 and D28:**
  - A′'s cross-checks replace the D28 file `ask` at Level 1: a deny at > 2 files instead of an ask at > 3.
  - The risky-path ask stays for paths the check answered `y` (it then denies anyway at level ≥ 2) and for prompts where no check is needed because an approval exists.
  - D28 keeps applying after a check. A job that grows past what it declared still hits the floors.
- **D20 (Level 1 "Plan:" instruction-only):** the check replaces the unenforced "Plan:" requirement with an enforced one. "Plan:" can stay as the human-readable line, or be dropped to make room.
- **Rule card (182 of ~190 words):**
  - **The trade:** the 15 trigger questions don't fit in the card. The card says only "before your first edit for a request, run the level check" and names the command; the deny message and `--level-check` with no answers print the question list.
  - **The plugin root:** `session-start.mjs` can put the absolute plugin root into the card at output time.
  - **Budget:** the Level 1 "Plan:" sentence (27 words) is the natural swap.
- **`deliver` and the PM:**
  - **Step 1:** `deliver` step 1 starts from the check's level instead of classifying again. The PM still may raise but not lower (D4).
  - **The `pm` level source:** the audit needs it, but 6 of 23 intents had no parseable `**Level:**` line. So either `record.mjs --intent-path` takes the level, or the main thread runs `--level-check` again with the PM's level. Making the PM keep the template line would be an instruction only.
- **What this doesn't redesign:** `deliver`'s workflow, the PM's role and the approval gate stay as they are.

## 6. Recommendation

**Build A′**, with C's D1 tightening as its cross-check, and point `escalate.mjs`'s nudge at the check instead of at "consider loading deliver".

**Expected levels for Part 3.**
- **The problem:** the Part 3 rule "lands on the higher of its two observed baseline levels" has nothing to work with, because no prompt split. Read literally, B3 and B4 would pass at Level 1.
- **What D5 says:** both hit a Level 2 trigger, and unsure counts as yes.
- **What I propose:** fix B3 = 2 and B4 = 2 now, before Part 2, and keep B1 = 2 and B2 = 2. **Your call.**

**Other decisions for you:**
- **Block form:** A′ (a tool call), instead of A as specified, because of the probe result.
- **Missing check:** the spec says "ask once, then deny". A′ denies with instructions straight away: an `ask` would put a permission prompt in front of you on every Level 1 job, and it is a deny headless anyway.
- **D1 threshold:** `> 3` → `> 2`. It denies at file 3 when there's no approved intent and the check said Level 1. This changes D28.

## 7. Cost and cleanup

| Item | Estimate | Actual |
|---|---|---|
| 1c probes (P1–P6, plus 2 scratch-`HOME` auth tries at $0) | ≈ $0.15 | $0.321 |
| Baseline, 48 runs (C3 cut to 3 on your go-ahead) | ≈ $9.9 | $8.926: C0 0.328, C1a 0.334, C1b 0.281, C2a 1.422, C2b 1.528, C3 1.423, B1 1.498, B2 1.407, B3 0.393, B4 0.311 |
| **Total** | ≈ $10 | **$9.247**; the $10 cap wasn't reached |

Cost per run is the largest `total_cost_usd` in its `result` events. Turns are the sum of `num_turns`.

**Isolation (snapshot and diff).**
- **Before:** sha256 of the 9 files under `~/.agent-org`, its directory list, the `~/.claude/projects` and `/private/tmp/claude-502` listings, the `settings.json` hash and `claude plugin list`.
- **During:** the diff showed **only additions**: 126 files (27 audit logs, 27 head records, 23 intents, 49 `state/<sid>` files). No pre-existing file changed.
- **After:**
  - **Copied out, then deleted:** the 126 added files, 54 `~/.claude/projects/…-scratchpad-p10-runs-*` folders and 43 matching task folders.
  - **Checked after deletion:** every snapshot item compares identical (files, dirs, projects, tmp, settings, plugins).
  - **Untouched:** `~/.claude/agent-org/hook-debug.jsonl`. `AGENT_ORG_HOOK_DEBUG` wasn't set.
- **Kept:**
  - **Evidence (18 MB)** in this session's scratchpad (`…/scratchpad/p10/`, deleted with the session): stream-json per run, `b-results.jsonl`, the probe log, the copied state, audit, intents, transcripts and task folders.
  - **Scripts:** `bin/run.mjs`, `bin/analyze.mjs` and `bin/prompts.json`, for the Part 3 rerun.
  - **Fixtures:** in the same folder.
- **Repo:** only this report was added. Nothing was installed, committed or pushed.
