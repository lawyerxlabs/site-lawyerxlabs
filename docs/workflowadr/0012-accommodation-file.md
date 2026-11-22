# Workflow ADR 0012: Accommodation File

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Roadmap only; not implemented.

## Context and recorded direction

Organize accommodation request records for professional review, without deciding whether accommodation is required or reasonable. Health information is excluded from structured facts.

## Decisions and alignment to resolve

Resolve how sensitive health information already present in source documents is detected and handled before display or external processing, plus access, retention and counsel/privacy review.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** Accommodation File is an HR Lab roadmap card, not a registered workflow.
- **Identity and authorization:** User roles, owner isolation and guest eligibility remain open.
- **Input, screening and confidentiality:** Health information is excluded from structured facts; treatment of health information already in source documents remains open and is a release blocker.
- **Lifecycle and deletion:** Storage, retention, deletion and failure handling remain open.
- **Integrity and human control:** Do not decide whether an accommodation is required or reasonable.
- **Reliability and release:** Transport, safe errors, privacy review and detector evaluation remain open.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../hr-lab/MANAGE-SPEC.md](../hr-lab/MANAGE-SPEC.md)
- [../hr-lab/SHARED-WORKFLOW-CONTRACT.md](../hr-lab/SHARED-WORKFLOW-CONTRACT.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
