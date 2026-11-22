# Workflow ADR 0007: Case analysis

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Contemplated; disabled placeholder, with no backend ID.

## Context and recorded direction

The catalog presents case analysis as forthcoming. Scope and implementation are not established.

## Decisions and alignment to resolve

Decide source types, user and access, permitted original-text exposure, evidence and output boundaries, retention, provider terms and evaluation before selecting a transport or enabling it.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab and Signal Lawyers list a disabled `case-analysis` placeholder with no backend ID.
- **Identity and authorization:** User, guest eligibility and server-side authorization are open.
- **Input, screening and confidentiality:** Source types, screening, source exposure and model/provider selection are open.
- **Lifecycle and deletion:** Storage, result access, expiry and deletion are open.
- **Integrity and human control:** Evidence contract, limits on legal conclusions and review requirements are open.
- **Reliability and release:** No route, operational limit, recovery behavior or release evidence is established.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../adr/0001-common-workflow-design.md](../adr/0001-common-workflow-design.md)
- [../../src/lib/workflows.ts](../../src/lib/workflows.ts)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
