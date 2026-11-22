# Workflow ADR 0011: Disciplinary File

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Roadmap only; not implemented.

## Context and recorded direction

Organize a disciplinary record for counsel review, potentially producing a chronology, missing-records list and policy references. Do not decide whether or what discipline is warranted.

## Decisions and alignment to resolve

After the Manage pilot, decide input authorization, prior-warning and policy handling, retention and termination escalation; counsel must review the boundary.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** Disciplinary File is an HR Lab roadmap card, not a registered workflow.
- **Identity and authorization:** User roles, ownership and guest eligibility remain open.
- **Input, screening and confidentiality:** Prior warnings and policy records are sensitive; authorized inputs, screening and provider rules remain open.
- **Lifecycle and deletion:** Storage, retention, deletion and failure handling remain open.
- **Integrity and human control:** Chronology and missing records aid counsel review; the system must not decide discipline.
- **Reliability and release:** Transport, error handling and validation evidence are open; counsel must review boundaries.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../hr-lab/MANAGE-SPEC.md](../hr-lab/MANAGE-SPEC.md)
- [../hr-lab/SHARED-WORKFLOW-CONTRACT.md](../hr-lab/SHARED-WORKFLOW-CONTRACT.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
