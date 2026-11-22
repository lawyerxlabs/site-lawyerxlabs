# Workflow ADR 0008: Structured job-description review / hr-hiring

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Implemented staged workflow; deployment and real-document eligibility require separate verification.

## Context and recorded direction

A member submits one PDF or pasted description, reviews criteria, and generates an improved description in a live session. The staged contract, not the read-once job contract, governs the workflow.

## Decisions and alignment to resolve

Reconcile effective handling choices and `off` configuration with the backend; record generation retry/idempotency, source and session retention, ownership, and migration to Hiring v2 without breaking the legacy route.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab and HR Lab list `hr-hiring`; backend binds protected `/hr/v1/sessions`.
- **Identity and authorization:** Member session and ownership isolation are required; preserve the legacy route during any Hiring v2 migration.
- **Input, screening and confidentiality:** One PDF or pasted text. Existing selectable handling including `off` must be reconciled with 0017 before treating the new policy as enforced.
- **Lifecycle and deletion:** Verify session expiry, deletion, browser memory and failure cleanup; current contract remains authoritative until migrated.
- **Integrity and human control:** The user reviews criteria before generating a description; source labels do not establish correctness.
- **Reliability and release:** Check generation idempotency, uncertain outcomes and retry boundaries against the staged contract.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../hr-lab/STAGED-HR-API-CONTRACT.md](../hr-lab/STAGED-HR-API-CONTRACT.md)
- [../../src/pages/HrHiring.tsx](../../src/pages/HrHiring.tsx)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
