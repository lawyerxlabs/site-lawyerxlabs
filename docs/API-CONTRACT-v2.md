> **Policy reconciliation (2026-11-02):** [Workflow baseline 0017](workflowadr/0017-common-workflow-baseline.md) sets intended guest result availability through 15-minute expiry. The existing read-once and retention descriptions below remain the documented contract until a separately reviewed and verified migration.

# LawLabs → Tool Parse API contract — v2 (proposed, NOT frozen)

**Status:** DRAFT. Supersedes [`API-CONTRACT.md`](API-CONTRACT.md) once the gateway (`deploy-web-1`) ships these endpoints. MVP contract remains frozen and authoritative until then. `GET /v1/jobs/:id/result/artifact` is shipped (live route probe 2026-10-21: unknown job returns `not_found "job not found"`, unknown route returns `not_found "route not found"`). Other v2 endpoints: LawLabs will not call them until the gateway ships them.

This doc is additive. It defines identity tiers, tier limits, and the new endpoints. All `/v1/jobs*` routes keep their exact MVP shapes — nothing here changes them.

**Version label:** "v2" in this document names the document revision only. It does not establish a `/v2` URL-prefix convention. Route nomenclature is instance-first: `/hr/v1` for HR work, `/adv/v1` for advisory, `/law/v1` for legal work. The bare `/v1` redaction routes are frozen legacy and remain unchanged. The `/v1/me` and `/v1/jobs*` paths in this doc are the existing bare-`/v1` routes and are not renamed by this revision.

---

## Identity tiers

LawLabs does not own identity. The gateway owns the session cookie (or OIDC-upgraded session). LawLabs reflects tier from `GET /v1/me` on mount and displays server-provided `limits` — it never computes tier or limits itself.

| Tier | Identity source | How it works |
|---|---|---|
| `guest` | Gateway's existing anonymous identity cookie | No login. Today's behavior, unchanged. |
| `auth` | Gateway-issued session after OIDC login (Logto behind Caddy, same as mcp-legalx) | Login via `POST /v1/auth/login` → 302 to IdP → callback at gateway → gateway sets httpOnly session cookie → 302 back to LawLabs. LawLabs never sees tokens. |

**LawLabs never sees tokens or credentials.** Gateway owns the session cookie (`httpOnly`, `secure`, `sameSite=lax`). Same trust boundary as MVP.

---

## Tier limits

Gateway enforces these at every request and owns their configuration (single source of truth; LawLabs holds no limit config). LawLabs reflects them from `/v1/me` for UI only. Feature gating by tier is out of scope: every tier gets every feature, only the limits differ.

| Limit | guest | auth |
|---|---|---|
| `jobs_per_day` | 3 | 25 |
| `max_bytes` | 10 MiB | 10 MiB (product ceiling for all tiers) |
| `max_pages` | 10 | 250 |
| `retention_minutes` | 60 | 1440 (24h) |

Agreed as initial values; tune from real usage. Loosening is easier than tightening.

### Quota semantics

- Daily quota resets at 00:00 **UTC**.
- A job counts when the upload is **accepted** into the queue. Rejected uploads (wrong type, over `max_bytes`, over `max_pages`) do **not** consume quota. A validated job that later fails processing still counts.
- Page count is checked before expensive processing starts.
- Retention is measured from job completion.

---

## New endpoints (v2)

### `GET /v1/me` — tier + capability reflection

No body. Uncached (`Cache-Control: no-store`).

Response `200`:

```json
{
  "tier": "guest",
  "identity": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "email": null,
    "name": "Guest"
  },
  "limits": {
    "jobs_per_day": 3,
    "max_bytes": 10485760,
    "max_pages": 10,
    "retention_minutes": 60
  },
  "usage": {
    "jobs_today": 1,
    "jobs_today_remaining": 2
  }
}
```

For `auth` tier: `identity.email` is the user's email, `identity.name` is the display name, and `tier` is `"auth"`.

LawLabs error handling: if `/v1/me` returns 4xx/5xx, treat as `guest` with unknown limits — do not block the app.

---

### `POST /v1/auth/login` — start OIDC login

No body. Gateway responds `302` to the IdP authorization URL. LawLabs navigates top-level (`window.location = "/v1/auth/login"`). After the IdP round-trip, the gateway sets the httpOnly session cookie and `302`s back to LawLabs (e.g. `/?logged_in=1`). LawLabs refetches `/v1/me`.

### `POST /v1/auth/logout` — end session

No body. Gateway responds `204` and clears the session cookie. LawLabs refetches `/v1/me` after.

### `GET /v1/auth/callback` — IdP → gateway callback

Gateway-internal. LawLabs never calls this directly. Listed so tool-parse can scope its routes without conflict.

---

## Tier gates on MVP endpoints (gateway-side only)

MVP endpoint shapes are unchanged. Gateway layers tier logic server-side:

- **`POST /v1/jobs`** — enforces `max_bytes` (→ `413`) and `jobs_per_day` (→ `429`, with `Retry-After`). Same error envelope as MVP.
- **`GET /v1/jobs/:id`** — unchanged. "Owner" is now guest cookie _or_ auth session, both resolved by the gateway.
- **Result endpoints** — read-once rule unchanged. Guest results expire after `retention_minutes: 60`; auth results after 1440.

---

## Workflow artifact endpoint

`GET /v1/jobs/:id/result/artifact` — returns the workflow artifact for a completed job that was submitted with a `workflow` field. Owner-only. Read-once (same purge semantics as `/result/markdown` and `/result/report`).

**Response `200 application/json`:**
```json
{
  "artifact": {
    "type": "transaction-intake-v1",
    "schema_version": "1",
    "fields": [
      { "label": "Buyer",             "token": "[PERSON_1]",  "page": 1, "status": "found" },
      { "label": "Seller",            "token": "[PERSON_2]",  "page": 1, "status": "found" },
      { "label": "Property address",  "token": "[ADDRESS_1]", "page": 1, "status": "found" },
      { "label": "Purchase price",    "token": "[AMOUNT_1]",  "page": 2, "status": "found" },
      { "label": "Deposit",           "token": "[AMOUNT_2]",  "page": 2, "status": "found" },
      { "label": "Completion date",   "token": "[DATE_1]",    "page": 3, "status": "found" },
      { "label": "Irrevocability date","token": null,          "page": null, "status": "not_found" }
    ]
  },
  "warnings": [],
  "evidence": []
}
```

The response envelope requires `artifact`, `warnings`, and `evidence`. Workflow identity and sensitivity are read from the job status response, not this artifact response.

**Field `status` values:** `"found"` — token extracted with high confidence; `"not_found"` — label not matched in document; `"review"` — token found but low-confidence match.

**Errors:** `404` if the job has no artifact (workflow not requested or failed). `401` owner mismatch. Standard error envelope.

**LawLabs never calls this endpoint until `job.status === "completed"` and the job status response includes `workflow.status === "completed"`.** The `workflow` object is nested and contains `id`, `version`, `status`, `error_code`, and `sensitive`. No auto-retry.

---

## What does not change

- All `/v1/jobs*` paths, shapes, and error envelopes from `API-CONTRACT.md`.
- Turnstile: gateway verifies, LawLabs sends `cf_turnstile_response` on upload.
- Read-once result endpoints — no auto-retry.
- LawLabs calls only same-origin `/v1`.

---

## What changes in LawLabs (FE only — no auth logic)

| File | Change |
|---|---|
| `src/lib/api.ts` | Add `getMe()`, `login()` (`window.location = "/v1/auth/login"`), `logout()` (POST then refetch). |
| `src/lib/useTier.ts` (new) | Hook: fetches `/v1/me` on mount, exposes `{ tier, limits, usage, login, logout, loading }`. Fails gracefully (guest). |
| `src/components/Shell.tsx` | Tier badge + Log in / Log out button driven by `useTier()`. |
| `src/App.tsx` / `FileIntake.tsx` | Read `limits.max_bytes` / `max_pages` from the hook; remove any hardcoded consts. |

Upsell copy ("Create a free account for bigger files") is UI text, not part of this contract.

---

## Failure modes LawLabs must handle

| Condition | LawLabs behavior |
|---|---|
| `/v1/me` 4xx / 5xx / timeout | Treat as `guest`, unknown limits. Don't block upload. |
| `POST /v1/jobs` → `429` | Show remaining-count copy from `/v1/me` usage. Refetch `/v1/me`. |
| `POST /v1/auth/login` → `403` | Show inline "login unavailable" error. No retry loop. |

---

## Gateway coordination notes (tool-parse scope)

- Session cookie upgrades in place: guest cookie row becomes auth row on login (matches tool-llm-surface pattern — same `users` row, `anonymous` → email set). Gateway's choice; LawLabs is agnostic.
- `/v1/me` is `Cache-Control: no-store`.
- Rate-limit `/v1/auth/login` and `/v1/auth/callback` separately from job rate limits.
- CSRF: follow tool-parse's existing pattern. Login/logout are state-changing POSTs.
- Out of scope for v2: Stripe plan info in `/v1/me` (mcp-legalx handles billing).
