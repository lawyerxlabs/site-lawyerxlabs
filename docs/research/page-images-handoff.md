# Handoff: page-image source preview (LawLabs gaps #2 and #3)

Goal: give an agent working on the **tool-parse** stack everything needed to design and
ship page-image serving so site-lawyerlab can build the Datalab-style side-by-side
source + output workspace.

## The gap

The current playground already renders the uploaded PDF client-side with pdf.js during
the same-session flow, with redaction overlays applied in the preview. It is not blocked
on a page-image API for that flow. Accepted DOCX files have no source preview. The
uploaded source is memory-only, so it is unavailable after a refresh or in a new tab.
This local preview does not change the existing trust claim: that claim concerns raw
source non-return from the API.

The remaining server-backed work is separate: page images served by tool-parse would
support a Datalab-style source + output workspace, but must preserve the existing
redaction invariant. Frontend ticket refs: gaps #2 (left-panel document navigator)
and #3 (source preview pane).

Do not treat this handoff as a blocker for the current local PDF preview. Work the
server-backed page-image surface in tool-parse separately.

## Where the work lives

- Service: `lawtrepreneur/tool-parse` (self-hosted docker stack, gateway on
  `localhost:7100`). LawLabs (`site-lawyerlab`, dev proxy :7200 → :7100) consumes it
  strictly over HTTP `/v1`. LawLabs never imports tool-parse source — the fix is a new
  gateway/extraction surface, not a package dependency.
- Consumer contract: `site-lawyerlab/docs/API-CONTRACT.md` (frozen `mvp-2026-10-19`)
  and the additive `docs/API-CONTRACT-v2.md`.

## Hard constraints (non-negotiable)

1. **Redaction invariant.** The product promise is "raw source pages never served"
   (LawLabs upload-aside copy; TRUST-CLAIMS.md). The existing claim concerns API
   non-return of raw source; it does not prohibit the local PDF preview, which renders
   the uploaded PDF client-side with redaction overlays. Any **server-backed** page
   images must be derived from redacted state, or the feature must be explicitly gated
   behind a new approved trust claim. Serving the original page bitmap likely violates
   the current claim. Preferred path: render page images **after** redaction is applied
   (image-level redaction / burned-in), not the pristine original. If true source
   fidelity is required for the navigator (e.g. region linking), that is a product +
   trust-claims decision first — see TRUST-CLAIMS.md, the "Private processing" row
   shows how unapproved claims are handled.
2. **Source files are deleted after processing.**
   `tool-parse/src/jobs/orchestrator.js:140-157` deletes source storage after every
   attempt. Page images therefore cannot be lazily rendered on request from the
   source; they must be **materialized during processing** into the result store with
   the same `expires_at` lifecycle as markdown/report, or orchestrator deletion
   semantics must change (avoid this; retention is already sensitive).
3. **Result endpoints are read-once.** The markdown/report endpoints are read-once
   per contract ("Result endpoints are read-once — never auto-retry"). Page images
   should NOT follow read-once semantics — a page-image array needs N GETs (or one
   combined fetch); make page images multi-read or bundle them, and document which.
4. **Purge lifecycle.** Everything new must be covered by `purged` status handling and
   `expires_at` — no new artifact type may outlive the job.

## Design questions to settle (in order)

1. What is rendered: redacted page raster (safe default) vs original page (needs trust
   claim approval)? Get a product ruling before writing code.
2. Where in the pipeline: extraction already rasterizes? If tool-parse renders page
   rasters for OCR/geometry today, reuse that step post-redaction instead of adding a
   renderer.
3. Transport: per-page endpoint (`GET /v1/jobs/:id/pages/:n`) vs a manifest + blobs
   (`GET /v1/jobs/:id/result/pages` returning JSON with page count + URLs). Recommend
   manifest + per-page GET so the frontend can lazy-load page N when the user scrolls.
4. Artifact size/perf: JPEG vs PNG vs WebP; cap resolution (a preview needs ~150dpi,
   not print quality); gzip/brotli at gateway; per-page cache headers (`no-store`
   conflicts with repeat views — use short TTL or signed response keyed to
   `expires_at`).
5. Pagination coupling: LawLabs blocks carry `page` numbers (Block type,
   `site-lawyerlab/src/lib/api.ts`) — page indices must match exactly (1-based vs
   0-based must be pinned in the contract).
6. Turnstile/auth: result endpoints today are cookie-gated by the gateway; page
   images inherit the same gate. No new auth surface.

## Suggested contract shape (v2-style additive, draft for review)

```
GET /v1/jobs/:id/result/pages
  → { "schema_version": "...", "pages": [ { "page": 1, "url": "/v1/jobs/:id/pages/1", "width": 1240, "height": 1754 } ] }
GET /v1/jobs/:id/pages/:n
  → image/png (or webp), same expiry/purge rules as other result artifacts
  404 page_not_found | 410 gone (purged) — match existing result-error codes
```

Boundaries to respect: keep shapes additive; MVP routes unchanged; gateway enforces
tier limits (LawLabs holds no limit config); update `docs/API-CONTRACT-v2.md` (not the
frozen MVP doc) unless the MVP doc is being superseded deliberately.

## Acceptance criteria

- [ ] Page images materialized during processing, stored with job, purged at expiry
- [ ] Redaction posture explicitly decided and reflected in TRUST-CLAIMS.md if needed
- [ ] Contract doc updated with exact shapes, status codes, content types, 1/0-based
      page indexing, cache semantics
- [ ] Gateway gates new endpoints identically to existing result endpoints
- [ ] A LawLabs-side follow-up can land `?tab=`-independent left panel: page tabs,
      thumbnail/nav, block-region highlight using Block x/y/width/height (already in
      Block type) — that work is unblocked once the endpoints exist
- [ ] `npm test` + `npm run build` still green in site-lawyerlab (no change expected
      until frontend work starts)

## Current state in site-lawyerlab (context for the paired frontend work)

- Uncommitted rework on `main` workspace: context bar, public tabs
  (Document/Markdown/Redaction report, JSON hidden via `?tab=json`), usage/expiry
  readout, `useTier`/`getMe`, `:target` block highlight. Tests green (30 passing).
- No sidebar exists anymore (single-column shell); the navigator will be a new panel,
  not a sidebar revival.
- Known red herring: the old gap-analysis claimed `STAGES` was dead code — it was
  rendered; already resolved.
