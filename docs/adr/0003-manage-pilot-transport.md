# ADR 0003: Transport for the Manage Performance Management pilot

**Status:** Proposed. Not accepted.
**Date:** 2026-10-25
**Applies to:** the first Manage pilot (Performance Management) in the Human Resources Lab. Does not apply to Hire `hr-hiring`, Exit, or the frozen redaction API.
**Verification status:** Drafted from the handoff, ADR 0001, `MANAGE-SPEC.md`, `EXIT-SPEC.md`, `SHARED-WORKFLOW-CONTRACT.md`, and `STAGED-HR-API-CONTRACT.md`. The tool-parse SDK and session code (`src/api/hr-session.js`, `server.js`) were not inspected. Facts about them must be verified before acceptance.

## Context

- **Repo fact.** `POST /v1/jobs` accepts one file and an optional `workflow` string. It is frozen (`API-CONTRACT.md`, `mvp-2026-10-19`). Results are read-once and purged. `upload()` in `src/lib/api.ts` cannot send structured facts or output selections (MANAGE-SPEC §3.2, §9.1).
- **Repo fact.** The staged `/hr/v1` route is hiring-only. Its bodies carry no version field, and it allows exactly one source and one outcome, `improved_job_description`. Sessions live in bounded memory with no persistence. Ownership is enforced; other owners receive `404`. Only authenticated members are admitted; there is no anonymous or Turnstile path. Tool Parse session ownership derives from gateway member identity. `TOOL_PARSE_HR_REQUIRE_MEMBER=1` is the deployed setting that enforces member-only access (STAGED §2–4).
- **Repo fact.** ADR 0001 says a new workflow must not require changes to `WorkflowShell`, `useWorkflowJob`, or `WorkflowPage`. If it does, that change needs its own commit or ADR.
- **Requirement.** Manage needs one primary source, typed facts, and one or more selected outputs. It returns one review package with a required header, limitations, and provenance (SHARED §3–5, MANAGE §9.3).
- **Gap.** No Manage transport exists. MANAGE-SPEC lists the transport decision as a blocker.

## Decision (proposed)

Give Manage its own versioned, session-based HR route family. It reuses the staged-session lifecycle pattern and the authorization model. It does not touch `/hr/v1`, `/v1/jobs`, `/v2/hr/packages`, `WorkflowShell`, or `useWorkflowJob`.

Namespace (placeholder): `/hr/manage/v1/sessions`

- `POST /hr/manage/v1/sessions`: create an ephemeral session from one PDF. First slice accepts multipart only.
- `POST /hr/manage/v1/sessions/{id}/generation`: JSON body with `facts` and a non-empty `outputs` array. Returns one package.
- `DELETE /hr/manage/v1/sessions/{id}`: discard. Idempotent for the owner.

The response is one Markdown package, rendered once. Its artifact `type` and `schema_version` are set by the Manage contract, not by ADR 0001's job-artifact path.

## Scope

**In scope:** transport, session lifecycle, auth boundary, retention, failure behaviour, rollout, first slice.

**Out of scope:** package schema, facts schema, card wording, processing method (deterministic or LLM), identifiable versus aliased processing, DOCX, and persistence. Each is a prerequisite below.

## Alternatives considered

**A. Reuse `/v1/jobs` with `workflow=manage-…` and a plugin.**
Rejected for the first slice. The frozen contract accepts one file and no facts. Extending it breaks the freeze. Adding a facts field to `upload()` also touches shared chrome and hooks that ADR 0001 forbids changing for a single workflow.
Strength: existing purge and read-once semantics. Fallback if the owner requires job-style retention.

**B. One-shot `POST` that returns the package.**
Rejected for the pilot. It removes the preview and checkpoint step that the staged model uses for professional review, and it makes retry and error handling harder to reason about. Reconsider once the facts schema is stable.

**C. Extend `/hr/v1` with a `category` field.**
Rejected. The staged contract is a compatibility contract with no version field and fixes one source and one outcome. Changing it would risk the Hire pilot.

## Input and data handling

- Source: one PDF, at most 10 MiB, within existing page and worker limits. Compute SHA-256 over the exact bytes before extraction. Do not persist the upload.
- Pasted text and DOCX are excluded from the first slice. DOCX is in MANAGE §5 but unresolved.
- `facts` is a typed object with a server-side allowlist. Unknown keys are rejected. The matter label must not be a person's name; the server cannot reliably enforce this, so it needs a documented rule and a limited check. Recorded as a risk.
- `outputs` must be a non-empty subset of the four card keys in MANAGE §9.3. Unknown keys are rejected.
- Do not log raw source, extracted text, facts, or generated content. Responses carrying source-derived data set `Cache-Control: no-store` and `Pragma: no-cache`.

## Artifact contract boundary

- The gateway owns the package schema. The site repo owns rendering.
- The package carries `type` and `schema_version`, as the shared contract requires. The Manage contract is a new versioned document. It does not edit `STAGED-HR-API-CONTRACT.md` or `API-CONTRACT.md`.
- The package must include the header, limitations, provenance, and review warning from SHARED §5. Missing items appear as limitations, never filled in.

## Auth

- Member authentication required on every route. The server derives owner identity; the client never supplies it.
- Session IDs are random routing IDs, not bearer tokens. Each is bound to its owner. Missing, expired, and other-owner sessions all return `404`.
- Turnstile remains required at the gateway (MANAGE §3.2). Whether it applies to a member route is unresolved; recorded as an assumption.
- Authorization is server-side only. Surface and catalogue settings are presentation only (BRANDED-INSTANCE-SOP §0).

## Retention and deletion

- **Persistence:** none. Session state lives only in bounded, short-lived memory (STAGED contract; MANAGE §1.4).
- **TTL:** server-defined and short. Value is an open decision. Until set, implementation uses a configurable constant, not a product promise.
- **Deletion:** `DELETE` discards the session. Expiry also discards it. UI must tell the user results are not stored after the page is closed.
- **Logs:** no content in logs, errors, or metrics.
- **Open:** whether the pilot needs a retention period at all. MANAGE §1.4 promises none; owner decision required.

## Failure behaviour

- Errors use `{ "error": { "code", "message" } }`. Clients handle 401, 403, 404, 409, 413, 415, 429.
- Proposed new codes: `422 facts_invalid`, `409 no_outputs`. Gateway owns them.
- Oversize file returns `413`. Non-PDF returns `415`.
- Extraction failure returns a limitation or an error. Never partial or invented content. The UI fails closed with one message and never renders partial output.
- Generation is not retried automatically. On failure the session stays alive until TTL or `DELETE`, so the user can retry.
- Repeated generation on the same session: open. First slice allows it and returns the same result shape.

## Rollout

1. Build behind a server-side flag, off by default. Flag names are placeholders.
2. Test with synthetic fixtures only. No real client documents (AGENTS.md guardrail).
3. Enable on the HR surface for internal review only. Run the acceptance checks in MANAGE §10.1.
4. Widen access only after the owner accepts the pilot.
5. Rollback: turn the flag off and remove the route. Nothing is persisted, so no data migration.

## Consequences

**Positive**
- Manage avoids touching the frozen API, the hiring route, and shared frontend hooks.
- Nothing persisted, so deletion and rollback are simple.
- Lifecycle code can follow the staged session pattern.

**Negative**
- Two session families on the gateway: more surface to maintain.
- In-memory design means sessions are lost on restart; users restart the flow.
- The shared upload path still cannot send facts, so the Manage UI needs its own submission code, duplicating some of `api.ts`.

## Prerequisites (blocking; not resolved here)

1. Gateway owner and Manage workflow identifier (MANAGE §9.1 placeholder).
2. Approved facts schema, from MANAGE §9.3, plus the privacy review it requires.
3. Processing design: identifiable or aliased material, provenance, and deletion rules (MANAGE §3.5).
4. Deterministic or LLM processing. STAGED requires deterministic output; Manage has not decided.
5. Retention and TTL values, and whether a retention period is needed.
6. Member-only or guest access for Manage, and whether Turnstile applies on that route.
7. Output card wording. The four cards are not in this repo (MANAGE §1.1). The "Second Brain" premise is also absent. Both are brief inputs, not verified facts.
8. DOCX in or out of the first slice.
9. Package schema and its `type` and `schema_version`.

## Follow-up decisions

- Whether Manage needs a preview step before generation, like the staged flow.
- Whether `hr-hiring` and Manage later share one session family. Keep separate until a second pilot shows need.
- Whether to move to job-style retention if the owner requires an audit trail (reopens Alternative A).

## Recommended first implementation slice

One route, one output, one PDF, no DOCX:

1. `POST /hr/manage/v1/sessions` (PDF multipart only): validate, extract, return `source`, `limitations`, `limits` (no extracted text). Store session in bounded memory with owner binding and TTL.
2. `POST /hr/manage/v1/sessions/{id}/generation` with `outputs: ["chronology"]` only and a validated `facts` object containing the minimum fields the owner approves. Return one Markdown package with header, limitations, provenance.
3. `DELETE /hr/manage/v1/sessions/{id}`.
4. Behind an off-by-default flag. Synthetic fixtures only. Tests cover: size and type rejection, unknown facts keys, owner isolation (`404`), TTL expiry, no content in logs, `Cache-Control: no-store`.

Stops before the other three outputs, DOCX, LLM processing, and any persistence.

## Assumptions to confirm

- The tool-parse repo at `/mnt/docker-ssd/romeshh/sites/tool-parse` matches what the handoff describes. Not verified.
- Manage will be member-gated like `hr-hiring`. The specs do not say this.
- Session code in `hr-session.js` can be reused without changes to the hiring path.
- Next ADR number is 0003.
