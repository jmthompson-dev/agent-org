# Phase 2 — Generate (re-run), 2026-11-08

## 1. Summary
- The plugin already in `plugin/` (generated 2026-11-07, then revised in Phases 3–4) was checked file by file against the current `prompts/02-generate.md` and `docs/decisions.md`. The persona pin hasn't changed, so this run audited the existing files instead of regenerating them from scratch. That leaves a minimal, reviewable diff.
- Four small edits: InfoSec and TPM bindings no longer tell them to use `Edit`, which they don't have; `sync-personas.mjs --check` now also reports the persona repo's `production` branch; and the README lists interpreter one-liners as a guard gap (D12).
- Every verification check passes: plugin and marketplace validation, 14 × `OK` persona sync, the 11 `escalate.mjs` cases, the rule card, the 32 `guard.mjs` cases, debug-log privacy, frontmatter, and the path/secret grep.
- Nothing was installed, enabled, committed or pushed. No subagents were launched.
- One precondition note: the persona repo has an untracked `.DS_Store` (see §2).

## 2. Pin and preconditions
| Check | Result |
|---|---|
| `~/git/agent-personas` exists, on `main` | PASS |
| Working tree clean | PASS for tracked files. `git status --porcelain` shows one untracked `.DS_Store`, a macOS Finder file, not a persona change. Treated as clean in spirit; see §8 |
| `PIN` | `6d13ca61f0b556c53623bf056a4ff272024ce046` (branch `main`, "docs: unify Working method headings…; clarify PM approval gates") |
| No `60 seconds` in `principal-project-manager.md` at PIN | PASS (0 matches) |
| All 14 persona files at PIN | PASS (`git ls-tree PIN agents/`: 14 personas + README) |

Persona text is read only via `git show PIN:…` (through `sync-personas.mjs`), never from the working tree.

## 3. Files (bytes)
| File | Size | Changed this run |
|---|---|---|
| `.claude-plugin/marketplace.json` | 389 | – |
| `LICENSE`, `plugin/LICENSE` (identical, MIT, jmthompson-dev 2026) | 1071 each | – |
| `plugin/.claude-plugin/plugin.json` | 461 | – |
| `plugin/README.md` | 5979 | yes: interpreter one-liners added to the guard's known gaps |
| `plugin/agents/*.md` (14) | 3550–6503 | `information-security-architect.md` (5093), `technical-product-manager.md` (4761): D24 line fixed |
| `plugin/skills/deliver/SKILL.md` | 8340 | – |
| `plugin/skills/pm/SKILL.md` | 842 | – |
| `plugin/skills/architecture-review/SKILL.md` | 2139 | – |
| `plugin/skills/security-audit/SKILL.md` | 1959 | – |
| `plugin/skills/release-validation/SKILL.md` | 2142 | – |
| `plugin/hooks/hooks.json` | 908 | – |
| `plugin/hooks/escalate.mjs` | 4055 | – |
| `plugin/hooks/session-start.mjs` | 801 | – |
| `plugin/hooks/guard.mjs` | 15166 | – |
| `plugin/hooks/rule-card.md` | 960 (138 words) | – |
| `scripts/sync-personas.mjs` | 8988 | yes: also reports `production` |

Absent, as required: `plugin/settings.json`, `plugin/commands/`, `plugin/rules/`, `plugin/CLAUDE.md`, `plugin/.gitkeep`.

## 4. Agents
| id | model | tools | description (abridged) | deviation |
|---|---|---|---|---|
| principal-project-manager | opus | Read, Grep, Glob, WebFetch, WebSearch | Escalation entry point; Level 2+; classifies, writes intent, assigns; no code edits, no dispatch | none |
| solutions-architect | opus | Read, Grep, Glob, WebFetch, WebSearch | Boundaries, interfaces, contracts, NFRs; advisory | none |
| ai-ml-research-architect | opus | Read, Grep, Glob, WebFetch, WebSearch | AI/ML architecture, experiment design, eval rigor; advisory | none |
| information-security-architect | opus | Read, Grep, Glob, Bash, Write, WebFetch, WebSearch | Threat modeling, security tests, SEC findings, retests; never edits app code or accepts risk | none |
| data-knowledge-architect | sonnet | Read, Grep, Glob, WebFetch, WebSearch | Data models, stores, provenance, retention, access; advisory | none |
| technical-product-manager | sonnet | Read, Grep, Glob, Bash, Write | Acceptance criteria, product acceptance (PROD) | none |
| quality-assurance-architect | sonnet | Read, Grep, Glob, Bash, Edit, Write | Test strategy, execution, regression, release readiness; tests only | none |
| ui-ux-designer | sonnet | Read, Grep, Glob, Edit, Write, WebFetch | Flows, design specs, accessibility | none |
| full-stack-developer | sonnet | Read, Grep, Glob, Bash, Edit, Write, WebFetch, WebSearch | App features incl. DB migrations; not CI/CD, infra, LLM | none |
| ai-engineer | sonnet | same as above | LLM/agent features; not training or infra | none |
| ml-engineer | sonnet | same | ML pipelines, training, model ops; not LLM app features | none |
| devops-engineer | sonnet | same | Pipelines, CI, release/promotion; pipeline IaC wiring and secret refs (D16) | none |
| platform-engineer | sonnet | same | Shared runtime, mesh, IDP; shared IaC modules; runtime secret injection (D16) | none |
| cloud-engineer | sonnet | same | Provider accounts, network, IAM, cost; provider IaC and secret stores (D16) | none |

All specialist descriptions say "Dispatched from an approved agent-org intent". The three infra agents' descriptions and bindings spell out the D16 tie-breakers. No agent has `Agent`, no model is `inherit`, and none uses `permissionMode`/`hooks`/`mcpServers`/`initialPrompt`. Bindings are 130–244 words.

## 5. Enforcement gaps
| Scope | Enforced | Instruction-only |
|---|---|---|
| PM, solutions, AI/ML research, data-knowledge | Read-only tool list; no `Agent` | Advisory role; PM's roster-only ids, blocking/non-blocking labeling |
| InfoSec | No `Edit`, no `Agent`; guard `ask` on the command list | `Write` only for test plans/evidence; Bash only authorized scans; no live/prod testing without scope; never accepts risk |
| TPM | No `Edit`, no web, no `Agent`; guard `ask` | App/test code read-only; `Write` only for acceptance records |
| QA | No web, no `Agent`; **guard denies `Edit`/`Write` outside test paths**; guard `ask` | Bash isn't path-scoped, so it must not change app code through Bash |
| UI/UX | No `Bash`, no `Agent` | `Edit`/`Write` only for design artifacts |
| Engineers (6) | No `Agent`; guard `ask` on the command list; user ask rules | Stay within contract files/branch; no deploy/push/merge/tag/spend; D24 one-purpose Bash |
| Approval gate (`deliver`) | nothing | Intent save gate, blocking questions, explicit approval, wait-for-every-report, IMPLEMENTED/VERIFIED sequencing (D6) |
| Guard blind spots | — | git aliases, scripts/Makefiles, interpreter one-liners, variable-built commands; headless `ask` = deny (D23) |

## 6. Verification
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `claude plugin validate ./plugin` | PASS | "✔ Validation passed". One non-blocking directory warning: `ICON_MISSING` (catalog listing only) |
| 1b | `claude plugin validate .` (marketplace) | PASS | "Validating marketplace manifest … ✔ Validation passed" |
| 2 | `node scripts/sync-personas.mjs --check` | PASS | 14 × `OK`, pin `6d13ca6…`, "main: at pin", "production: local branch not found (not fetched…)", "result: 14 OK", exit 0 |
| 2b | `--bump <PIN>` idempotence | PASS | "0 file(s) changed"; `git status` unchanged by it |
| 3 | `escalate.mjs` cases | PASS 11/11 | typo→none; auth middleware→`auth`; author→none; migration→`data`; release notes/ML pipeline→none; production is down→none; upgrade→`change`; deploy to production→`delivery`; `<task-notification>`→none; malformed JSON→none, exit 0; repeat output identical |
| 4 | `session-start.mjs` | PASS | Emits `SessionStart` `additionalContext` with the rule card (138 words) |
| 5 | `guard.mjs` table | PASS 32/32 | Every row as specified; compound reason reads "(git commit; git push)"; `echo "git push"`→no output; `/home/test/app` QA edit→deny; malformed/empty stdin→no output, exit 0 |
| 5b | Debug log privacy (throwaway `HOME`, `AGENT_ORG_HOOK_DEBUG=1`) | PASS | 5 lines with only ts/keys/promptLength/groups/notification or ts/hook/tool/decision/rule/agent_type; `grep -cE 'SECRET\|/work\|git -C'` = 0 |
| 6 | Skill frontmatter | PASS | `deliver` has no `disable-model-invocation`; the other four have `disable-model-invocation: true` |
| 7 | Agent frontmatter | PASS | All 14 have name/description/tools/model; 4 opus, 10 sonnet; no `Agent` in tools, no `inherit` |
| 8 | Grep for home paths, bucket IDs, `secret=`/`token=` | PASS | No hits in `plugin/`, `scripts/`, `.claude-plugin/`, `LICENSE` |

Test harness (not committed): a Node script in the session scratchpad that pipes each payload through `spawnSync`.

## 7. Live items: status
These were UNVERIFIED in the first Phase 2. Status per `docs/decisions.md`:
- **Nesting:** irrelevant by design. No agent has `Agent` (D2); verified in Phase 1 §5d that nesting works, not relied on.
- **Hook payload filter:** VERIFIED (Phase 3 §6, D3): notifications start `<task-notification>`; `agent_type` present on subagent tool calls (D12, Phase 4 G5′).
- **Main thread loads `deliver` on a nudge:** observed in Phases 3–4 runs; still model judgment, re-test after any skill-description change.
- **`SessionStart` context lands:** Level 1 behavior tied to the rule card held 2/2 in Phase 4 (D20); re-test only if the card changes.
- New this run, needs nothing live: the binding wording fix and the sync script's `production` line.

## 8. Open questions
1. **`production` vs `main` for personas.** The prompt asks the sync check to report the persona repo's `production` HEAD, but that repo has only `main`, and `plugin.json` pins `personasBranch: main`. The script now reports both and prints "local branch not found" for `production`. Should `production` be dropped from the prompt, or is a `production` branch planned for agent-personas?
2. **Untracked `.DS_Store` in agent-personas.** Should it count as "dirty" for the precondition? Adding `.DS_Store` to that repo's `.gitignore` would settle it. I didn't touch that repo.
3. **Plugin icon.** `claude plugin validate` warns `ICON_MISSING`. It matters only for a catalog listing; add `.claude-plugin/icon.png` if you plan to submit.
