# Staged HR API contract — Phase 1

**Status:** Implemented, version 1; issue #48. Backend: `lawtrepreneur/tool-parse` commit `9368888` (`feat: add staged hr v1 sessions`) with later `/hr/v1` changes on `main` (LLM generation merged in `6c143be`; `hr-hiring` PII gate enforced in `09f04b0`, closing tool-parse #78). Frontend: site-lawyerlab PR #51. This contract does not change the frozen redaction API contract. Public URL/HTML source, further outcomes, and persistence remain deferred to issue #50.

## 1. Scope

Phase 1 accepts exactly one source: either one PDF upload or one pasted-text source. It prepares one initial outcome, `improved_job_description`, as Markdown for professional review. Generation may use a configured LLM. The model receives the prepared source under the handling choice persisted for that session, together with controlled criteria/decisions, and is instructed to use only that source. The runtime mechanically guards only configured money, pay, and equity figure patterns, requiring matching digits in the source; other generated claims are not mechanically verified. Professional review and sign-off remain required. The professional retains judgment and edits; the service does not make hiring decisions or provide legal advice.

Not in Phase 1: public HTTPS URLs or HTML fetching; DOCX in the staged flow; user-created criteria; outcomes beyond `improved_job_description`; persistence, accounts, history, or tokens. The existing redaction workflow may retain its own PDF/DOCX behavior; this contract does not alter it.

## 2. Version and transport

Use the instance-first HR route `/hr/v1`, not `/v1/jobs` or its result paths. `/hr/v1` is the compatibility contract for this workflow; request and response bodies carry no version field:

- `POST /hr/v1/sessions` — create an ephemeral staged session.
- `POST /hr/v1/sessions/{session_id}/generation` — generate the selected outcome.
- `DELETE /hr/v1/sessions/{session_id}` — discard the session; idempotent for an authenticated owner.

The live `POST /v2/hr/packages` route is not migrated, aliased, or renamed by this contract; it remains compatibility/rollback-only until a separate ticket.

All requests and responses use HTTPS and JSON except the multipart source-creation request. `/hr/v1` requires authenticated member identity before any source is processed; anonymous callers are never admitted. The gateway supplies member identity, and tool-parse never accepts a client-supplied owner identity. HR requests do not use a Turnstile token. `POST /hr/v1/sessions` accepts exactly one PDF upload or one pasted-text source; `.txt` file uploads are not accepted. `TOOL_PARSE_HR_V1_ENABLED=0` disables every `/hr/v1` route (404). The `/hr/v1` path is distinct from the bare `/v1` redaction API, which is frozen legacy and unchanged.

### Handling capability and screening

> **Policy reconciliation:** The existing selectable handling described here, including conditionally enabled `off`, requires reconciliation with the intended screening baseline in [workflow record 0017](../workflowadr/0017-common-workflow-baseline.md#implementation-and-reconciliation). See also [HR Hiring record 0008](../workflowadr/0008-job-description-review.md). This note does not change the existing contract or establish an approved exception.

The current `/v1/workflows` catalog declares `hr-hiring` handling as selectable, with `reject` and `redact` choices and `redact` as the default. It does not advertise `pseudonymise`. The server adds `off` to the selectable choices only when `TOOL_PARSE_OFF_WORKFLOWS` explicitly includes `hr-hiring`; the catalog is authoritative for the current instance. The client must submit the selected value in `workflow_settings.handling`; the server validates it against that catalog and stores the resolved setting with the session. A missing or incompatible client capability is not authorization to assume a mode.

Screening runs for all three supported handling choices. `reject` rejects a source when screening finds a span; the configured prohibited-identifier categories and the personal-document person-count rule reject under every choice. `redact` stores screened text with detected spans replaced. `off` keeps screened source text unchanged for other detected spans; it does not disable screening or rejection. The current source implementation is `src/catalog.js`, `src/api/server.js` (`resolveWorkflowSettings` and `screenHrPages`), and `workflows/hr-hiring/pii.js` in tool-parse. The `redacted preview` examples below describe the default `redact` path, not every selectable handling mode.

No session, source, digest, criterion decision, or generated result is persisted. Keep session state only in bounded, short-lived server memory for the staged lifecycle. Do not log raw source, extracted text, or generated content. Do not include them in errors. Responses containing source-derived or personal data must set `Cache-Control: no-store` and `Pragma: no-cache`; do not expose content to shared caches.

## 3. Create a session

`POST /hr/v1/sessions` accepts either JSON for pasted text or `multipart/form-data` for one PDF. Never accept both source forms in a single request.

### Pasted text

Request body: `application/json`, maximum encoded body size 512 KiB.

```json
{
  "source": {
    "kind": "pasted_text",
    "text": "The exact text submitted by the user"
  }
}
```

Trim only to validate the character-count bounds: the trimmed value must contain 100 through 100,000 Unicode characters inclusive. Reject an out-of-range value; never truncate it. Compute SHA-256 over the exact raw submitted UTF-8 text, before trimming, line-ending changes, extraction, or other normalization. The digest is an opaque integrity/fingerprint value, not a secret, authorization credential, or durable identifier. Return the digest and byte/character metadata, but never echo the text.

### PDF

Request body: `multipart/form-data` with exactly one file field named `file`. Accept PDF only; reject DOCX and other formats. Reuse the existing PDF limits: 10 MiB maximum file size, existing page limit, and existing worker/concurrency limit. The exact page and worker limits are deployment limits; enforce the configured values and return them through the bounded limits metadata where applicable. Compute SHA-256 over the exact uploaded bytes before extraction. Do not persist the upload.

### Success

Return `201 Created`:

```json
{
  "session_id": "opaque-random-id",
  "status": "source_ready",
  "source": {
    "kind": "pasted_text",
    "sha256": "64-lowercase-hex-characters",
    "character_count": 1234
  },
  "preview": {
    "status": "safe",
    "text": "bounded redacted preview; omitted from this example"
  },
  "criteria": [
    {
      "criterion_id": "role_title",
      "label": "Role title",
      "extracted_value": "Senior Paralegal",
      "extraction_status": "source_anchored",
      "decision": "unresolved",
      "provenance": {
        "kind": "source",
        "page": 1,
        "anchor": "Role title"
      }
    }
  ],
  "gaps": [],
  "limitations": [],
  "outcomes": ["improved_job_description"],
  "limits": {
    "text_characters_min": 100,
    "text_characters_max": 100000,
    "request_body_bytes_max": 524288,
    "pdf_bytes_max": 10485760
  }
}
```

For PDF, `source.kind` is `pdf` and `character_count` is omitted; it may include `page_count` after extraction. Do not return extracted source text. `criteria` contains only the fixed, versioned v1 criterion instances extracted from the source; clients cannot add criteria. Each instance includes its extracted value/status and bounded source provenance when available. A criterion's `decision` starts as `unresolved`. Permitted decisions are `confirm`, `correct`, `exclude`, and `unresolved`. A `correct` decision must carry a bounded user-supplied `value`; other decisions must not carry one. The API must preserve criterion IDs and provenance; it must not silently treat corrections as source-anchored facts.

Session IDs are random, unguessable, ephemeral routing identifiers, not preparation tokens or bearer authorization. Bind each to the gateway-supplied member identity, expire it after the short server-defined period (15 minutes in tool-parse), and return `404` for missing, expired, or other-owner sessions so ownership is not disclosed.

## 4. Generation

`POST /hr/v1/sessions/{session_id}/generation` accepts JSON, maximum encoded request body 512 KiB:

```json
{
  "outcome": "improved_job_description",
  "criteria": [
    {
      "criterion_id": "role_title",
      "decision": "confirm"
    },
    {
      "criterion_id": "work_location",
      "decision": "correct",
      "value": "Toronto, Ontario"
    },
    {
      "criterion_id": "compensation",
      "decision": "exclude"
    },
    {
      "criterion_id": "hiring_timeline",
      "decision": "unresolved"
    }
  ]
}
```

Validate that the outcome is exactly `improved_job_description`, criterion IDs are members of the fixed v1 set returned by preparation, each appears at most once, and decisions are from the allowed set. Reject unknown or user-created criteria. `correct` requires a non-empty bounded value; other decisions forbid `value`. Decisions are inputs for generation, not a way to override the source digest or provenance. Generation is bound to the prepared session's source digest and criteria decisions; it does not re-read or re-fetch the source. Generated text may be produced by a configured LLM. The model is supplied the prepared redacted source and controlled criteria/decisions and instructed to use only the source. The server mechanically guards only configured money, pay, and equity figure patterns, requiring matching digits in the source; other generated claims are not mechanically verified and require professional review. Output is not guaranteed byte-identical across runs. Phase 1 has no separate gap-answer channel; unresolved criteria remain unresolved in the output and next steps.

Return `200 OK`:

```json
{
  "session_id": "opaque-random-id",
  "status": "generated",
  "source_sha256": "64-lowercase-hex-characters",
  "outcome": "improved_job_description",
  "format": "text/markdown",
  "content": "# Improved job description\n...",
  "criteria": [
    {
      "criterion_id": "role_title",
      "decision": "confirm",
      "provenance": {
        "kind": "source",
        "source_sha256": "64-lowercase-hex-characters",
        "locator": {"page": 1, "anchor": "bounded source excerpt"}
      }
    },
    {
      "criterion_id": "work_location",
      "decision": "correct",
      "value": "Toronto, Ontario",
      "provenance": {"kind": "user_correction"}
    },
    {
      "criterion_id": "hiring_timeline",
      "decision": "unresolved",
      "provenance": {"kind": "unresolved"}
    }
  ],
  "disclaimer": "For professional review. This output is not legal advice or a hiring decision."
}
```

The exact Markdown may include only source-grounded material, accepted user corrections, and explicit unresolved/excluded treatment. Source-derived provenance in the response applies to extracted criteria and user corrections (for user corrections, provenance identifies them as user-supplied, not source evidence). Individual generated Markdown claims do not carry per-claim provenance. For extracted criteria, use page and bounded anchor when available. Do not invent facts to fill gaps. Excluded criteria are not generated as substantive content. Keep provenance distinct from generated prose; never label user corrections as source evidence. The output is a review draft, not send-ready or approved material. Do not include raw source outside the intended generated content and bounded provenance anchors. When the explicitly enabled `off` mode is used, non-prohibited detected personal information can remain in the session source and may therefore reach generation; permitted-use restrictions and disclosure must not describe this mode as disabling screening.

## 5. Lifecycle and failure behavior

Lifecycle: `source_ready` → `generated` → `discarded` or `expired`. Generation is repeatable while the session is live; each call is bound to the same source digest and the criteria decisions supplied in that call. `DELETE` discards in-memory source, extraction, and result state as soon as practicable. Expiry also discards it. There is no preparation token, durable job, polling endpoint, or result-fetch endpoint.

Errors use a stable envelope and never contain submitted text, extracted content, file contents, anchors, or secrets:

```json
{
  "error": {
    "code": "invalid_source",
    "message": "The source does not meet the requirements."
  }
}
```

Stable codes:

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `invalid_request` | Malformed JSON/multipart request, duplicate or mixed source fields, Content-Length mismatch, invalid schema, or invalid criterion decision/value. |
| 400 | `invalid_source` | Text is below/above bounds, PDF has too few text pages, or the document is rejected (too many pages, invalid DOCX, zip64). |
| 401 | `unauthorized` | Identity headers missing or inconsistent. |
| 403 | `forbidden` | Not an authenticated member. HR has no anonymous or Turnstile path (tool-parse). |
| 404 | `session_not_found` | Session absent, expired, or belongs to another owner. |
| 411 | `length_required` | Content-Length header is missing or invalid. |
| 413 | `too_large` | Body exceeds 512 KiB for JSON or the PDF size limit. |
| 415 | `mismatched_content` | Upload bytes do not match the expected PDF signature. |
| 422 | `pii_rejected` | Source appears to be a personal document (for example, a government ID or card number, or too many distinct person names). Creates no session. |
| 422 | `generation_fact_violation` | Generated output contains a figure not present in the source. |
| 429 | `session_limit_reached` | Per-owner or global session cap reached, including recently discarded sessions. Includes `Retry-After`. |
| 429 | `generation_limit_reached` | Generation count for this session has reached its cap. |
| 429 | `queue_full` | Extraction worker capacity is full. Includes `Retry-After`. |
| 502 | `extraction_failed` | Document extraction failed. |
| 502 | `generation_failed` | Model generation failed or returned unusable output. |
| 503 | `processing_unavailable` | Personal-data screening is unavailable; fails closed, source is not used. |
| 503 | `llm_not_configured` | Generation is not configured on this deployment. |
| 504 | `timeout` | Document processing timed out. |

Verified against tool-parse `main` (`e22cf2a`). Error response bodies are generic and carry `Cache-Control: no-store`.

Error response bodies must not echo invalid fields or parser/library exceptions. Apply the existing PDF page and worker limits before or during extraction; return a stable validation/capacity error rather than exceeding them. Rate-limit session creation and generation by authenticated identity, and bound in-memory session size and lifetime.

## 6. Assumptions and open implementation details

- **Assumption:** the existing gateway can authenticate and authorize this distinct HR route without changing the frozen redaction contract. Route ownership, deployment location, and exact middleware integration remain implementation decisions.
- **Assumption:** the fixed criterion identifiers and labels come from the approved `improved_job_description` workflow specification; the example IDs illustrate the schema, not an independently approved final criterion catalogue.
- **Resolved:** session expiry is 15 minutes in tool-parse (`HR_SESSION_TTL_MS`), in-memory, lost on restart.
- **Resolved (access model):** `/hr/v1` requires an authenticated member; there is no guest or Turnstile path for HR.
- **Open:** exact existing PDF page and worker limits must be confirmed from operator configuration. This document intentionally does not invent values for them.
