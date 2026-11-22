# Workflow ADR 0009: HR onboarding

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Frontend and backend catalog entries exist; ADR 0004 remains proposed. Deployment and provider approval are separate.

## Context and recorded direction

A member supplies up to five files including a job description, confirms classifications, and requests a source-grounded onboarding sequence through `/onboard/v1`.

## Decisions and alignment to resolve

Reconcile proposed ADR status with implementation and the authoritative API contract; establish effective handling, owner isolation, source provenance, session cleanup, model/provider terms and permitted release scope. Do not label generated tasks verified solely because citations exist.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab and HR Lab list `hr-onboarding`; backend binds protected `/onboard/v1/sessions`.
- **Identity and authorization:** Member session, owner isolation and gateway enforcement require verification.
- **Input, screening and confidentiality:** Up to five files including a job description; frontend requests Redact and checks effective mode. Provider and screening differences between 0017 and 0018 remain unresolved.
- **Lifecycle and deletion:** The [proposed onboarding contract](../hr-lab/ONBOARDING-V1-API-CONTRACT.md) specifies a fixed 15-minute TTL; [0017](0017-common-workflow-baseline.md#implementation-and-reconciliation) specifies intended 30-minute idle / 60-minute maximum member sessions. Resolve an exception or migration and verify actual expiry, source cleanup, cancellation and failure behavior.
- **Integrity and human control:** Users confirm classifications and review the generated sequence; citations do not verify obligations.
- **Reliability and release:** Check generation retries and uncertain outcomes, model failures, and preservation of the single-result contract.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../adr/0004-hr-onboarding-workflow.md](../adr/0004-hr-onboarding-workflow.md)
- [../hr-lab/ONBOARDING-V1-API-CONTRACT.md](../hr-lab/ONBOARDING-V1-API-CONTRACT.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
