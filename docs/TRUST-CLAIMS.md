# Trust-claim verification — LawyerLab MVP

**Reviewed:** 2026-10-22

This inventory bounds customer-facing claims for the current LawyerLab public pages (About, Example, FAQ, Privacy, Terms). Claims not listed under Permitted copy must not appear on those pages. Distinguish code-verified behavior from operator attestations; neither implies guarantees beyond the wording below.

| Customer-facing claim | Basis and limits | Evidence |
|---|---|---|
| `Automated placeholder replacement helps protect identifying information.` | Tool Parse applies redaction placeholders to detected entities; this supports a claim about automated placeholder replacement, not that the product is non-AI or that every identifying detail is detected or removed. | `../tool-parse/workers/redaction/redact.py:307-347` (placeholder creation and replacement); `../tool-parse/src/jobs/orchestrator.js:122-134` (automated parser setup) |
| `Documents are processed in Canada.` | **Operator-attested.** External backup, log, and vendor-service geography remains unverified; do not imply every copy or service is in Canada. | Operator attestation dated 2026-10-22; no independent infrastructure-geography evidence reviewed. |
| `If OCR is needed, it uses our self-hosted local llama-swap model through a fixed proxy and Tailscale route we operate.` | Code/config evidence shows Tool Parse calls its fixed-upstream proxy; that proxy forwards only to the fixed Tailscale hostname; llama-swap config maps `chandra` to the local Chandra OCR model. Operator attests this route and service are operated by us. This does not establish geography of every network hop or upstream-adjacent service. | `../tool-parse/deploy/compose.yml:18-20`; `../tool-parse/deploy/ocr-egress/server.mjs:1-6, 77-81`; `/home/romeshh/stacks/llama-swap/config.yaml:175-188`; `../tool-parse/src/jobs/orchestrator.js:119-127, 164-170, 242-243`; operator attestation dated 2026-10-22 |
| `Uploaded source files are deleted after processing completes or fails.` | The orchestrator deletes the stored source after processing returns or throws. This claim concerns the uploaded source object, not every temporary copy, log, backup, or derived result. | `../tool-parse/src/jobs/orchestrator.js:326-345` |
| `Results are temporary and held on the server until they are read, purged, or reach retention expiry.` | Completed-job results are stored server-side. Anonymous content is purged after both result endpoints are read; explicit purge is supported; retention expiry also purges results. Failure/rejection results are removed by processing cleanup. Results are not promised to disappear immediately upon reading one endpoint. | `../tool-parse/src/jobs/orchestrator.js:322-345, 362-375, 378-397`; `../tool-parse/src/api/server.js:264-275`; `docs/API-CONTRACT.md:18-20` |
| `PDF source previews are rendered locally in your browser.` | Browser preview uses the uploaded `File` from an in-memory client-side store and pdf.js `file.arrayBuffer()`; it is not a browser-only processing claim. The browser copy is a raw `File` held in page memory only (no localStorage, sessionStorage, or IndexedDB), capped at two jobs with least-recently-read eviction, and cleared on Delete output, an observed `purged` status, the retention-expiry timer, or when the tab closes or reloads; it is separate from the server copy, whose lifecycle is covered above. | `src/lib/sourceStore.ts:1-24`; `src/components/SourcePreview.tsx:40-60`; `src/pages/Playground.tsx:20`; `docs/API-CONTRACT.md:18-19` |
| `Processing is automated; we do not routinely review uploaded documents.` | **Operator-attested policy.** This is not a technical no-access guarantee. Automated detection can miss content; users must review outputs. | Operator attestation dated 2026-10-22; automated pipeline at `../tool-parse/src/jobs/orchestrator.js:132-134, 326-345` |
| `Gateway and OCR-proxy logs do not include uploaded document bodies.` | Narrowly scoped technical evidence: gateway logs request metadata and selected response fields, not request/response body bytes; OCR proxy logs route, status, and duration, not bodies. This does not claim that all application, infrastructure, or vendor logs omit content. | `../tool-parse/deploy/web-gateway.js:200-215`; `../tool-parse/deploy/ocr-egress/server.mjs:1-2, 54-73` |
| `We do not use uploaded document content to train LawyerLab models.` | **Operator-attested policy**, supported by inference-only technical evidence for the configured OCR route. No claim is made about every third-party vendor's training practices. | Operator attestation dated 2026-10-22; inference request path `../tool-parse/deploy/ocr-egress/server.mjs:54-73`; local OCR model configuration `/home/romeshh/stacks/llama-swap/config.yaml:175-188` |

## Permitted copy for current public pages

- `Automated placeholder replacement helps protect identifying information.`
- `Documents are processed in Canada.` Add nearby limitation: external backup, log, and vendor-service geography has not been verified.
- `If OCR is needed, it uses our self-hosted local llama-swap model through a fixed proxy and Tailscale route we operate.`
- `Uploaded source files are deleted after processing completes or fails.`
- `Results are temporary and held on the server until they are read, purged, or reach retention expiry.`
- `PDF source previews are rendered locally in your browser.`
- `Processing is automated; we do not routinely review uploaded documents.` Do not present as a no-access guarantee.
- `Gateway and OCR-proxy logs do not include uploaded document bodies.` Preserve this narrow scope.
- `We do not use uploaded document content to train LawyerLab models.` Present as operator policy, not as a blanket vendor guarantee.
- `Review outputs before use in your practice.`

## Excluded claims

- Absolute `no-AI` claims.
- `Browser-only` processing or outputs.
- Immediate result deletion after one read or immediately after processing.
- `No staff access ever` or any other absolute no-access guarantee.
- Claims that logs or backups are globally absent or never contain content.
- Blanket claims that no third party or vendor uses data for training.
- Unqualified Canadian geography claims extending to external backups, logs, or vendor services.

## Waitlist

The visible waitlist CTA is intentionally disabled until a collection endpoint exists. It must not imply that an email address has been collected.
