---
name: security-audit
description: Standalone, scope-checked security audit that dispatches agent-org:information-security-architect for threat analysis, justified scans and retests, and never accepts risk.
argument-hint: <scope>
disable-model-invocation: true
---

# agent-org: security audit

Scope: $ARGUMENTS

You are the **main thread**. You confirm scope, dispatch the InfoSec architect and record results. This skill audits and validates; it doesn't fix. Remediation that changes code, config or infra goes through `agent-org:deliver` and an approved intent first.

1. **Authorization and scope first.** Establish and write down what's in scope, the repo and exact revision (or image digest), the environments, and which test techniques are allowed. **No live or production testing without explicit permission** from the user for that target. If any of this is unclear, stop and ask before dispatching.
2. **Dispatch `agent-org:information-security-architect`** with a task contract: the confirmed scope, target revision, allowed techniques, where test artifacts may be written, resource limits, stop conditions and cleanup. It does threat analysis first, then **only checks that a threat justifies**: static review, dependency, secret, configuration and container scanning, and bounded live tests only if authorized. Each check names the threat it addresses.
3. **Report `SEC-###` findings** with severity (CRITICAL/HIGH/MEDIUM/LOW), evidence, exploitability, impact, remediation and residual risk. Record what was **not** tested and why. After remediation, dispatch a **retest** against the fixed revision and record its result per finding.
4. **It never accepts risk.** Risk acceptance belongs to a named human and is recorded as theirs, with name, date and the finding IDs. If an intent exists under `~/.agent-org/intents/<repo>/`, attach the audit to it.

Never invent a scan, finding, retest or acceptance. A check that wasn't run is NOT RUN.
