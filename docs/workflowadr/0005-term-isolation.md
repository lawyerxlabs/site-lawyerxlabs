# Workflow ADR 0005: Term isolation

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Implemented frontend and raw route; release readiness requires independent verification.

## Context and recorded direction

The protected presentation-only workflow has no backend catalog ID and uses a dedicated raw route; it extracts OREA Form 100 terms for review.

## Decisions and alignment to resolve

Document the raw-data trust boundary, server authorization, temporary artifact lifecycle, supported document checks and one-time result behavior. This exception does not authorize copying the hidden raw lane for new workflows.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab and Signal Lawyers list `term-isolation`; it is presentation-only and uses `/v1/raw/term-isolation`, not a catalog binding.
- **Identity and authorization:** The raw route is protected; verify backend and gateway authorization and owner boundaries.
- **Input, screening and confidentiality:** One PDF or DOCX; OREA Form 100 is the supported template. This raw lane crosses the 0017 screening boundary and requires explicit reconciliation.
- **Lifecycle and deletion:** The frontend calls the output one-time; verify server storage, deletion and 0017 compatibility.
- **Integrity and human control:** Extracted fields and evidence must be checked against the source; no legal conclusion is implied.
- **Reliability and release:** Verify input/template rejection, failure recovery and absence of unintended durable reads.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../adding-wired-workflow-to-surface.md](../adding-wired-workflow-to-surface.md)
- [../../src/components/TermIsolation.tsx](../../src/components/TermIsolation.tsx)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
