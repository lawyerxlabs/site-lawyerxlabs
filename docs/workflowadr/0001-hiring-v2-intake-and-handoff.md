# ADR 0001: Hiring v2 intake and protected-package handoff

**Status:** Proposed. The intended guest result and quota policy follows the adopted [0017 baseline](0017-common-workflow-baseline.md); implementation and release remain subject to the gates below (#98).
**Date:** 2026-11-02
**Applies to:** Intended Hiring v2 presentation on LawyerLab, Signal Lawyers and HR Lab, with a shared backend; surface exposure and guest eligibility remain subject to the release gates and guest-workflow decision. Does not authorize a route, catalog entry, panel, gateway configuration, deployment, or release.
**Relates to:** `docs/adr/0006-workflow-template.md`, `docs/API-CONTRACT.md`, tool-parse `docs/ADR-007-workflow-template.md`, tool-parse `docs/hiring-package-tech-spec.md`

## Context

Hiring v2 has two input boundaries with different privacy obligations. An authenticated member may submit a job description directly. A guest may submit a PDF or pasted job description only for pseudonymization. Guest processing must not create protected package state merely because it succeeds.

[ADR 0006](../adr/0006-workflow-template.md) records earlier panel guidance and a later clarification for this distinct workflow. Guest-workflow selection under [0017](0017-common-workflow-baseline.md#implementation-and-reconciliation) and the release gates below remain open; the existing `hr-hiring` contract remains member-only.

LawyerLab presents workflows; tool-parse owns the backend workflow, identity enforcement, processing, storage, and API contract. `hr-hiring` remains an existing member-only workflow. It must be hidden from new UI when Hiring v2 is introduced, while its legacy route continues until a separately approved migration.

## Decision

1. Direct authenticated member intake creates protected package state only after backend screening. Guest intake creates only a pseudonymized UTF-8 plain-text result available until 15-minute expiry.
2. A guest may copy or download the result until expiry; doing so creates no protected package. Only an explicit action by a signed-in member may hand it off. Handoff must be server-side, atomic, and one-time; the browser must never repost processed text. A successful handoff leaves the guest result available until expiry.
3. Every protected Hiring v2 screen renders or submits only screened/pseudonymized package text. Raw guest and member input is never rendered, retained in browser storage, placed in a URL, or used as UI telemetry.
4. Protected work is versioned. Member edits are re-screened and invalidate approval and downstream outputs. Only an approved immutable `packageId` and `versionId` may request its one compensation result and one interview guide.
5. Offer drafting is browser-local only. Candidate identity, selected pay, dates, terms, and offer wording must not enter LawyerLab requests, URLs, logs, telemetry, or server storage. A changed version must not automatically restore or copy a stale draft.
6. LawyerLab must keep `hr-hiring` out of new Hiring v2 navigation without redirecting or removing its legacy route until a separate migration decision.

## Guest-to-member handoff contract (#99)

This is the proposed composition/route contract for #99, not release authorization. A route implementing it requires separate approval under the gates below.

- **Route:** `POST /v1/hiring-v2/guest-results/{guestResultId}/handoff`; request body is empty. The route accepts neither source text nor result text, evidence, email, IP, nor a caller-supplied owner. The guest cookie resolves and authorizes the guest result; the authenticated member session supplies the new package owner. Both credentials are required because guest-result authority and member ownership are distinct: a member session cannot substitute for the guest cookie, and guest authority cannot create a member-owned package without a member session.
- **Composition requirement (pending route design):** The gateway must authenticate the member session and the signed guest cookie independently and forward them to the handoff boundary as two distinct, proxy-authenticated principals; neither may be inferred from the other or from a generic anonymous identity. Current backend `identity()` resolves member headers first and ignores the anonymous identity header, so it cannot satisfy this contract as-is. The concrete header names and the backend validation path are not yet specified and require route design and separate approval before implementation. Backend validation must check the member identity and the independently forwarded guest principal, and must reject a request missing either.
- **Authorization order:** Require and validate the member session first. An unauthenticated guest caller receives `403` before the guest result is looked up or read. Do not reveal whether a guest result exists or whether it was handed off.
- **Unavailable result:** Missing, expired, or not owned by this browser's signed guest cookie all return the same `410 Gone` response with the frozen error envelope `{"error":{"code":"result_unavailable","message":"result unavailable"}}`. Responses are `Cache-Control: no-store`. Do not disclose handoff state or distinguish these cases. Priority: availability and guest ownership are checked first. An expired, missing, or other-session result returns `410` even if it was formerly claimed; the claim state never overrides availability.
- **Atomic one-time transition:** In one transaction/atomic operation, validate the cookie-bound, unexpired result and create exactly one protected package owned by the authenticated member, recording the consumed handoff and package identifier together. Success returns `201 Created` with `{"packageId":"…","status":"created"}`. The guest result remains available through its original 15-minute expiry for its existing retrieve/download operations. A subsequent handoff returns `409 Conflict` with the frozen envelope and code `handoff_already_used` (fixed message; no package identifier) only while the guest result is still available and its claim metadata is present. The claim metadata is non-user-visible state bound to the result lifecycle: it expires and is deleted with the result, and it does not consume, delete, or mutate the user-visible guest result text, downloadability, owner binding, or expiry. Once the result is expired or missing, the response is `410` regardless of any prior claim. Concurrent requests serialize on the same result: exactly one creates a package and gets `201`; the other gets `409` while the result is available, or `410` if expiry wins the race. No partial package or consumed-without-package state is permitted.
- **Authority and retention:** Do not retain IP address, email, or account-linking metadata on the guest result. Handoff consumes only the signed guest-cookie authority; the package owner is derived only from the authenticated session. Do not persist a guest-to-member link beyond the minimum atomic consumed-state needed to prevent another handoff.
- **Retrieval:** The returned `packageId` is readable only by its owning member session. The old guest result id remains usable only with the original guest cookie and only until expiry; it is not a member-package retrieval credential. A member must not be able to retrieve the guest result by supplying its id without that cookie.

### Synthetic handoff test matrix

Use synthetic pseudonymized content and separate guest-cookie jars and member sessions. Test the gateway-composed dual principals once the route design defines their representation. Assert response code/body and persisted state, not only UI behavior.

| Case | Action | Required result |
|---|---|---|
| Auth order | Call handoff without a member session, including with a valid guest cookie and result id | `403`; assert no guest-result lookup/read and no package or state change. |
| Cross-session isolation | Try another browser's guest cookie/result id and another member session | Uniform `410 result_unavailable` for the foreign guest result; no disclosure or package. A member other than the creator cannot retrieve the created package. |
| Success and guest preservation | Valid cookie + member session hand off; then retrieve and download the guest result before expiry | `201` with package id/status; one package owned by the session member; guest retrieve and download still succeed through expiry. |
| Double/tab concurrency | Submit two simultaneous requests for the same result, same cookie, and same member session | Exactly one `201`, one `409 handoff_already_used`, exactly one complete package, no partial state. |
| Two-member race | Two distinct authenticated members submit simultaneously with the same valid guest cookie and result id | Exactly one package, owned by the winning member; the winner can retrieve it; the loser cannot retrieve it. Loser gets `409 handoff_already_used` while the source is available, with no package id, source id, or other identifier leaked; if expiry wins, both get `410`. |
| Repeat handoff | Submit again after success | Fixed `409 handoff_already_used`; no second package and no package id in conflict response. |
| Expiry race | Race handoff against the 15-minute expiry boundary | Either one complete package with success, or `410 result_unavailable`; never two packages or partial/consumed-only state. |
| Success then expiry retry | Hand off successfully, let the result expire, then retry handoff with the same cookie and member | `410 result_unavailable` with the canonical envelope and `Cache-Control: no-store`; no new package and no change to the existing package. |
| Failure atomicity | Force package creation/storage failure after validation | Error with no package and no consumed handoff; retry while unexpired can succeed. |
| No browser repost | Inspect browser request at handoff and persisted request data | Empty body; no raw or pseudonymized text/evidence in body, URL, browser storage, or telemetry. |
| Ownership and old-id semantics | Fetch returned package as owner and different member; fetch old guest result id with and without original cookie | Owner can retrieve package; other member cannot. Old id works only with original guest cookie until expiry and never resolves as a member package. |

## Alternatives considered

### Make guest intake a protected workflow

Rejected. Protected workflows require member authentication before source processing. Treating guest intake as an exception would weaken that invariant.

### Let the browser create the protected package from guest text

Rejected. Reposting output would widen browser exposure and break the one-time handoff boundary.

### Replace `hr-hiring` on launch

Deferred. A route migration needs its own compatibility decision and verification.

## Consequences

**Good**
- Guest and member trust boundaries remain explicit.
- Protected downstream processing begins only with member ownership and pseudonymized text.
- Offer-draft personal and compensation details stay client-local.

**Costs**
- Hiring v2 needs a dedicated backend composition and route contract; existing public one-shot and protected-session patterns do not define their handoff.
- Frontend needs an explicit lifecycle panel rather than treating the workflow as an existing job panel.
- `hr-hiring` remains a legacy compatibility surface until migration approval.

## Preconditions and acceptance

Before a LawyerLab Hiring v2 surface is exposed:

1. tool-parse defines and enforces the guest intake, result lifecycle, signed-in one-time handoff, protected package, authorization, deletion, quota, timeout, and failure contract.
2. Backend tests prove no raw-source disclosure, guest-result availability through expiry, one-time handoff with retained guest result, ownership isolation, and handoff atomicity. Screening coverage evidence permits the intended release scope.
3. The backend catalog and gateway allowlist intentionally expose the approved workflow contract.
4. LawyerLab adds only the required catalog/profile/panel/API-client changes, with protected auth gating and no raw text persistence.
5. Cross-repository verification passes before deployment, including the required authenticated smoke test.

Until these conditions hold, this ADR records intended architecture only. It does not authorize real-document testing or release.
