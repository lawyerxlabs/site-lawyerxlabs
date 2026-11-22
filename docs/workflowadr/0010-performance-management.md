# Workflow ADR 0010: Performance Management

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Proposed pilot; no implementation or route is authorized.

## Context and recorded direction

The Manage pilot organizes a primary source and structured facts into selected review outputs; professional judgment remains with the user. ADR 0003 proposes a separate member session transport.

## Decisions and alignment to resolve

Resolve PDF versus DOCX scope, fact retention, source screening, expiry, Turnstile, artifact contract and counsel-approved escalation. The transport and its assumptions remain proposed.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** Performance Management is a proposed HR Lab pilot; no surface registration or production route is established.
- **Identity and authorization:** Membership, owner and organization isolation and guest eligibility remain open.
- **Input, screening and confidentiality:** Primary source and bounded facts are proposed; PDF/DOCX scope, screening and model/provider approval remain open.
- **Lifecycle and deletion:** Session, raw source, artifacts, expiry, deletion and failure cleanup remain open.
- **Integrity and human control:** Review-only outputs require professional judgment; counsel escalation boundaries remain open.
- **Reliability and release:** Transport, concurrency, retries, partial failures and release gates remain proposed.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../adr/0003-manage-pilot-transport.md](../adr/0003-manage-pilot-transport.md)
- [../hr-lab/MANAGE-SPEC.md](../hr-lab/MANAGE-SPEC.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
