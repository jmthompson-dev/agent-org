# Design decisions

Status key: **Decided** · **Verified** (confirmed in Phase 1 against docs or the CLI) · **Open** (needs a live test in Phase 4)

## Orchestration

### D1. Plain Claude stays the default agent — Decided, Verified
The plugin ships **no** `settings.json`, so it never changes the main thread. A PM that can't edit code would turn every small fix into a two-agent handoff, which defeats the minimum-effective-agents principle.

### D2. The PM plans; the main thread dispatches — Decided
On escalation, the main thread calls `agent-org:principal-project-manager`. The PM classifies the task, sets the level and returns an intent document and specialist assignments. The **main thread** writes the intent file, gets approval and dispatches the specialists.
- The PM has **no `Agent` tool**. Specialists have no `Agent` tool either, so nothing nests.
- Why not let the PM dispatch, given that nesting works (Phase 1 §5d)? Specialist output would be buried two levels down; agent teams, if enabled, forbid nesting; and the PM would become a relay bottleneck. Dispatching from the main thread works in every configuration.

### D3. Escalation is hook-first, judgment-second — Decided
- A `UserPromptSubmit` hook pattern-matches hard triggers using **word boundaries** (so `author` doesn't match `auth`) and injects a *nudge* to load the `agent-org:deliver` skill. It is not an order.
- A short `SessionStart` rule card gives the main thread the level definitions in every session, so model judgment covers what the hook misses.
- The hook fails open, has no dependencies, uses a short timeout and produces the same output however often it fires.
- Trigger groups: auth, secrets, data, infra, delivery, change (dependencies, upgrades, breaking changes, public API). Bare `production`, `release`, `pipeline` and `token` are excluded: they fire on ordinary prompts, and a nudge that fires constantly gets ignored.
- `UserPromptSubmit` also fires on background-agent reports and cross-session messages (Phase 1 §5e). v0.1 accepts the redundant nudge. When debug is on, the hook logs payload **key names** so Phase 4 can design a real filter from real payloads. **Open.**

### D4. Hard triggers set the minimum level — Decided
A trigger sets the floor. The PM can raise a level but never lower it below a trigger.

### D5. Levels are defined by concrete triggers, not adjectives — Decided
| Level | Definition | Handling |
|---|---|---|
| 0 | Question, explanation, read-only lookup, docs typo | Main thread. No agents. |
| 1 | Localized change, no more than ~2 files, no trigger hit | Main thread gives a one-line "here's what I'll do", then does it with focused tests. No intent file. |
| 2 | Any of: more than ~2 files or more than one module; public API or contract change; schema or migration; new or upgraded dependency; auth or authz; secrets or credentials; CI/CD or infra/IaC; cross-service integration; user-visible behavior change | PM → intent file → **your approval** → only the specialists whose triggers fired |
| 3 | Any of: auth/authz redesign; sensitive-data handling; production data migration; multi-service architecture change; production release or deploy; significant AI/ML platform work | As Level 2, plus independent QA and InfoSec, durable evidence, and human approval before release |

Level 2 catches most real work, so the line between 1 and 2 is drawn by triggers to avoid both needless approval stops and risky changes slipping through.

### D6. Level 2+ work requires an approved intent file — Decided
- The PM writes the content. The main thread saves it to `~/.claude/intents/<repo>/<YYYY-MM-DD>-<slug>.md` and creates the directory if it's missing.
- **Nothing is implemented until you explicitly approve.** The approval is recorded in the file.
- Not stored in the target repo, so application repos stay untouched. Not stored in session memory, because it would be lost on session end or compaction. Not stored in an OS cache folder, which can be wiped at any time. Not stored in `~/Library/Application Support`, because that path is macOS-only. `~/.claude` is Claude Code's own data folder on every OS.
- `<repo>` is the basename of the git top level, or of the working directory outside git.
- The approval gate is an **instruction, not enforcement**. Nothing technically stops a model from skipping it. That gap is documented, not hidden.

### D7. Agent teams are out of scope for v0.1 — Decided
They're off on this machine. With teams enabled, a named subagent becomes a teammate and teammates can't nest. D2 avoids depending on nesting, so turning teams on later doesn't break the design.

## Models

### D8. Pin every agent's model; never use `inherit` — Decided
`inherit` silently drops architects to Sonnet in a Sonnet session, or puts everything on Opus at Opus prices.
- **opus:** `principal-project-manager`, `solutions-architect`, `information-security-architect`, `ai-ml-research-architect`
- **sonnet:** all others

Run the everyday session on Sonnet. Levels 0–1 never spawn an agent, so trivial fixes cost only the session model. Use the built-in `Explore` agent for cheap lookups; don't add a Haiku agent.

## Packaging

### D9. Delivered as a plugin through a marketplace in this repo — Decided
`.claude-plugin/marketplace.json` at the repo root points to `./plugin`. The generated plugin is committed, so every regeneration is a reviewable diff.

### D10. Plugin settings can't carry permissions — Verified
Plugin `settings.json` honors only `agent` and `subagentStatusLine`. Ask rules live in user `settings.json` (Phase 3).

### D11. Hooks live only in the plugin — Decided
Plugin hooks and user hooks aren't de-duplicated, so Phase 3 must not copy the plugin's hooks into user settings.

### D12. The command guard is Phase 3 — Decided
Ask rules match command text only (`git -C . push` slips past `Bash(git push *)`). A plugin `PreToolUse` guard tightens them. It belongs with the permissions work in Phase 3, not in Phase 2.

### D13. No rules or CLAUDE.md in the plugin — Verified
A plugin's root `CLAUDE.md` isn't loaded. Orchestration policy lives in the `deliver` skill, the `SessionStart` rule card and the agents' runtime bindings.

### D14. One model-facing entry point; everything else is user-only — Decided
`deliver` is the **only** skill Claude can invoke by itself, so every self-started piece of work goes through the PM, one set of level rules and one approval gate. Inside `deliver`, the PM already assigns architects and InfoSec when their triggers fire, so model-invocable review skills would be a second, competing route to the same work.
| Skill | Invocation | Purpose |
|---|---|---|
| `deliver` | model + user | The escalation workflow: PM → intent → approval → dispatch → verify |
| `pm` | user only | Force escalation: `/agent-org:pm <task>` |
| `architecture-review` | user only | Standalone design review with only the relevant architects; recommends, never approves |
| `security-audit` | user only | Standalone audit: scope check → threat analysis → justified scans → evidence → retest; never accepts risk |
| `release-validation` | user only | Pin the candidate; collect QA, Product and InfoSec dispositions and human approvals; never deploys |

All are main-thread workflows that dispatch agent-org specialists, which keeps D2 intact. User-only skills don't sit in Claude's context as matching candidates, so this also cuts always-loaded text. The `engineering` and `design` plugins, synced from claude.ai, duplicated the specialists and carried failing connectors. **Decided: disabled** at the claude.ai source, since a local-only disable may be re-synced. Phase 4 confirms they're gone with `claude plugin list`.

## Personas

### D15. Persona text is verbatim and pinned to a commit — Decided
- Each agent embeds its canonical persona body unchanged, between marker comments, stamped with the source commit.
- The plugin pins a specific `agent-personas` commit, recorded in `plugin.json` `metadata`. It does **not** follow the persona repo's `main` HEAD. Bump the pin deliberately by regenerating.
- First pin: the commit that contains the event-driven supervision fix, which replaced the PM's unenforceable "every 60 seconds" clauses at the source instead of overriding them in the plugin.

### D16. The infra agents get disjoint descriptions — Decided
- **devops:** pipelines, CI files, release and promotion. Owns IaC wiring into pipelines, and pipeline secret references.
- **platform:** shared runtime (orchestration clusters, service mesh, internal developer platform, paved paths). Owns reusable IaC modules for shared services, and runtime secret injection.
- **cloud:** provider accounts, network, IAM, cost and quotas. Owns provider-resource IaC, and provider secret stores.

## Repo

### D17. This repo is public — Decided
No secrets, tokens, absolute home paths, synced-bucket IDs or employer-specific details in the prompts or the generated plugin. Licensed MIT.
