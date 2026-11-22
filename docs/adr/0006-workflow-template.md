# ADR 0006: Workflow template and agent interview (presentation side)

**Status:** Accepted (2026-10-28)
**Date:** 2026-10-28
**Amended:** 2026-11-02 (hiring-package panel registered as an HR-panel copy — see Amendment below); 2026-10-31
**Applies to:** `src/lib/workflows.ts`, `src/lib/workflowPanels.ts`, `src/surfaces/`, `src/lib/useWorkflowCapabilities.ts`, `src/pages/Playground.tsx`
**Relates to:** ADR 0005 (catalog ownership, surface intake), tool-parse `docs/ADR-006-workflow-capability-contract.md`, tool-parse `docs/ADR-007-workflow-template.md`

> **Reading the Hiring v2 amendment:** Its panel rationale and sign-offs are historical records of the approach, not a current lifecycle or release authorization. The clarification in the amendment below and the [proposed Hiring v2 record](../workflowadr/0001-hiring-v2-intake-and-handoff.md) describe the subsequent guest handoff and versioned reapproval direction. Guest eligibility requires explicit workflow approval and the release gates remain applicable; existing `hr-hiring` remains member-only. Reconcile the historical amendment's create-is-approval and state descriptions before integration.

## Context

tool-parse owns what a workflow accepts and returns (ADR-006) and how a backend entry is declared (ADR-007).
LawyerLab owns only how a workflow is presented. The repos are separate checkouts: reference the other repo by
name and path (`tool-parse` `docs/ADR-007-workflow-template.md`), never with relative `../` links.

## Decision

### Ownership

| LawyerLab static catalog owns | tool-parse owns (overlaid at runtime) |
|---|---|
| `id`, `backendId`, label, action, description, icon | `identity_requirement`, `intake_modes`, `accepted_file_types` |
| `disabled`, samples, guide, `notes`, surface visibility | `pii_profile`, `handling`, `results` |

`useWorkflowCapabilities` overlays backend capability metadata onto the static entry. If `/v1/workflows`
fails, static fallback must fail closed: it must not weaken member authentication or widen source capability.
Capability discovery never selects a frontend route, lifecycle, transport, or panel. The frontend's explicit
workflow-ID-to-panel registry selects UI implementation; backend internal bindings select adapters and are not
public. Surface profiles may select/narrow visibility and capability only; they never select panel or transport.

`handling` is a real input, not copy. `selectable` shows a picker in the Options tab, and the pick is sent as
`workflow_settings: {"handling": ...}` on every submit path. `fixed` and `none` show no picker (Options is
collapsed unless the page passes an `optionsSlot`). Static `notes` are read-only guarantees shown in the Guide
tab; never put a choice in `notes`. Handling state lives in `WorkflowPage` behind `HandlingContext`.

### Template for a new entry

A new entry in `CATALOG` declares presentation fields and `backendId`. `backendId: null` means display-only
("launching soon"); such an entry must be `disabled: true` and is never submittable. Do not invent a backend
record for it. Unknown backend ids resolve to the existing "needs an update" intake state.

`tests/workflow-catalog-invariants.test.ts` enforces: unique ids, display-only entries are disabled, unique
`backendId`s, known input modes.

### Target panel/frame architecture

The frontend explicit workflow-ID-to-panel registry selects UI implementation; backend capability metadata
never infers a route, lifecycle, transport, or panel. Target composition is lifecycle-neutral `WorkflowShell`
dispatch around common `WorkflowPage` visual/accessibility/access frame. `JobWorkflowPanel` alone owns the
`/v1/jobs` lifecycle. Workflow-specific panels own session or bespoke lifecycle, verification, submission,
cleanup, and result handling. This describes target architecture, not a claim that current components already
have this composition.

A workflow panel handling a fixed artifact must guard its shape strictly and reject anything else as the
"needs an update" error (`IncompatibleArtifact`) rather than render a broken result. Do not add a generic
artifact renderer.

### Shared building blocks

Default to the shared path. A bespoke page needs a stated reason in its PR (ADR 0005 section 3). Vocabulary:
`DICTIONARY.md` ("Code map"). Completed source/output presentation belongs to `ReviewWorkspace`: side by side at container
width >=821px, stacked below. Shared `Shell` main owns container context; do not add route-specific layout flags or
breakpoints. The `contract-review` fixed-artifact panel is an explicit exception.

| Block | Owns | Use when |
|---|---|---|
| `WorkflowShell` | Target lifecycle-neutral composition/dispatch around `WorkflowPage` | Every workflow once target composition lands; current code may still compose `WorkflowPage` directly |
| `WorkflowPage` | Heading, disclaimer, Guide/Options tabs, `HandlingContext`, signed-out fieldset | Every workflow |
| `JobWorkflowPanel` | `/v1/jobs` intake, status, artifact fetch, reset, `accepts` guard | Async `/v1/jobs` workflows only |
| `useWorkflowJob` | Upload, polling, `handling` pass-through | Any component that submits a job |
| `FileIntake` | Mode selector, file/text/sample source, `HumanVerification`, submit button | Compatible single-source job intake; reads `inputModes`, `acceptedFileTypes`, `samples` from the catalog |
| `SourceIntake`, `SingleFileIntake`, `TextIntake`, `FileDropzone` | Source widgets for one mode | Via `FileIntake`; use directly only to build a new intake owner |
| `MultiFileIntake` | The input-method radio group only. Despite the name it is not a multi-file uploader | Via `FileIntake` |
| `HumanVerification` | Turnstile widget, single-use token (300s expiry), quiet "Verifying…" row | Public/token-gated submit paths only. Never re-implement |
| `HandlingPanel` | Options/Guide tabs, picker, `off` warning | Via `WorkflowPage` |

The explicitly approved public `agreement-review` owns a one-shot `/v1/agreement-review` lifecycle. It uses `WorkflowPage` and `FileIntake` with the existing Turnstile component, validates its fixed response in `api.ts`, and does not use the job panel or infer transport from capabilities. Its intake mounts only after the capability confirms public identity, fixed pseudonymisation, file intake and an artifact result. A failed or incompatible capability lookup fails closed. The backend retains no result, so the panel does not retry a completed request or poll a job.

Known exceptions, not precedents: HR Hiring owns its member-only `/hr/v1` staged-session lifecycle (prepare,
review, generate, discard), and HR Onboarding is multi-file, so neither goes through `FileIntake` (ADR 0005
section 3). A new workflow copying either needs sign-off.

### Amendment (2026-11-02): hiring-package panel copies the bespoke HR panel — stated reason and sign-off

> **Later policy clarification (2026-11-02):** The member-only and create-is-approval lifecycle descriptions below reflect the earlier design. The newer Hiring v2 policy in tool-parse `docs/hiring-package-tech-spec.md` includes guest pseudonymisation, an explicit one-time member handoff, and versioned reapproval. The panel rationale and existing gates below are not release approval; reconcile the panel and backend contract with that policy before integration. See [the proposed workflow record](../workflowadr/0001-hiring-v2-intake-and-handoff.md).

tool-parse #94 settles that the hiring-package workflow is "built as a copy of the `hr-hiring` flow under a new workflow id". ADR-0005 §3 reserves bespoke staged-session panels for HR Hiring and HR Onboarding and states shared single-source primitives must not absorb incompatible lifecycles. Registering the copy under the "Known exceptions" rule above requires a stated reason and sign-off; this amendment records both. It approves the **approach only** — no route, catalog entry, panel registration, backend call, or deployment change is authorized by it, and none may land until site-lawyerlab gates #99, #100, #101 close and the ADR-0006 build checklist is followed.

**Stated reason:**

1. **Lifecycle mismatch with shared primitives.** The hiring-package flow is one workflow id (`hiring-package`) gated by authentication per stage: intake and pseudonymisation are open to guests and members; review/edit, approval, versioning, compensation, interview guide and handoff require a member (tool-parse ADR-007 "Lane decision", #98). Its staged session carries session-scoped server state. `JobWorkflowPanel` alone owns the single-source `/v1/jobs` lifecycle (intake, status, artifact fetch, reset, `accepts` guard) and cannot carry per-phase gating (e.g., screening re-required after description edits), create-is-approval, or retry-with-contract semantics without flattening the HR state machine — the exact outcome ADR-0005 §3's bounded-primitives rule forbids. `FileIntake` is not an alternative owner: it is a reusable source widget (mode selector, file/text/sample source, `HumanVerification`, submit button) used by both the job panel and the one-shot `agreement-review` intake, and it carries no lifecycle of its own — wiring the staged hiring session onto it would still require building a second bespoke lifecycle owner.
2. **Copying the recognized exception is the settled design, not a new exception class.** Per #94 the flow replicates the `hr-hiring` staged-session shape (as composed today in `src/pages/HrHiring.tsx`: `WorkflowPage` frame + `HandlingContext` + bespoke session lifecycle with in-flight request guards and session DELETE cleanup) under a new workflow id. Reusing `FileIntake` for it would create a second intake path for the same contract family.
3. **Server/browser state split needs session-scoped handling.** Per #94: screened text lives in server memory only (30 min idle, 60 min hard cap); after approval the server keeps only the approved text and `versionId`; assets, pay range, occupation and region stay in the browser. A job panel has no equivalent state ownership model.
4. **Selected contract behaviors are exercised in isolated fixtures.** The committed prototype line (`d760a72`, `2f0b8f4`, `02fbd04`, `07ac8aa`, `4d7c486`, `8c28f88`) implements screening-invalidation-after-edits, a fixture retry result mirroring the committed tool-parse screening contract with fail-closed error codes, stale-retry revision guarding (committed tests exercise the A→B→A sequence), and an unmounted router-level draft guard — synthetic-only, unrouted, absent from the catalog and panel registry, exactly pending these gates. This demonstrates fixture-level behavior only: the integrated frontend and the deployed cross-repository contract remain unverified until gates #95–#100 close.

**Documented ceilings (each has a named follow-up, none silently dropped):**

- Route registration and panel mounting wait on site-lawyerlab gates #99, #100, #101 and the tool-parse backend gates they depend on; the fixture stays synthetic-only until then.
- Back/forward and programmatic-navigation interception require data-router integration at mount time. The unmounted guard is designed and fixture-tested for reload, close, and link clicks only; it does not currently protect a mounted workflow.
- Real-browser, screen-reader, and real-document detector behavior are unverified until integration and are tracked as integration acceptance items, not part of this sign-off.

**Sign-off:**

| Signatory | Role | Scope signed | Date | Verdict |
|---|---|---|---|---|
| UmaUX | Frontend UX | stated reasons 1–4 and documented ceilings | 2026-11-02 | **SIGN** |
| QuinnQA | QA review | stated reasons 1–4 and documented ceilings | 2026-11-02 | **SIGN** |
| DevonDeveloper | Coding lead | stated reasons 1–4 and documented ceilings | 2026-11-02 | **SIGN** |
| Romesh | Product owner | acceptance of the exception; guest access to hiring-package (one-line capability change, 4655626) | 2026-11-02 | **SIGN** |

Reuse rules:
- Do not send `workflow_settings` from a new place: `useWorkflowJob` is the one job submit path. A session panel that submits itself reads `HandlingContext.submitted`.
- Do not hard-code file types, input modes, or sample lists in a panel; read them from the resolved workflow.
- Do not add a second Turnstile integration. If `HumanVerification` cannot express the need, change it.

### Auth gate

Protected workflows mount no upload or job polling until `useTier()` is `ready`, and show the sign-in gate when signed out. `Playground.tsx` reads `identity_requirement` from the validated backend capability; missing capability information defaults to protected. The owner explicitly approved public `agreement-review` on 2026-10-31; `docalias` is also public. A new guest workflow requires explicit approval and server-side enforcement.

## Agent interview (ask before writing code)

Stop and ask when an answer is unknown. Do not default identity, PII handling, or guest access.

0. Can it use the shared visual frame and a compatible lifecycle panel? If not, what specific route/lifecycle difference justifies a workflow-specific panel?
1. Does the backend workflow exist (tool-parse ADR-007 Part A done)? Which `backendId`?
2. Launch-ready or display-only?
3. Label, action verb, description, icon, samples, guide copy.
4. Which surfaces expose it? Are there surface-specific copy overrides?
5. Protected workflows: may a signed-out user submit source content? If unsure, no. `docalias` and the explicitly approved `agreement-review` are public when available. Existing `hr-hiring` requires an authenticated member; no guest exception exists for it. The distinct [proposed Hiring v2 workflow](../workflowadr/0001-hiring-v2-intake-and-handoff.md) describes guest pseudonymisation and member handoff, subject to its release gates and the [shared guest-workflow decision](../workflowadr/0017-common-workflow-baseline.md#implementation-and-reconciliation).
6. Which explicit lifecycle panel owns this workflow? A session panel does not inherit the job lifecycle and needs its own tests.
7. Handling: is it `selectable`, `fixed`, or `none` (tool-parse decides)? If `selectable`, the picker and `workflow_settings` come free through `WorkflowPage`; a session panel must send `workflow_settings` itself. Check every submit path.
8. File types: the UI must read `accepted_file_types` from the catalog, not hard-code them.
9. Result: what artifact shape does the panel render, and does it contain source text? Pseudonymised output stays pseudonymised; do not restore tokens in the UI.

## Build checklist

1. Backend entry exists and `GET /v1/workflows` lists it (tool-parse ADR-007 Part B).
2. Add the `WorkflowId` union member and the `CATALOG` entry with `backendId`.
3. Add it to the surface profile(s) in `src/surfaces/`.
4. Reuse the shared blocks (table above), or record in the PR why not. Add its explicit lifecycle panel to `WORKFLOW_PANELS`; `/v1/jobs` panels need `accepts`. Do not call any upload or session endpoint before the auth gate for protected workflows.
   `hr-hiring` is catalog-`protected` and member-only (no Turnstile or anonymous path); see tool-parse ADR-006 "Identity enforcement". The gate in `Playground.tsx` must not admit guests for it.
5. Tests: overlay and fallback (`tests/workflow-capabilities.test.tsx`), invariants, the `accepts` guard (`tests/api.test.ts`), surface list (`tests/surface.test.ts`), page behaviour. For `selectable` handling, assert the pick reaches the upload (`tests/workflow-shell.test.tsx`).
   Any test spying on `fetch` sees `/v1/workflows` as an extra call; do not assume `calls[0]` is the upload.
6. Enable it in the deployment: the backend id must be in `TOOL_PARSE_WORKFLOW_ALLOWLIST` in
   `~/sites/site-lawyerlab/deploy/unified/compose.yml`, or `/v1/workflows` will not list it and the page shows "needs an update".
   Rebuild only through `~/sites/site-lawyerlab/deploy/unified/up.sh`.
7. Verify:

```bash
cd ~/sites/site-lawyerlab && npm test && npm run build
cd ~/sites/tool-parse && npm test
curl -s localhost:7100/v1/workflows   # the id is listed, no binding/shadow fields
```

8. Smoke test on the deployed stack with a member session and a real Turnstile token, using a synthetic file
   that contains PII. HTTP 200 on `/mvp/` proves nothing about Turnstile or processing.
9. Commit with a conventional lowercase one-line message. Stage only your files; leave unrelated dirty files alone.

## Consequences

- Presentation drift fails a test instead of reaching users.
- No shared schema: the HTTP contract is the only coupling.
- Session panels remain outside the `/v1/jobs` lifecycle; capability overlay still narrows their resolved intake metadata.
- Adding a workflow touches `workflows.ts`, `workflowPanels.ts`, `surfaces/`, `api.ts` (job guard), the compose
  allowlist, and tests. The auth gate and `selectable` handling are the two places an agent can silently get
  it wrong, so the interview asks about both.
