# ADR 0001: Common Workflow design

**Status:** Accepted
**Date:** 2026-10-21
**Applies to:** every workflow after `prepare-doc` and `transaction-intake` (for example `case-analysis` and `agreement-review`, currently disabled placeholders)

## Context

> **Amendment (2026-10-21):** Clarifies registry, artifact, and lifecycle ownership against the implemented code. This note amends the record; it does not replace the original decision.
>
> **Amendment (2026-10-24):** Current route model: `/` is the public landing page; `/mvp/` is the standalone guest Document Aliaser exception; `/playground/?workflow=<id>` is the shared workflow UI. The `prepare-doc` result route is `/playground/jobs/:jobId`; `transaction-intake` selects `/playground/?workflow=transaction-intake` and renders its artifact inline. Additional workflows use the shared workflow UI; their result navigation depends on implementation. The `/tools/prepare/` plan in issue #14 was not adopted. This amendment records current routes without replacing the original decision.
>
> **Amendment (2026-10-28):** The catalog (`src/lib/workflows.ts`) now carries `docalias`, `transaction-intake`, `transaction-review`, `case-analysis`, `agreement-review`, `hr-hiring` and `hr-onboarding`. `prepare-doc` survives only as the no-workflow redaction upload. Backend families: `docalias` and `transaction-intake` use `/v1/jobs`; `transaction-review` uses a dedicated `/tx/v1/sessions` session flow (`src/lib/api.ts`); the two HR workflows use their own session contracts per ADR 0004 and ADR 0003. Decision 1's four-part model and Decision 2's job-record identity still govern the `/v1/jobs`-family workflows; session workflows follow their own ADRs. `/mvp/` now renders the full app (`src/routes.tsx`, `Mvp()`), not a standalone redaction MVP or a Document Aliaser exception; Decision 4.1's route notes describe history, not the current route table.
>
> **Amendment (2026-10-31):** Catalog drift since the previous amendment: `contract-review` and `term-isolation` were added and are enabled; `transaction-intake` was removed from the catalog and from the tool-parse workflow allowlist (2026-10-30, app-lawyerlab `c1ab41a`). `case-analysis` and `agreement-review` remain disabled placeholders. Backend families for the surviving workflows are unchanged. This amendment records the catalog drift; it does not change the decisions above.
>
> **Further amendment (2026-10-31):** The owner approved public pseudonymised `agreement-review`. Its direct, one-shot backend lifecycle does not use a job record or `WorkflowShell`; its own-frame panel and strict response guard are explicit. Availability depends on the backend feature and model configuration. This exception preserves the shared visual frame and does not change existing workflow lifecycles.

LawLabs is a thin shell over the `tool-parse` gateway. Two workflows exist:

- `prepare-doc`: plain redaction. Sends no `workflow` field and uses the markdown and report result endpoints.
- `transaction-intake`: the first artifact workflow. Sends `workflow=transaction-intake` and reads `GET /v1/jobs/:id/result/artifact`.

Building the second workflow exposed these problems:

1. **The contract draft did not match the live service.** `API-CONTRACT-v2.md` showed `artifact.workflow`. The live gateway returns only `artifact`, `warnings` and `evidence`. Our fail-closed check required the missing field, so every real result showed "This workflow needs an update…". This was fixed in `d202e90`.
2. **Chrome diverged.** Transaction Intake first rendered outside the Playground sidebar and panel. It now uses the shared `WorkflowPage` chrome (`b997155`).
3. **Each workflow currently needs a bespoke page, and shared chrome still carries redaction copy.** `src/pages/TransactionIntake.tsx` only wires registry, panel map and accept function. The title, sample file and Options and Guide copy are hard-coded for redaction, so Transaction Intake shows the wrong text.

Fixed constraints from existing docs and code:

- The API boundary is `src/lib/api.ts` only. The browser never sees proxy secrets (AGENTS.md).
- Limits gate access; capabilities do not. Every tier gets every tool (`MODEL.md`, principle 1).
- Customer-facing privacy copy is limited to what `TRUST-CLAIMS.md` has verified.
- Result endpoints are read-once and are never auto-retried.
- No remote plugins, no template picker, no backend changes from this repo.

## Decision

### 1. A workflow has four parts and nothing else

| Part | Lives in | Owns |
|---|---|---|
| Plugin and manifest | `tool-parse/workflows/<id>/` | Extraction logic, options schema, artifact type and schema |
| Registry entry | `src/lib/workflows.ts` | `id`, `label`, `description`, `icon`, `disabled`, `uploadId`, `sample`, `options`, `guide` |
| Artifact type and accept function | `src/lib/api.ts` | The TypeScript shape and the `artifact.type` and `schema_version` check |
| Panel and association | `src/components/<Name>Panel.tsx`, registered in `src/lib/workflowPanels.ts` | Artifact presentation; the registry associates the panel with its validator, which lives in `src/lib/api.ts` |

Everything else is shared and must not be forked per workflow: `WorkflowPage` (chrome), `WorkflowShell` (lifecycle and artifact fetch), `useWorkflowJob` (upload and polling), `FileIntake`, `HandlingPanel`, `Shell` (sidebar).

A new workflow that needs changes to `WorkflowShell`, `useWorkflowJob` or `WorkflowPage` is a signal to stop. Either the change is a genuine shared improvement (do it as its own commit and re-verify every existing workflow) or the workflow does not fit this ADR (write a new ADR).

### 2. Workflow identity comes from the job record, not the artifact

The live artifact payload is:

```json
{ "artifact": { "type": "...", "schema_version": "1", "...": "..." }, "warnings": [], "evidence": [] }
```

- `WorkflowShell` fetches the artifact only when `job.status === "completed"`, `job.workflow.status === "completed"` and `job.workflow.id === uploadId`.
- The panel's accept function checks `artifact.type` and `artifact.schema_version` only.
- Anything else fails closed with one user-facing message. It never partially renders.
- The response envelope requires `warnings` and `evidence`; panels own presentation of artifact warnings and statuses they understand.

### 3. Artifact versioning

- `type` names the workflow artifact (`<id>-v<major>`). `schema_version` is the manifest's string.
- A panel accepts exactly the versions it was written for. A gateway bump to an unknown version shows the "needs an update" message. That message is the intended behaviour, not a bug.
- Adding a version means adding a new accepted version and test fixture, not loosening the check.

### 4. One page, one URL pattern, workflow-driven content

Owner direction (2026-10-21):

1. All workflow UI lives at `/playground/`.
2. Every common workflow is addressed by a query parameter: `/playground/?workflow=<id>`. A missing parameter means the default workflow (`prepare-doc`). An unknown id shows "Workflow unavailable". There is no per-workflow path and no per-workflow page file.
3. The surface owns the eyebrow; for the current surface it is **YOUR AI WORKFLOW**.
4. Workflow-specific content comes from the workflow definition; the surface owns the eyebrow and the page composition stays fixed:

| Element | Field on `Workflow` | Today |
|---|---|---|
| Title (`h1`) | `label` | `WorkflowPage` renders `workflow.label` |
| Description | `description` | Dynamic already |
| Sample document | `sample: { url, filename }` | From the workflow registry |
| Options and Guide tab content | `options`, `guide` | From the workflow registry; options are user-changeable behavior, while static handling information belongs in Guide |

5. The upload button submits to that workflow. `uploadId` (from the registry entry for the selected workflow) is sent as the `workflow` field. No other control decides which workflow runs.

### 4.1. Page composition

`WorkflowPage` renders the same layout for every workflow. The page is a two-column shell: a header that identifies the workflow, a left column that owns all user action and dynamic execution state, and a right contextual panel that stays static across the workflow's lifecycle.

```text
[ eyebrow ]  [ workflow label (h1) ]
[ surface disclaimer — "Private processing. Files deleted on a clear schedule. Outputs you can review." ]

[ upload-column (7fr) ]        [ upload-aside (5fr) ]
┌ action column ───────────┐   ┌ contextual panel ─────────────┐
│ input (FileIntake)        │   │ workflow title (h2)            │
│ selected-file / readiness │   │ description                    │
│ verification              │   │ Guide / Options tabs           │
│ submit                    │   │   Guide — first, default       │
│ progress                  │   │   Options — only when the      │
│ errors                    │   │   workflow defines user-       │
│                           │   │   changeable options; omitted  │
│                           │   │   when the array is empty      │
│                           │   │ tier notice                    │
└───────────────────────────┘   └───────────────────────────────┘
```

- **Header identifies the workflow.** The eyebrow is a constant (`surface.copy.workflowEyebrow`, always **YOUR AI WORKFLOW**); the `<h1>` is `workflow.label`. The workflow description appears once, in the contextual panel only — never repeated in the header or the action column.
- **Left column owns action and execution state.** Input, selected-file/readiness, verification, submit, progress, and errors all live in `upload-column` (the `children` prop). This is the only part of the page that changes as the user works.
- **Right panel order is fixed.** Title, description, then Guide/Options tabs, then the tier notice. The tier notice renders only for guest users with limits.
- **Guide is first and default.** `panel` defaults to `"guide"` and the tab list is `["guide", "options"]`.
- **Options is conditional.** `Options` renders only when `workflow.options.length > 0`; when the array is empty the panel shows Guide alone. Options describe only user-changeable behaviour, in plain-language outcome labels — not processor terminology.
- **Dynamic execution state stays left.** Switching workflows or advancing a job never reorders the layout; the aside is static.
- **Mobile.** At `≤850px` the layout collapses to a single column in DOM order, so the action column precedes the contextual panel.

Consequences for the code:

- `WorkflowPage` reads everything above from the `Workflow` it is given. The eyebrow string is a constant inside it.
- `Playground` is the only page. It reads `?workflow=`, picks `WorkflowShell` (artifact workflows) or the redaction flow (`prepare-doc`) from the registry, and renders it inside `WorkflowPage`.
- `FileIntake` takes the sample as a prop. It no longer owns a sample URL.
- `HandlingPanel` takes `options` and `guide` content from the workflow. It no longer holds redaction copy.
- Sidebar links are always `/playground/?workflow=<id>`. `Workflow.route` is removed.
- Old URLs get a `replace` redirect to the canonical form. `/mvp/transaction-intake` and `/playground/transaction-intake` redirect to `/playground/?workflow=transaction-intake`. `/mvp/` stays the standalone redaction MVP.
- The `prepare-doc` result uses `/playground/jobs/:jobId`. `transaction-intake` renders its artifact inline at `/playground/?workflow=transaction-intake`. Other workflows' result navigation depends on implementation.
- `disabled: true` entries stay visible in the sidebar and show "Coming soon" until the gateway plugin ships.
- The panel registry associates the panel with its accept function from `src/lib/api.ts`, so the generic page can resolve both from one id.

### 5. Data handling

- Panels render tokens (`[PERSON_1]`, `[DATE_TIME_…]`) and metadata only. The panel never receives, fetches or reconstructs source text.
- Source files stay in the in-memory client map used for local preview. Workflows do not upload them a second time.
- Do not log artifact bodies, job IDs tied to user identity, or file names to the console or analytics.
- If `job.workflow.sensitive` is true, panels must honor the sensitivity flag. Persistence and user-facing handling requirements are not specified here.

### 6. Limits, tiers and errors

- Workflows use the existing gateway tier limits (`max_bytes`, `jobs_per_day`) through the existing tier notice in `WorkflowPage`. No per-workflow capability gating.
- Errors use `friendlyError` and the shared `Alert`. There is no per-workflow error taxonomy.
- Result fetches are treated as read-once and never automatically retried. A remount can reuse the in-memory promise until reset, purge, or server expiry; reset discards the source and result immediately. A discarded result is not fetched again.

### 7. Trust and legal copy

- Before a workflow is enabled, add its claims to `TRUST-CLAIMS.md` with evidence from `tool-parse`. Panel and registry copy may say only what is recorded there.
- Output is automated detection, never a completeness guarantee. Each panel shows a "review before use" line and surfaces `review` and `not_found` items rather than hiding them.
- Do not use "private processing" or similar unverified language.

### 8. Contract changes happen live-first

- The source of truth is the deployed gateway. Verify the shape against a real artifact blob before writing types or fixtures.
- Update `API-CONTRACT-v2.md` in the same change as the type. Never let docs lead code.
- Tests include a fixture copied from a real artifact (synthetic documents only). A fixture invented from the contract draft is not sufficient.

## Definition of done for a new workflow

1. `tool-parse` manifest and plugin shipped, and a live artifact blob inspected.
2. Registry entry enabled, with `uploadId` equal to the manifest `id` and `title`, `description`, `sample`, `options`, `guide` filled in. The sample is a synthetic document.
3. `TransactionArtifact`-style type, accept function and `API-CONTRACT-v2.md` entry updated from the live shape.
4. Panel renders the artifact only, with a test using a real-shaped fixture. Tests for the mismatched-workflow and unknown-version paths exist.
5. `TRUST-CLAIMS.md` updated and panel copy checked against it.
6. `npm test` and `npm run build` pass. Container rebuilt with the production `VITE_TURNSTILE_SITEKEY`.
7. One authenticated or Turnstile-valid upload in a browser at desktop and 375px widths. HTTP 200 alone is not proof.

## Consequences

**Good**
- A new workflow is one registry entry, one panel, one type and one manifest.
- The shared lifecycle gets exercised by every workflow, so a bug fix lands everywhere.
- Contract drift has a defined check (live blob first).

**Costs**
- A workflow needing multi-step input (options form, template choice, review and approve) does not fit this shell. It requires a new ADR.
- Failing closed on unknown artifact versions means gateway deploys can break the UI until the panel is updated. Coordinate releases.
- Moving the accept function beside the panel splits a type and its check across two files.
- Moving to `?workflow=` is a route change for Transaction Intake. Legacy `/playground/transaction-intake` redirects to `/playground/?workflow=transaction-intake`; redirects cover old links.
- Workflow copy (title, guide, options, sample) moves into the registry. The registry stops being a small data file and needs a review of every entry when copy changes.

## Open questions

1. **Query parameter name.** The ADR keeps `?workflow=<id>` because the code already uses it. Say if you want a different name.
2. **"On button click" (point 5).** I read this as the upload button submitting the selected workflow. If you meant a sidebar-bottom control, tell me.
3. **Options.** Manifests carry `options_schema`. Transaction Intake takes none. Do we render an options form from the schema (cost: a JSON-schema renderer) or hand-write per workflow (cost: duplication)? Defer until a workflow needs options.
4. **Workflows that cannot work from tokens alone.** Case analysis may need the original text. That crosses the data-handling rules in decision 5 and needs its own ADR and trust review.
5. **Is `evidence` part of the public contract?** The live service returns it (`{page, ocr}`), but the contract draft omits it, and the panel does not use it.
6. **Stale contract draft.** `API-CONTRACT-v2.md` still shows `artifact.workflow` and omits `evidence`. Fix with this ADR or separately?
