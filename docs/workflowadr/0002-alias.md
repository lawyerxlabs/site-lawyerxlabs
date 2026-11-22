# Workflow ADR 0002: Alias / docalias

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Implemented; release and deployment require separate verification.

## Context and recorded direction

One PDF or DOCX is processed to replace detected personal information and produce a working copy and report. Public access and the job lifecycle are described in the frozen API contract.

## Decisions and alignment to resolve

Identity and human verification; limits of detection; exact output consumption, expiry and deletion by identity; handling of source pages and browser memory. Do not equate result consumption with proof of deletion from all storage.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** LawyerLab, Signal Lawyers and HR Lab list `docalias`; the backend catalog defines public file/sample intake.
- **Identity and authorization:** The frozen `/v1/jobs` contract documents Turnstile on upload and owner-only job status. A public catalog entry is not authorization proof.
- **Input, screening and confidentiality:** One PDF or DOCX; detected identifiers are replaced. The browser keeps a local source for preview; detection completeness is not established.
- **Lifecycle and deletion:** The current contract makes anonymous markdown and report read-once and purges after both reads; this differs from 0017 and requires migration.
- **Integrity and human control:** Working copy and report require human review; do not claim anonymisation.
- **Reliability and release:** Quota, atomic enforcement and failure cleanup against 0017 remain open.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../API-CONTRACT.md](../API-CONTRACT.md)
- [../../src/lib/workflows.ts](../../src/lib/workflows.ts)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
