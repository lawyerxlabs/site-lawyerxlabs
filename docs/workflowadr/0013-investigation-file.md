# Workflow ADR 0013: Investigation File

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Roadmap only; not implemented.

## Context and recorded direction

Organize investigation steps, dates, interviews and documents for professional review; do not make credibility findings or decide the complaint.

## Decisions and alignment to resolve

Resolve who owns and can access investigator records and interview notes, retention, escalation of harassment or reprisal, and process-fairness review.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** Investigation File is an HR Lab roadmap card, not a registered workflow.
- **Identity and authorization:** Access to investigator records and interview notes, ownership and guest eligibility remain open.
- **Input, screening and confidentiality:** Source permissions, screening and provider boundaries remain open.
- **Lifecycle and deletion:** Storage, retention, deletion and failure handling remain open.
- **Integrity and human control:** Do not make credibility findings or decide complaints; process-fairness and reprisal escalation require review.
- **Reliability and release:** Transport, partial failures, auditability and release evidence remain open.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../hr-lab/MANAGE-SPEC.md](../hr-lab/MANAGE-SPEC.md)
- [../hr-lab/SHARED-WORKFLOW-CONTRACT.md](../hr-lab/SHARED-WORKFLOW-CONTRACT.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
