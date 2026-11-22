# Phase 3 repair plan — close review findings

## Objective

Bring the Phase 2 workflow work into spec and standards compliance while preserving existing safe-working-copy behavior and anonymous Transaction Intake access.

Target boundary:

```text
workflow registry/data
        ↓
static page-level resolver
        ↓
workflow-neutral lifecycle
        ↓
typed workflow panel/result adapter
```

No remote plugins, backend changes, API redesign, template picker, or read-once backend enforcement.

Implementation note: `JobPlayground` keeps its dedicated 3-second result-page poll and markdown/report expiry/read-once caches. `useWorkflowJob` owns upload/lifecycle polling for upload and artifact-shell paths; forcing result fetching through it would merge incompatible artifact lifecycles.

## Phase 3 defect checklist

These three known defects are explicit gates, not incidental side effects:

1. Sidebar Transaction Intake link resolves to `/playground/?workflow=transaction-intake`; Transaction Intake is a child workflow of /playground.
2. Upload sends `workflow.id` for every non-default workflow. For Transaction Intake, expected value is `transaction-intake`; safe-working-copy preserves its existing default behavior.
3. Failed-workflow guard reads confirmed nested field `job.workflow.status` from Phase 0. Artifact fetch must not run unless that status is `completed`.

Verify each with focused tests before broader refactoring.

## Review findings being fixed

1. Missing explicit panel contract and `TransactionIntakePanel`.
2. Missing static resolver map.
3. Unknown workflow silently falls back to safe-working-copy.
4. Disabled workflows can still reach an upload path.
5. Safe-working-copy lifecycle is not shared and its upload semantics may have regressed.
6. `WorkflowShell` is incorrectly coupled to `TransactionArtifact`.
7. Transaction `template` and `warnings` are not rendered.
8. Workflow-shell fixture bypasses API types with `as unknown as`.
9. API contract example omits required nested workflow fields.
10. Existing commit prefix is historical and will not be rewritten; all new commits use literal repo prefixes (`feat:`, `fix:`, `test:`, `docs:`).

## Implementation strategy

### Step 0 — freeze current behavior and contracts

Read and record before editing:

- `src/pages/Playground.tsx` upload argument and navigation.
- `src/pages/JobPlayground.tsx` polling, markdown/report reads, delete, expiry, and source preview.
- `src/components/HandlingPanel.tsx` options/guide behavior.
- `src/lib/api.ts` `Job`, `TransactionArtifact`, `Report`, and upload contracts.
- `docs/API-CONTRACT.md` and `docs/API-CONTRACT-v2.md`.

Acceptance: identify the exact safe-working-copy upload value expected by existing tests/backend. Do not infer equivalence from omission.

### Step 1 — fix contract documentation and typed fixtures first

1. Update the `API-CONTRACT-v2.md` artifact example so nested `workflow` contains the required fields (`id`, `version`, `status`, `error_code`, `sensitive`), or explicitly marks optional fields as optional.
2. Replace the shell-test double assertion with a complete `TransactionArtifact` fixture containing every required field (`workflow`, `artifact`, `warnings`, `evidence`).
3. Add/adjust types only if the actual frozen API contract requires it; do not loosen types to make the fixture compile.

Gate: typecheck and the focused shell tests pass.

### Step 2 — make workflow resolution explicit and fail closed

1. Change workflow lookup so query/route parsing distinguishes:
   - known enabled workflow;
   - known disabled workflow;
   - unknown workflow.
2. Do not change `getWorkflow()` globally unless callers can safely handle a missing result. Prefer a `findWorkflow()`/resolver result that preserves the current default only where the default is intentional.
3. Add a static resolver map outside `src/lib/workflows.ts`, for example a page-level map keyed by known workflow IDs. The map may import React components; the registry remains data-only.
4. Render an unavailable state for disabled or unknown workflows before `FileIntake` is mounted. No upload callback may be reachable.
5. Keep `/mvp/transaction-intake` as the explicit Transaction Intake route, but have its page resolve the panel through the same static map rather than hardcoding presentation ownership.

Gate: tests prove unknown and disabled workflows show unavailable state and `upload` is not called.

### Step 3 — extract the transaction panel

Create `src/components/TransactionIntakePanel.tsx`.

Panel contract should be explicit and narrow:

```ts
type WorkflowPanelProps = {
  workflow: Workflow
  job: Job
  artifact: TransactionArtifact
  onReset: () => void
}
```

Use the smallest compatible equivalent, but do not hide `job`/`onReset` inside a render-prop closure.

Panel responsibilities only:

- heading and workflow/template identity;
- transaction field table;
- `found`, `not_found`, and `review` presentation;
- warnings from the artifact;
- panel-specific reset action if required.

It must not call `upload`, `getJob`, or `fetchArtifact`.

Gate: panel unit/render test verifies template and warnings, and API mocks prove no lifecycle calls originate from the panel.

### Step 4 — make the lifecycle workflow-neutral

Refactor `WorkflowShell` or extract a shared lifecycle primitive so it does not import or mention `TransactionArtifact`.

Preferred shape:

- lifecycle owns `Job | null`, busy/error state, polling, terminal state, workflow failure guard, artifact request, reset, and request dedupe;
- a typed result adapter/renderer supplies:
  - artifact request function or result type;
  - result validation;
  - panel component/render function.

Do not add a generic abstraction merely for hypothetical future plugins. The abstraction is justified here because safe-working-copy and transaction use different result contracts.

Keep read-once dedupe at the shared lifecycle boundary. Preserve the existing StrictMode behavior.

Gate: transaction shell tests still pass; shell source has no `TransactionArtifact` import.

### Step 5 — share lifecycle with safe-working-copy without merging artifact UIs

Use the smallest architecture that satisfies the spec:

- shared lifecycle primitive handles upload/polling/terminal/error/reset;
- safe-working-copy keeps its existing markdown/report/source-preview result UI;
- transaction uses its typed transaction panel;
- no duplicated upload/polling implementation remains in the two workflow entry points.

Restore or prove the safe-working-copy upload argument. Existing behavior must continue to send the expected workflow field. Add a regression test asserting the exact third argument to `upload`.

Do not move markdown/report/delete/source-preview UI into the transaction panel.

Gate: existing `job-playground` tests plus safe-working-copy upload test pass.

### Step 6 — complete focused coverage

Add or update tests for:

- full typed transaction artifact fixture;
- template identity rendering;
- warnings rendering;
- unknown workflow unavailable state;
- disabled workflow unavailable state;
- no upload for either unavailable state;
- static resolver selects Transaction Intake panel;
- sidebar Transaction Intake link targets `/playground/?workflow=transaction-intake`;
- upload carries the registry workflow ID for non-default workflows;
- safe-working-copy upload argument compatibility;
- failed workflow skips artifact endpoint;
- unknown artifact/schema fails closed;
- StrictMode performs one artifact request per job.

Avoid tests that depend on wall-clock dates. Use relative future dates or fake timers consistently.

### Step 7 — verification and review

Run, in order:

1. focused workflow/resolver tests;
2. `npm test`;
3. `npm run build`;
4. `git diff --check`;
5. inspect `git diff 76e046c...HEAD` for scope creep;
6. run standards/spec review again.

Commit in small conventional commits, using literal prefixes only:

- `docs: complete workflow artifact contract example`
- `test: use complete typed workflow fixtures`
- `fix: fail closed for unknown and disabled workflows`
- `feat: share workflow lifecycle across result panels`

Do not rewrite existing local history unless explicitly requested.

## Acceptance criteria

- Sidebar Transaction Intake link uses `/playground/?workflow=transaction-intake`.
- Non-default workflow upload includes the exact registry workflow ID.
- Failed-workflow guard uses confirmed nested `job.workflow.status` and skips artifact fetch unless it is `completed`.
- Transaction route resolves a dedicated `TransactionIntakePanel` through a static map.
- Panel contract exposes `workflow`, `job`, `artifact`, and `onReset` (or a demonstrably equivalent typed boundary).
- Panel makes no lifecycle/API calls.
- Shared lifecycle owns upload, polling, workflow failure guard, artifact fetch, dedupe, reset, and common status/error UI.
- Shared lifecycle has no transaction-specific artifact dependency.
- Safe-working-copy behavior and upload semantics remain unchanged.
- Unknown and disabled workflows show unavailable state and cannot upload.
- Transaction template and warnings render.
- Unknown artifact/schema never renders as transaction output.
- StrictMode makes at most one artifact request per job.
- Anonymous Transaction Intake remains supported.
- `npm test`, `npm run build`, and `git diff --check` pass.

## Explicit non-scope

- Remote plugin loading or installation.
- New workflows beyond Transaction Intake and Safe Working Copy.
- Backend/tool-parse changes.
- API contract redesign.
- Read-once enforcement in the backend.
- Login, billing, or tier changes.
