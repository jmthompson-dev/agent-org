# agent-org

Prompts that generate **agent-org**, a reusable Claude Code plugin: a Principal Project Manager orchestrator plus the 14 canonical personas from [agent-personas](https://github.com/jmthompson-dev/agent-personas).

The prompts are the recipe. The generated plugin is committed too, so every regeneration shows up as a reviewable diff instead of silent drift.

## Layout

| Path | What lives there |
|---|---|
| `prompts/` | Phase prompts, run in order in Claude Code from this repo's root |
| `plugin/` | Generated plugin output (committed) |
| `reports/` | Phase reports: inspection findings, diffs, validation evidence |
| `docs/decisions.md` | Why the design is the way it is |

## Phases

Each phase ends with **stop and report**. Review the report before running the next one.

1. `01-inspect.md` — read-only inventory of `~/.claude`, the persona repo, and verified CLI capabilities
2. `02-generate.md` — generate the plugin into `plugin/`
3. `03-validate.md` — install the plugin and test its behavior live in a scratch repo
4. `04-permissions.md` — user-level ask rules and the command guard, using what Phase 3 learned

## Branching

`development` → `production`. Tag `production` on each plugin regeneration (`v0.1.0`, ...).
