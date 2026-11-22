# Onboarding API contract — v1

**Status:** Proposed contract; conservative defaults selected, not implemented or approved for deployment. This document translates [ADR 0004](../adr/0004-hr-onboarding-workflow.md) into an API shape. ADR 0004 is authoritative if this proposal conflicts with it. Values marked **OPEN** require verification or approval before implementation.

**Implementation:** Frontend and backend catalog entries exist, but coverage of this proposed contract is not verified; see [workflow record 0009](../workflowadr/0009-onboarding.md). Deployment and provider approval are separate.
**Last verified:** Contract coverage against the current backend has not been verified here.
**Review triggers:** Changes to onboarding routes, authentication, screening, session lifecycle, provider approval or the intended shared baseline.

> **Policy reconciliation:** The proposed fixed 15-minute session TTL below differs from the intended 30-minute idle and 60-minute maximum member limits in [workflow record 0017](../workflowadr/0017-common-workflow-baseline.md#implementation-and-reconciliation). An exception or migration remains to be decided; actual session behavior requires verification.

## 1. Scope and invariants

Onboarding prepares one reviewable onboarding sequence from one or more files uploaded for a single run. Every run must include a job description. The user reviews file classifications, confirms or corrects them, then explicitly requests generation.

- Member-authenticated only. The server derives the member identity from authentication; no client-supplied owner ID or access decision.
- Dedicated `/onboard/v1` route family. Do not change or alias Hire `/hr/v1` or frozen redaction routes.
- Accepted file formats: `.pdf`, `.docx`, `.txt`. The Tool Parse extraction pipeline supports these (`src/jobs/orchestrator.js:185–189`), but no existing HR route accepts all three; the HR route accepts PDF only (`src/api/server.js:223–231`). Server-side content/type validation is still required; filename extension alone is insufficient.
- LLM may classify, extract, identify gaps and draft. Output must be grounded only in uploaded source material. No external lookup, general-knowledge completion, persistence, or model selection by client.
- Output is advisory preparation material, not legal advice, a compliance determination, employment decision, or guarantee of completeness.
- Session is ephemeral, in-memory, bound to its authenticated owner, initially 15 minutes TTL to match existing `hr-session`; responses are `Cache-Control: no-store`.

## 2. Lifecycle and routes

All routes require member authentication. HTTPS is required in deployed environments. JSON is used except `POST /onboard/v1/sessions`, which is multipart/form-data.

| Method and path | Purpose |
|---|---|
| `POST /onboard/v1/sessions` | Upload one or more source files, create session and return classification review. |
| `POST /onboard/v1/sessions/{session_id}/classifications` | Submit the user's classification confirmation/corrections. |
| `POST /onboard/v1/sessions/{session_id}/generation` | Generate the onboarding sequence from confirmed classifications. |
| `DELETE /onboard/v1/sessions/{session_id}` | Discard the session; returns `404 session_not_found` on a repeat call (not idempotent). |

Lifecycle: upload → classification/review response → user confirms classifications → generation. Generation before confirmation returns `409 classifications_not_confirmed`. Classification confirmation may be submitted repeatedly before generation; each submission replaces the full previous set and is fully validated. Submission after a successful generation returns `409 already_generated`. A successful generation does not extend the fixed session expiry.

Concurrency: while a generation is in flight, a second generation request and any classification submission return `409 session_state_conflict`. The in-flight state is internal to the gateway and is never a public `status` value. A classification submission whose body read overlaps a completed generation returns `409 already_generated`.

Session IDs are opaque, unguessable identifiers. Every read/write is owner-scoped. Unknown, expired, deleted, or non-owned session IDs return the same `404 session_not_found` to avoid disclosure. A repeated `DELETE` also returns `404 session_not_found`, as the gateway keeps no tombstone. Clients must treat that 404 as a successful discard.

## 3. Create session

### Request

`POST /onboard/v1/sessions` with `Content-Type: multipart/form-data`.

- Repeated `files` parts: one or more files, each with a filename and bytes.
- Limits (safest defaults, reusing existing Tool Parse caps; pending approval):
  - `MAX_FILES` = 5
  - `MAX_FILE_BYTES` = 10 MiB (`TOOL_PARSE_FREE_MAX_BYTES` default)
  - `MAX_TOTAL_BYTES` = 10 MiB, keeping multipart requests within the existing free-upload boundary plus small multipart overhead
  - Each file is also subject to the existing parser page limit (20 pages by default) and the DOCX uncompressed limit (100 MiB by default).
  - Requests exceeding any limit return `413 upload_too_large` or `422 too_many_files`.
- Reject empty files, unsupported formats, malformed multipart input, invalid file content, duplicate/unsafe file metadata as needed, unknown multipart fields, and excess limits. Do not trust client MIME type.

### Response — `201 Created`

```json
{
  "session_id": "opaque-id",
  "expires_at": "2026-10-25T12:15:00Z",
  "status": "awaiting_classification_confirmation",
  "sources": [
    {"source_id":"src_1", "filename":"role.pdf", "media_type":"application/pdf"}
  ],
  "classification_review": {
    "classifications": [
      {"source_id":"src_1", "document_type":"job_description", "confidence":"high", "alternatives":[]}
    ],
    "job_description_source_ids": ["src_1"]
  }
}
```

`document_type` is a closed enum: `job_description`, `policy`, `procedure`, `role_document`, `other`, `unclassified`. Unknown values are rejected with `422 invalid_classification`. `confidence` is a closed enum: `high`, `medium`, `low`. Classification is machine-suggested, not yet confirmed. Filenames are untrusted display data; clients must render safely. Do not return extracted document text in this response.

If no source is classified as a job description, still return the review so the member can correct classification; classification confirmation without at least one job description fails `422 job_description_required`.

## 4. Confirm classifications

### Request

`POST /onboard/v1/sessions/{session_id}/classifications`

```json
{
  "classifications": [
    {"source_id":"src_1", "document_type":"job_description"},
    {"source_id":"src_2", "document_type":"policy"}
  ]
}
```

The request must include every source exactly once, with no unknown IDs or extra fields. The server validates the enum and requires at least one `job_description`. Client may change suggested classifications; it cannot alter source bytes, ownership, parser output, or model settings.

### Response — `200 OK`

```json
{
  "session_id":"opaque-id",
  "status":"ready_for_generation",
  "confirmed_classifications":[
    {"source_id":"src_1", "document_type":"job_description"},
    {"source_id":"src_2", "document_type":"policy"}
  ],
  "expires_at":"2026-10-25T12:15:00Z"
}
```

## 5. Generate

### Request

`POST /onboard/v1/sessions/{session_id}/generation`

```json
{}
```

The request body must be exactly `{}`; any other field returns `400 invalid_request`. No prompt, model, owner, external URL, or arbitrary source text is accepted. There is no idempotency key. A session generates at most one artifact: a second generation request returns `409 already_generated`, so conflicting outputs cannot occur. A failed generation (see failure behaviour) leaves the session in `ready_for_generation` for an explicit retry.

Generation implementation requirements (not observable beyond the responses above):

1. The gateway marks the session in flight synchronously, before the first `await` after validation, and clears the mark in a `finally`. A concurrent generation request receives `409 session_state_conflict`, so two requests cannot both call the model.
2. Generation snapshots the confirmed classifications and screened source facts at start. A classification submission during generation is rejected, so the snapshot cannot diverge from what the artifact reports.
3. Every `await` that follows a body read (classification and generation) re-checks that the session still exists, is owner-scoped, and is not `generated`, and acts on the re-looked-up session.
4. Before storing the artifact, the gateway re-checks the session. If it expired or was deleted during generation, the result is discarded and the response is `404 session_not_found`. No artifact outlives its session.
5. Tests use a gated fake generator to cover: concurrent generation, classification during generation, expiry during generation, and delete during generation.

### Personal-data screening and provenance

At intake, before creating a session, the gateway screens each extracted source with the onboarding PII profile. Screening failure or a rejected identifier rejects the upload without creating a session. For the default `redact` handling, only screened facts and their original character locations are retained. With explicitly enabled `off` handling, the selected facts can retain original values; detected prohibited identifiers are still rejected.

Provenance identifies the source and its original UTF-16 character range, but its quote is the screened fact value and can contain entity labels. A cited ID must exist, but a valid citation does not prove that a generated task is supported. Every generated task therefore requires employer confirmation. A missing or unknown fact ID rejects the entire artifact. Screening cannot detect every sensitive value; model-generated text still requires review.

### Response — `200 OK`

```json
{
  "session_id":"opaque-id",
  "status":"generated",
  "artifact": {
    "schema_version":"onboard.v1",
    "title":"Onboarding sequence",
    "items":[
      {
        "id":"item_1",
        "position":1,
        "task":"Review the workplace safety policy with the new employee.",
        "timing":null,
        "owner":"Owner: Confirm",
        "dependencies":[],
        "confirmation_required":true,
        "confirmation_label":"Confirm with employer",
        "provenance":[
          {"source_id":"src_2", "location":{"char_start":120, "char_end":171}, "quote":"Employees must review the workplace safety policy."}
        ]
      },
      {
        "id":"item_2",
        "position":2,
        "task":"Confirm which forms the employee must complete.",
        "timing":null,
        "owner":"Owner: Confirm",
        "dependencies":[],
        "confirmation_required":true,
        "confirmation_label":"Confirm with employer",
        "provenance":[{"source_id":"src_1", "location":{"char_start":0, "char_end":15}, "quote":"Employee forms."}]
      }
    ],
    "missing_information":[
      {"item_id":"item_1", "detail":"Confirm this task with the employer.", "confirmation_label":"Confirm with employer"},
      {"item_id":"item_2", "detail":"The uploaded sources do not identify required employee forms.", "confirmation_label":"Confirm with employer"}
    ],
    "limitations":["Review and confirm this sequence with the employer before use."],
    "notice":"AI-assisted draft. This checklist was generated using AI and the materials provided. This material may contain errors or omissions. Review with your professional advisors before use."
  }
}
```

Output schema requirements:

- `items` are ordered; `position` values are exactly `1..n`, unique and contiguous.
- Every item cites at least one valid source fact, with original UTF-16 character locations and screened quotes. A valid citation alone does not establish that a task is supported.
- Every item sets `confirmation_required: true`, carries `Confirm with employer`, and appears in `missing_information`. An item without a valid citation causes generation to fail without a partial artifact.
- If owner is not supported by source, emit exactly `Owner: Confirm`. Do not infer a person or role.
- Timing and dependencies are populated only when they exactly match cited facts of the corresponding kind. Every generated task still needs employer confirmation.
- `notice` is the only AI-assisted notice required on the user-facing surface, a root-level field with the exact approved wording above (owner-approved, issue #54, 2026-10-25). Do not expose exact model name/provider in this API response.
- Model identifier, provider details and operational metadata remain server-side and must not enter this public response.

## 6. Validation and errors

Error envelope (**PROPOSED**):

```json
{"error":{"code":"job_description_required","message":"Upload and classify at least one job description."}}
```

Do not include extracted source content, secrets, stack traces, model prompts or provider responses in errors. Suggested status/code mapping:

| HTTP | Code | Condition |
|---|---|---|
| `400` | `invalid_request` | Malformed JSON/multipart, unknown fields, invalid field types. |
| `403` | `forbidden` | Missing, invalid, or non-member authentication. The gateway's shared HR member gate does not distinguish these cases, so there is no `401`. |
| `404` | `session_not_found` | Unknown, expired, deleted, or not owned session. |
| `409` | `classifications_not_confirmed` | Generation attempted before confirmation. |
| `409` | `session_state_conflict` | Operation incompatible with current lifecycle state, including a generation already in flight. |
| `413` | `file_limit_exceeded` | File or aggregate limits exceeded. |
| `415` | `unsupported_file_type` | Not a supported PDF, DOCX, or TXT file. |
| `422` | `invalid_file` | Empty, corrupt, no extractable text, extracted text over 500,000 UTF-16 code units, or format/content mismatch. |
| `422` | `too_many_files` | More than 5 files. |
| `422` | `too_many_pages` | A document exceeds the page limit. |
| `422` | `docx_too_large` | A DOCX exceeds the uncompressed size limit. |
| `422` | `job_description_required` | Confirmation has no job-description classification. |
| `422` | `invalid_classifications` | Missing/duplicate/unknown source IDs or invalid enum. |
| `422` | `pii_detected` | Intake rejected detected personal data; no session is created and no model call is made. |
| `429` | `session_limit_reached` | Too many active or recently discarded sessions; `Retry-After: 900`. |
| `429` | `queue_full` | Document processing capacity is full; `Retry-After: 10`. |
| `500` | `internal_error` | Unexpected server failure. |
| `502` | `extraction_failed` | Document extraction failed. |
| `502` | `processing_failed` | Generation provider failed, or its output failed schema or grounding validation; no partial artifact returned. The session stays `ready_for_generation`. |
| `503` | `llm_not_configured` | Generation is not configured (`TOOL_PARSE_ONBOARD_MODEL` empty). Stays this way until #54 is resolved. |
| `503` | `processing_unavailable` | Personal-data screening is unavailable at intake; no session is created and no model call is made. |
| `504` | `timeout` | Document processing timed out. |

All responses, including errors, use `Cache-Control: no-store`. Validate authenticated ownership before operating on session state. Enforce request limits before buffering entire uploads where platform permits. Do not persist source files, extracted text, classifications or outputs beyond the in-memory session lifecycle; operational logs must not contain document contents. **OPEN:** logging/metrics fields and provider retention controls must be reviewed against ADR issue #54 before enabling LLM processing.

## 7. Proposed/open implementation values

The following are not settled by ADR 0004 and must be verified before shipping: numeric upload limits; exact classification enum and confidence behavior; provenance location granularity and quote size; exact AI-assisted notice; rate limits; idempotency/retry behavior; whether classification changes can be resubmitted; error envelope compatibility with the host API; session ID format; content-disposition/name handling; precise session expiry semantics; and provider/data-handling approval under issue #54. Keep model selection server-side and pinned/allowlisted regardless of these open values.

## 8. Acceptance criteria

1. Unauthenticated and non-member callers cannot create or operate on sessions; client-supplied owner/model fields are rejected.
2. One or multiple PDF, DOCX or TXT files can be uploaded as one matter; unsupported/corrupt files and configured count, per-file and aggregate limits are rejected.
3. A job description is required before generation; user can review and confirm/correct suggested classifications first.
4. Generation cannot run before confirmation and consumes only this session's uploaded sources and confirmed classifications; no network/external lookup supplies content.
5. Every supported output assertion has a source reference; unsourced checklist suggestions say `Confirm with employer` and appear in `Missing information`; unsupported owner is exactly `Owner: Confirm`.
6. No fabricated duties, deadlines, owners, employer practices, legal conclusions or completeness claims are returned. Invalid or ungrounded model output fails closed or is explicitly marked as a limitation.
7. API validates output schema, exposes only a surface AI-assisted notice, and never returns the exact model identifier.
8. Session state is owner-bound, ephemeral, expires after the proposed 15-minute TTL, can be explicitly deleted, and is not persisted. All responses are `no-store`.
9. Tests cover lifecycle/state transitions, authorization isolation, file validation/limits, job-description requirement, provenance and missing-information rules, model/parser failure, expiry and deletion.
10. Deployment remains separate from Hire and frozen redaction contracts; implementation is verified in the canonical combined LawyerLab runtime before release.
