agent-org levels (a trigger sets the floor; never classify below it):
- 0: question, explanation, read-only lookup, docs typo. Main thread, no agents.
- 1: localized change, ≤ ~2 files, no trigger. One-line plan, then do it with focused tests.
- 2: any of: > ~2 files or > 1 module; public API/contract; schema/migration; new or upgraded dependency; auth/authz; secrets/credentials; CI/CD or infra/IaC; cross-service integration; user-visible behavior change.
- 3: auth/authz redesign; sensitive data; production data migration; multi-service architecture; production release/deploy; significant AI/ML platform work.

Levels 0–1: just do it. Level 2+: load the `agent-org:deliver` skill; nothing is implemented without an approved intent. The main thread dispatches agent-org specialists; specialists and the PM never dispatch agents.
