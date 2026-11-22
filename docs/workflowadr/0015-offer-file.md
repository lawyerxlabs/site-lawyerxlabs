# Workflow ADR 0015: Prepare Offer File

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Roadmap only; relationship to Hiring v2 requires a product decision.

## Context and recorded direction

The roadmap describes an offer-file checklist, not candidate ranking or offer drafting. Hiring v2 separately proposes a browser-local offer draft.

## Decisions and alignment to resolve

Decide whether this is a distinct workflow or superseded; do not transfer candidate details or selected pay to a server on the strength of either roadmap card. If distinct, decide identity, processing and retention with privacy and counsel review.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** Prepare Offer File is an HR Lab roadmap card; no registration is established. Its relationship to Hiring v2 remains undecided.
- **Identity and authorization:** Roles, owner isolation and guest eligibility remain open if this is a distinct workflow.
- **Input, screening and confidentiality:** Candidate and compensation data require an explicit processing boundary; do not infer server authorization from this card.
- **Lifecycle and deletion:** Retention, deletion and browser-local versus server storage remain open.
- **Integrity and human control:** The card describes a checklist, not ranking or a final offer; professional approval is required.
- **Reliability and release:** Transport, failure handling and privacy/counsel review remain open.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../hr-lab/HIRE-SPEC.md](../hr-lab/HIRE-SPEC.md)
- [0001-hiring-v2-intake-and-handoff.md](0001-hiring-v2-intake-and-handoff.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
