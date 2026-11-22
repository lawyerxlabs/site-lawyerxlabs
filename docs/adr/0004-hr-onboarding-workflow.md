# ADR 0004: HR Onboarding Workflow

**Status:** Proposed
**Date:** 2026-10-25
**Decision owners:** Product owner with HR/counsel review
**Applies to:** HR Onboarding only; not Hire, Manage, Exit, or the frozen redaction API.

> **Implementation note (2026-11-02):** A frontend panel and backend catalog entry now exist. Future-tense implementation statements below are historical planning context; this ADR remains proposed and does not establish acceptance, deployment, provider approval or real-document readiness. See [the workflow record](../workflowadr/0009-onboarding.md) and [the onboarding contract](../hr-lab/ONBOARDING-V1-API-CONTRACT.md) for alignment questions.

## Context

HR consultants and business owners need help preparing onboarding material from documents they provide. The workflow must work only from documents uploaded for that run. The user may upload one or multiple files, including a job description and employer policies or procedures.

The workflow must not invent employer practices, obligations, deadlines, forms, owners, or compliance conclusions. Every output item must be traceable to an uploaded source or clearly labelled as unsourced and requiring confirmation. A job description is required for every run.

An LLM is approved for this workflow. The backend, not the client, selects a pinned model through an allowlisted environment variable. Provider and data-handling terms are tracked separately in GitHub issue #54 and are not decided by this ADR.

The existing staged HR session route is the closest product precedent. The Tool Parse workflow-plugin SDK is the closest document-processing precedent. The current runtime and deployment must be verified before implementation to confirm which boundary owns this workflow.

## Decision

Build Onboarding as a member-only, ephemeral, source-grounded HR workflow. It accepts one or multiple uploaded files per run and produces a reviewable onboarding sequence. It must use a dedicated versioned HR contract and must not extend or repurpose the frozen `/v1/jobs` redaction contract or the existing Hire contract.

Verification found that the existing `/hr/v1/sessions` route accepts pasted text or exactly one PDF (`src/api/server.js:205–235`). It cannot carry multi-file Onboarding input without changing the Hire contract, so Onboarding gets a dedicated versioned route family, `/onboard/v1`. Reusing `/hr/v1` was considered and rejected: it would make the Hire contract polymorphic and risk the stable Hire validation. Its lifecycle code may reuse `src/api/hr-session.js` (owner-bound, in-memory, 15-minute TTL, tombstones) without changing the Hire path.

Frontend: no separate page. The workflow is selected through the shared Playground, `/playground/?workflow=hr-onboarding`, like `hr-hiring`. The `/onboard/v1` routes are the public API boundary. The plugin SDK may be used internally for extraction or generation if that is the established Tool Parse boundary, but the public onboarding contract remains the authority.

Public route family, separate from `/hr/v1` (Hire), reusing its internal session machinery:

- `POST /onboard/v1/sessions` — create a session from one or more uploaded files.
- `POST /onboard/v1/sessions/:id/classifications` — submit the member's classification confirmation or corrections.
- `POST /onboard/v1/sessions/:id/generation` — generate the onboarding sequence from confirmed classifications.
- `DELETE /onboard/v1/sessions/:id` — discard the session.

The route family is `/onboard/v1`; request and response schemas still require contract review before implementation. Access is authenticated and member-only; guest access is not part of this ADR.

## Input contract

Each run accepts one or more uploaded files. The first contract must identify each file by a stable per-run source ID and preserve its filename only where displaying it is safe.

The intended inputs include:

- job description;
- employer policies;
- procedures, guides, or role documents supplied by the user.

The workflow does not fetch external policies, use an organisation-wide policy library, or rely on assumed Ontario requirements. A job description is required. The server rejects classification confirmation or generation for a run without a confirmed job-description source; session creation may still succeed so the member can correct classification.

The server validates file count, type, size, and aggregate limits. It must reject unknown structured fields and must not accept a client-supplied model ID, owner ID, or authorization decision.

## LLM boundary

The LLM may classify uploaded material, extract source-grounded facts, identify gaps, and draft checklist wording. It must receive only the permitted per-run material after the approved data-handling controls from issue #54 are satisfied.

No LLM integration exists in the HR path today; the only LLM use in the gateway is OCR through the egress proxy (`deploy/compose.yml:18–19`). The model is selected server-side from a pinned allowlist, for example an environment variable such as `HR_ONBOARDING_LLM_MODEL` (new; not yet present). The client cannot override it. The exact variable name, provider, model, and terms belong in the implementation contract and issue #54 resolution.

The LLM must not:

- introduce obligations or deadlines not supported by uploaded sources;
- infer an employer practice and present it as fact;
- assign an owner unless the source supports that assignment;
- claim compliance or completeness;
- provide legal advice or an employment decision.

Outputs must pass a schema and boundary validator. Invalid, incomplete, or ungrounded output fails closed or is emitted as an explicit limitation; it is never silently repaired with general knowledge.

## Output contract

The output is one reviewable onboarding sequence containing, at minimum:

- ordered tasks or checklist items;
- timing prompts only where supplied or clearly marked for confirmation;
- owners only where supplied, otherwise `Owner: Confirm`;
- dependencies where supported by source material;
- source references for source-backed items;
- explicit unsourced or missing-information warnings; unsourced items remain in the checklist marked `Confirm with employer` and are also listed in a `Missing information` section;
- limitations and a professional review disclaimer.

The output must distinguish:

- **source-backed:** supported by an uploaded document;
- **derived:** an organisation of source material that does not add a new fact;
- **unsourced:** a useful prompt requiring user confirmation.

No item may be labelled as an employer requirement unless an uploaded source supports that characterization.

## Provenance and privacy

Every source-backed item must carry a source ID and page or equivalent location when available. The system must not copy more sensitive source text than the output requires. Raw uploads, extracted text, prompts, model responses, and generated content must not appear in logs.

The UI must tell users that the workflow uses only files supplied for the current run and that missing policies or details may make the result incomplete.

## Authorization and lifecycle

- Member authentication is required for the workflow.
- The server derives the owner identity; the client never supplies it.
- Sessions are owner-bound. Missing, expired, and other-owner sessions return the same not-found response.
- Session state is ephemeral and held in bounded memory only. The TTL must be set in the implementation contract; it must not be implied by an undocumented product promise.
- `DELETE` removes the session. Expiry and process restart also remove it.
- Responses containing source-derived data use `Cache-Control: no-store`.

## Failure behaviour

- Unsupported file types return a typed client error.
- File or aggregate size limits return a typed client error.
- Missing required source material returns a limitation or validation error; it does not trigger invented content.
- LLM timeout, provider failure, schema failure, or grounding failure produces no partial onboarding artifact. The session may remain available for an explicit retry until expiry.
- Generation is not automatically retried.
- Errors and diagnostics contain status and safe identifiers only, never document values, prompts, model payloads, or secrets.

## Alternatives considered

### Reuse Hire's `/hr/v1` contract
Rejected. Hire is a separate compatibility contract for one source and one outcome. Adding multi-file onboarding inputs or changing its result shape risks the existing Hire flow.

### Reuse frozen `/v1/jobs`
Rejected. The frozen redaction API is one-file, read-once, and not an HR package contract. It must not be widened for Onboarding.

### Registered plugin only, with no HR session contract
Rejected as the public design. The plugin SDK may be an internal execution mechanism, but Onboarding needs member authorization, multi-file request handling, lifecycle, and a versioned result contract. Those responsibilities belong at the HR gateway boundary.

### One-shot request with no session
Deferred. A session supports bounded upload handling, explicit generation, retry, ownership, and deletion. A one-shot design can be reconsidered after the contract is proven.

## Rollout

1. Resolve issue #54 before sending real HR material to an LLM.
2. Verify the gateway route, session lifecycle, extraction limits, and deployment composition.
3. Add the versioned Onboarding contract and synthetic fixtures.
4. Implement behind an off-by-default server-side flag.
5. Enable for internal review by HR consultants and business owners.
6. Add the site catalogue and panel only after the gateway contract and acceptance tests pass.
7. Roll back by disabling the flag; no migration is required because the workflow is non-persistent.

## Recommended first implementation slice

The first slice should support:

- one or multiple files;
- all Tool Parse input formats: `.pdf`, `.docx`, `.txt` (verified in `src/jobs/workflows.js:18–30` and `src/jobs/orchestrator.js:182–264`);
- one fixed outcome: `onboarding_sequence`;
- source classification as an LLM suggestion, with the user able to correct it;
- source-backed and explicitly unsourced checklist items;
- no external policy lookup;
- no candidate or employee identity requirement;
- no persistent storage.

Before implementation, define the minimal structured fields, if any. Do not add fields merely because they may be useful later.

## Blocking follow-up decisions

1. Confirm the gateway owner and stable workflow ID/version.
2. Confirm route versus plugin ownership in the current Tool Parse runtime.
3. Obtain HR/counsel review of the no-invention and no-compliance-claim boundary.
4. Resolve GitHub issue #54: provider, model, retention, training use, region, and handling of personal data — before sending real material to an LLM.

## Consequences

**Positive:** Onboarding is grounded in supplied material, supports consultant and business-owner use, preserves authorization and deletion boundaries, and does not disturb existing Hire or redaction contracts.

**Negative:** Multi-file upload requires a new contract and likely new frontend submission handling. Source-grounded output will often contain gaps when policies or role details are missing. LLM classification and drafting add provider, cost, validation, and reproducibility concerns. The workflow cannot promise a complete onboarding program from incomplete uploads.
