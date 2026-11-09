# Phase 9 — v0.2.1: fix the backlog, validate, run the release checklist

v0.2.0 is tagged and pushed (`616d43a`). v0.2.1 fixes the ten items in `docs/v0.2-plan.md` § v0.2.1 backlog (V21-1 to V21-10). Nothing else: no level-choice work, no memory, no new features. If a fix starts turning into a redesign, stop and ask.

Work in three parts and **stop after each**:
1. Generate: spec and code changes, unit tests, version bump
2. Validate: headless checks, cost-gated
3. Release checklist: interactive, I run it

Read first:
- `docs/v0.2-plan.md` (backlog V21-1 to V21-10)
- `reports/release-checklist-v0.2.0-2026-11-08.md` §6, which has the detailed fix for V21-1 to V21-8
- `reports/07-inspect-v0.3-2026-11-09.md` D1–D3 (repo key, normalizer, fallbacks)
- `reports/08-memory-value-v0.3-2026-11-09.md` §6 side finding (V21-10)
- `docs/decisions.md`, `docs/release-checklist.md`
- `reports/02-generate-v0.2e-2026-11-08.md`, for how earlier generate phases were run and reported

## Hard constraints

- **Mirror every plugin change in `prompts/02-generate.md`** (the generator spec), then regenerate or hand-apply, and confirm the code matches the spec. A change that exists only in `plugin/` is a defect.
- Develop and test with `claude --plugin-dir ./plugin`. Don't install, update or uninstall the plugin.
- No commits, pushes, tags or marketplace changes. I commit. Repo files you may write: `prompts/02-generate.md`, `plugin/**`, `docs/decisions.md`, `docs/release-checklist.md` (Part 3 only, as described there), `docs/v0.2-plan.md` (status notes on backlog items only), and the reports named below.
- Never touch real data under `~/.agent-org` except through a migration I approve (V21-9). Tests and validation use scratch repos and a scratch home, or the before/after snapshot and cleanup procedure from Phases 6 and 8.
- Evidence over narration: every "fixed" needs a unit test or an observed run.

## Part 1 — Generate

### Priority 1: V21-10, intents overwritten blind
Intent files are `~/.agent-org/intents/<repo>/<date>-<slug>.md`, so same-day, same-slug intents overwrite each other, as report 08 saw.
- **Find every reader and writer** of intent paths first: `deliver`, the guard's "APPROVED intent for this repo" check (the D1 scope guard), `record.mjs` (`approvalFor`, the audit `intent` field), escalate, and anything else that globs the folder. List them, with `file:line`, in the report.
- **Make each filename unique.** Add a short suffix: a session-id prefix or a hash.
- **Refuse to overwrite an intent another session owns.** The intent records its owning session; a write from another session must create a new file.
- **Stop cross-repo matches.** The intent records the repo's full key (V21-9) and its top-level path. Every reader that matches an intent to "this repo" must check that key, not just the folder name. Otherwise an APPROVED intent from a same-named repo satisfies the scope guard in the wrong repo. Say whether that can happen today, with evidence.
- **Keep old intents readable:** existing files with old-style names still work.

### Priority 2: V21-9, repo key
Key the audit log, head record and intents by the normalized `origin` remote, else `local-<hash of the top-level path>`. Keep the D6 basename for display. Use the normalizer and fallbacks verified in report 07 D2.
- **Migration:** the audit log is hash-chained (D27), and the migration must not break the chain or the head record.
  - **Before writing any code,** propose the migration in the report: what moves where, how the chain stays valid, the backup taken first (to `~/.agent-org/backups/`), whether it's idempotent, and how to roll it back.
  - **Don't run it on real data** until I approve, in Part 2.
- **If the migration is risky or large,** say so. The fallback is: new key for new data, old files left in place and still readable, migration deferred. Recommend one.

### Then: V21-1 to V21-8
Apply the fixes as specified in the release checklist report §6. Where it leaves a choice open, take the narrowest option and say which. For V21-4 to V21-6, the change goes in `docs/release-checklist.md` (Part 3), not the plugin. For V21-7, implement the de-duplication only if you can show the re-delivery from the 6c evidence; otherwise leave a checklist step to confirm it.

### Finish Part 1
- **Tests:** unit tests for every changed hook path, with each V21 item tested by name. Run the full suite.
- **Checks:** `claude plugin validate ./plugin` passes, and `sync-personas --check` reports 14 × OK.
- **Version:** bump `plugin.json` to `0.2.1`.
- **Decisions:** add a note to each affected decision in `docs/decisions.md`. Add a new decision only for the repo key and the intent identity.
- **Report:** write `reports/02-generate-v0.2.1-<YYYY-MM-DD>.md`:
  - what changed per V21 item, with spec and code locations
  - the intent reader and writer list, and the cross-repo answer
  - the migration proposal
  - test results
  - anything deferred, and why
- **Stop.**

## Part 2 — Validate (headless, cost-gated)

Show the plan and a cost estimate (well under $5), then wait for my go-ahead. Use scratch repos only.
- **V21-10 collisions:**
  - two sessions in the same repo, same day, same slug: two intent files, neither overwritten
  - two scratch repos with the same basename (`…/a/app`, `…/b/app`): separate keys, and an APPROVED intent in one does **not** satisfy the scope guard in the other
- **V21-9 key:** ssh and https remotes map to one key; a repo with no remote gets `local-<hash>`; the audit chain verifies after new writes (`/agent-org:audit-verify`).
- **V21-9 migration (only if I approved it):**
  - run it on a **copy** of the real `~/.agent-org` in a scratch home first: chain verifies, head matches, a re-run changes nothing
  - only then, with my go-ahead, run it on the real data, after the backup
- **V21-1:** replay the six false-block cases from 6c through `claim-check` and confirm none blocks, plus one true claim with no evidence that still blocks.
- **V21-2:** the specialist ask-list deny and the QA path deny each write a `guard-deny` audit line.
- **V21-3:** a Level 2 job reaches VERIFIED, and the main thread offers a commit instead of attempting one.
- **Regression:** the Phase 6 headless checks still pass.
- **Report:** write `reports/09-validate-v0.2.1-<YYYY-MM-DD>.md`: pass/fail per check with evidence, cost, cleanup and isolation confirmation. **Stop.**

## Part 3 — Release checklist (I run it)

- **Update the checklist:** `docs/release-checklist.md` gets the V21-4, V21-5 and V21-6 edits, plus a permanent step for V21-10: two sessions with the same slug in the same repo.
- **Script:** print the interactive script the way Phase 6c did, then wait for my notes.
- **Record:** write `reports/release-checklist-v0.2.1-<YYYY-MM-DD>.md`, ending in **GO or NO-GO for tagging v0.2.1**.
- **Backlog status:** mark each V21 item in `docs/v0.2-plan.md` as fixed, deferred or confirmed.
- **Stop.** Tagging, the `production` fast-forward and re-pinning the marketplace are mine.

## Stop
After each part, print a summary of five bullets at most, and stop.
