# Workflow ADR 0006: Agreement analysis

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Frontend disabled; backend route and conditional capability exist. Not a release approval.

## Context and recorded direction

The intended public one-shot flow uses fixed pseudonymisation and a protected source excerpt; backend advertisement depends on feature enablement and model configuration.

## Decisions and alignment to resolve

Record guest verification, screening coverage, provider terms and retention, exact quote validation, failure handling and release evidence. Do not infer availability from a route or catalog entry alone.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab and Signal Lawyers list `agreement-review`, currently disabled in the frontend; backend advertisement is conditional.
- **Identity and authorization:** The intended public path needs guest authorization and verification confirmed before enablement.
- **Input, screening and confidentiality:** Fixed pseudonymisation and protected excerpts are intended; provider approval, detector coverage and the 0017/0018 conflicts remain open.
- **Lifecycle and deletion:** One-shot result retention and deletion require an explicit contract and reconciliation with 0017.
- **Integrity and human control:** Validate quotations against protected source and require professional review; a citation alone is not verification.
- **Reliability and release:** Confirm feature flag, model configuration, fail-closed errors and capacity before release.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../adr/0006-workflow-template.md](../adr/0006-workflow-template.md)
- [../../src/components/AgreementReview.tsx](../../src/components/AgreementReview.tsx)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
