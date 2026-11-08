# Phase 1 — Inspect (read-only)

You are preparing to generate the **agent-org** Claude Code plugin. This phase is **inspection only**. You produce a report and stop.

Read `docs/decisions.md` first. It defines the target design. Your job is to find out what the current machine and CLI actually support, and what would conflict.

## Hard constraints

- **Read-only.** The only file you may create is `reports/01-inspection-<YYYY-MM-DD>.md` in this repo.
- Do not modify `~/.claude`, the persona repo, any application repo, or any settings.
- Do not install, clone, fetch, pull, commit, or push anything. If something you need is missing, report it and stop.
- Do not launch subagents, agent teams, or nested `claude` sessions.
- **Never print secret values.** For `env`, `apiKeyHelper`, tokens, and credentials, report key names only.
- Network use is limited to reading official Claude Code documentation.

## Inputs

- Canonical persona repo: `~/git/agent-personas` by default. If it isn't there, ask for the path. Don't clone it.

## Steps

### 1. Environment
- OS, shell, `claude --version`, Node version.
- Whether `claude plugin` subcommands exist (`claude plugin --help`).

### 2. User-level configuration inventory (`~/.claude`)
- Directory tree to depth 3. Skip `projects/`, `todos/`, `shell-snapshots/`, `statsig/`, caches, and backups.
- `settings.json`: list top-level keys. Summarize `permissions`, `hooks`, `enabledPlugins`, marketplaces, `model`, and `agent` if present.
- `CLAUDE.md`: summarize in a few lines.
- Existing agents, skills, commands, rules, and hooks, with one line each on what they do.
- Any existing routing, dispatcher, or guard system. Describe what it intercepts and when.

### 3. Canonical personas
- Path, current branch, HEAD SHA, dirty or clean.
- Confirm these 14 IDs exist, and flag any missing or extra:
  `principal-project-manager`, `technical-product-manager`, `solutions-architect`, `ai-ml-research-architect`, `data-knowledge-architect`, `information-security-architect`, `quality-assurance-architect`, `ui-ux-designer`, `full-stack-developer`, `ai-engineer`, `ml-engineer`, `devops-engineer`, `platform-engineer`, `cloud-engineer`
- Approximate size of each persona (characters ÷ 4 ≈ tokens). This decides verbatim vs. condensed runtime text in Phase 2.
- Note conventions from `README.md` and `agents/README.md`.
- Flag description overlap between `devops-engineer`, `platform-engineer`, and `cloud-engineer`. Routing depends on disjoint descriptions.

### 4. Capability verification
For each item, mark **VERIFIED** (cite the doc URL or the CLI output) or **UNVERIFIED**. Don't infer.

| # | Question |
|---|---|
| a | Plugin manifest format and component directories (`agents/`, `skills/`, `commands/`, `hooks/`) |
| b | Does plugin-root `settings.json` honor `agent`? What's the precedence against user `settings.json`? Which other keys are honored? |
| c | Supported agent frontmatter fields (`name`, `description`, `tools`, `model`, others) |
| d | Can a subagent spawn subagents in this build? |
| e | Can a `UserPromptSubmit` hook inject context? What's the plugin hook file format? |
| f | Ask-rule syntax for Bash and PowerShell commands. Can plugins ship permission rules? |
| g | Skill frontmatter that disables model auto-invocation |
| h | Current value of `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. Read it; don't change it. |
| i | How plugin commands are namespaced (e.g. `/agent-org:pm`) |

### 5. Conflict analysis
- Name collisions between the 14 agent IDs, planned skills, or commands and anything already installed.
- Overlap with existing routing or guard systems. Which one should win, and what would fire twice?
- An `agent` key already set in user settings.
- Hooks that would double-fire on the same event.

## Report format

Write `reports/01-inspection-<YYYY-MM-DD>.md` with these sections:

1. Summary (five bullets max)
2. Environment
3. `~/.claude` inventory
4. Canonical personas (SHA, roster check, sizes, overlap)
5. Capability matrix (VERIFIED / UNVERIFIED, with evidence)
6. Conflicts
7. What Phase 2 must adapt — concrete changes to the design, each tied to a finding
8. Open questions for me

## Stop

After writing the report, print the summary and **stop**. Don't start Phase 2.
