# Workflow ADR 0014: Dismissal File / Exit pilot

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Proposed specification; not implemented.

## Context and recorded direction

A professional would submit one primary PDF or DOCX and bounded facts, choose review artifacts and review the resulting package. No dismissal recommendation, legal conclusion or send-ready communication is authorized.

## Decisions and alignment to resolve

Decide identity, source and artifact contracts, partial failures, retention and subprocessors, and require counsel/privacy approval and measured evaluation before real matters.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** Dismissal File / Exit pilot is proposed for HR Lab and is not a registered workflow. The post-dismissal implementation plan is its staged delivery plan, not an additional workflow.
- **Identity and authorization:** Authorized professional roles, owner isolation and guest eligibility remain open.
- **Input, screening and confidentiality:** One primary PDF or DOCX and bounded facts are proposed; screening and subprocessors require approval.
- **Lifecycle and deletion:** Result and source retention, partial-package behavior, deletion and failure cleanup remain open.
- **Integrity and human control:** Artifacts are for professional review only; no dismissal recommendation, entitlement calculation or send-ready advice.
- **Reliability and release:** Counsel/privacy review, synthetic end-to-end checks, measured evaluation and rollback are release gates.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../hr-lab/EXIT-SPEC.md](../hr-lab/EXIT-SPEC.md)
- [../hr-lab/SHARED-WORKFLOW-CONTRACT.md](../hr-lab/SHARED-WORKFLOW-CONTRACT.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
