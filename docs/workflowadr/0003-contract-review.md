# Workflow ADR 0003: Contract review

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Implemented in the frontend registry and backend catalog; deployment requires separate verification.

## Context and recorded direction

A protected PDF/DOCX job uses fixed pseudonymisation and returns a constrained artifact for professional review. Original values are not restored by the surface.

## Decisions and alignment to resolve

Confirm server-enforced membership and ownership, artifact provenance, model/provider boundaries, temporary storage and expiry. A grounded quote does not establish legal correctness.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab and Signal Lawyers list `contract-review`; backend catalog binds a protected pipeline job.
- **Identity and authorization:** Member access and ownership must be enforced server-side; verify cross-owner isolation.
- **Input, screening and confidentiality:** PDF/DOCX, fixed pseudonymisation and no restoration are the intended contract; detector coverage and model/provider boundary require evidence.
- **Lifecycle and deletion:** Job result is read-once under the current artifact lifecycle; reconcile expiry and deletion with 0017.
- **Integrity and human control:** A constrained summary and grounded quote support professional review, not legal conclusions.
- **Reliability and release:** Preserve artifact validation and no automatic reread; verify failure cleanup, quota and cancellation.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../adr/0005-workflow-catalog-surface-intake.md](../adr/0005-workflow-catalog-surface-intake.md)
- [../../src/components/ContractReviewPanel.tsx](../../src/components/ContractReviewPanel.tsx)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
