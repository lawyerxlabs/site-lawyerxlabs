# LawLabs → Tool Parse MVP API contract

Status: contract frozen for the redaction MVP (`mvp-2026-10-19`); the endpoints below are implemented in `src/lib/api.ts`. Live deployment limits are set by the gateway operator configuration, not by this document. LawLabs uses the same-origin gateway; it never calls the internal API or handles proxy credentials.

> **Policy reconciliation (2026-11-02):** [Workflow baseline 0017](workflowadr/0017-common-workflow-baseline.md) sets intended guest result availability through 15-minute expiry. The read-once contract below remains in effect until a separately reviewed and verified migration; 0017 does not change current API behavior.

## Topology

`browser → LawLabs/gateway origin → tool-parse gateway → internal API`

Requests use `/v1`. The gateway preserves the anonymous identity cookie and injects its internal proxy assertion. LawLabs sends the Turnstile form field on upload; it does not verify Turnstile or log its token.

## Endpoints

| Method | Path | Success | Semantics |
|---|---|---|---|
| GET | `/v1/health` | `200 {"status":"ok"}` | No job identity required. |
| POST | `/v1/jobs` | `202 Job` | Multipart `file`; `cf_turnstile_response` is required by the gateway. |
| GET | `/v1/jobs/:id` | `200 Job` | Owner-only status. Poll until a terminal status: `completed`, `failed`, `rejected`, or `purged`. |
| GET | `/v1/jobs/:id/result/markdown` | `200 text/markdown` | Completed-only: returns `409 not_completed` for any other status. Fetch once; anonymous content is purged after both result endpoints are read. |
| GET | `/v1/jobs/:id/result/report` | `200 application/json` | Completed-only: returns `409 not_completed` for any other status. Fetch once; anonymous content is purged after both result endpoints are read. |
| DELETE | `/v1/jobs/:id` | `204` | Owner-only purge/cancel; idempotence is implementation-defined. |

The `/result/markdown` and `/result/report` paths are authoritative. The shorter `/markdown` and `/report` paths are not part of this contract.

## Job and error shapes

Job status includes `job_id`, `status`, timestamps, expiry, and server limits. Status is one of `queued`, `processing`, `completed`, `failed`, `rejected`, or `purged`.

Terminal statuses are `completed`, `failed`, `rejected`, and `purged`; clients stop polling on any of them (a `completed` job also waits for its workflow to settle, if one is present).

- `failed`: processing error; `error` carries a code and message. Retry is allowed by the client.
- `rejected`: the job was refused; `error` carries the reason code and message. Rejection is non-retryable for the MVP: clients display the message and offer no retry. No result is available. Rejection codes are not yet enumerated by the server; clients fall back to a generic message for unknown codes.
- `purged`: output expired or was removed; no result is available.

Result endpoints are completed-only. Clients must not request `/result/*` for any status other than `completed`; such a request returns `409 not_completed`.

Errors always use `{ "error": { "code": string, "message": string } }`. Clients must handle `401`, `403`, `404`, `409`, `413`, `415`, and `429`; `429` may include integer-second `Retry-After`. Do not retry read-once result requests automatically.

Typical cases:

- `400`: malformed request, missing identity, invalid input metadata, or page-count failure.
- `401`: missing/invalid gateway assertion or identity.
- `403`: job belongs to another principal or Turnstile failed.
- `404`: unknown/expired job or route.
- `409 not_completed`: result requested before completion.
- `413 too_large`: upload or decompressed DOCX exceeds limit.
- `415 unsupported_type`/`mismatched_content`: unsupported or invalid file type.
- `429`: queue, concurrency, or anonymous daily limit; honor `Retry-After`.

## MVP limits and lifecycle

The gateway/API enforce the active anonymous/member limits. The UI must display server errors rather than reproduce limits client-side. Source and result objects are transient and expire according to the server's `expires_at`; LawLabs must not promise a fixed retention period until deployment config is approved. A user cancellation calls DELETE where available.

MVP supports PDF and DOCX in the product UI. Other accepted formats remain API-level capability, not a LawLabs UI promise.

## Compatibility

This is an adapter contract, not a shared package. Additive response fields are tolerated; required-field or path changes require a contract revision and client update. The current revision is `mvp-2026-10-19`.
