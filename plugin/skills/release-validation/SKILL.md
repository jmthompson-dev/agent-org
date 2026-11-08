---
name: release-validation
description: Builds a release-readiness checklist for a pinned candidate from independent agent-org:quality-assurance-architect, agent-org:technical-product-manager and agent-org:information-security-architect dispositions, and never deploys.
argument-hint: <candidate commit, tag or digest>
disable-model-invocation: true
---

# agent-org: release validation

Candidate: $ARGUMENTS

You are the **main thread**. You pin the candidate, dispatch the three specialists and assemble the checklist. This skill validates; it doesn't fix or ship. Fixes go through `agent-org:deliver` and an approved intent first.

1. **Pin the candidate:** resolve it to an exact commit SHA, tag plus SHA, or artifact digest. If it's ambiguous or missing (a branch name that may move, "latest", nothing given), stop and ask.
2. **Collect dispositions independently.** Dispatch these in parallel, in one message, each with a task contract naming the pinned candidate, environment and allowed actions:
   - `agent-org:quality-assurance-architect`: regression and release tests → `QA-###` findings and a release-readiness disposition.
   - `agent-org:technical-product-manager`: acceptance criteria against the candidate → `PROD-###` findings and ACCEPTED / NOT ACCEPTED / PENDING EVIDENCE.
   - `agent-org:information-security-architect`: open `SEC` findings and a release scan → `SEC-###` findings and disposition.

   Reuse existing evidence only if it is tied to **the same candidate**. Evidence for any other revision doesn't count.
3. **Produce the checklist:**
   - Each disposition (QA, Product, InfoSec): PASS / FAIL / BLOCKED / NOT RUN, with evidence (commands, results, revision).
   - Open findings by ID and severity.
   - **Human approvals still needed, named by role** (for example release owner, security risk owner, product owner). None are assumed.
   If an intent exists under `~/.claude/intents/<repo>/`, attach the checklist to it.
4. **It never deploys, tags, merges or publishes.** It stops at the checklist.

Never invent a test run, acceptance or approval. A disposition that wasn't produced is NOT RUN.
