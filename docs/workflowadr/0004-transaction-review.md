# Workflow ADR 0004: Transaction review

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Implemented session workflow; deployment requires separate verification.

## Context and recorded direction

Frontend `transaction-review` maps to backend capability `transaction-session-intake`, which binds `/tx/v1/sessions`. A member supplies a PDF or pasted text and reviews extracted parties and terms.

## Decisions and alignment to resolve

Specify permitted handling choices, owner isolation, source exposure, session deletion and expiry, and the effect of local edits. Do not confuse this with term isolation or the catalog-only backend `transaction-review` entry.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab and Signal Lawyers list `transaction-review`; it maps to backend `transaction-session-intake`, not the unbound catalog entry `transaction-review`.
- **Identity and authorization:** Protected session route `/tx/v1/sessions`; verify owner isolation and authorization at the gateway and backend.
- **Input, screening and confidentiality:** One PDF or pasted text. Effective handling and raw versus screened exposure must be verified against the session contract.
- **Lifecycle and deletion:** Session expiry, explicit deletion, failure cleanup and 0017 alignment remain open.
- **Integrity and human control:** Review extracted parties and terms with their source references; local edits are not proof of legal correctness.
- **Reliability and release:** Confirm handling is submitted unchanged, retry/idempotency and uncertain outcomes; do not automatically reread a one-time result.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../DEPLOYMENT-PROFILES.md](../DEPLOYMENT-PROFILES.md)
- [../../src/pages/TransactionReview.tsx](../../src/pages/TransactionReview.tsx)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
