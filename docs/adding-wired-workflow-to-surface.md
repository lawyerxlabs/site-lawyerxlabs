# Add an existing workflow to a surface

Use this guide to expose an already wired workflow on another LawyerLab surface or workspace. A surface is a build-time profile selected by `VITE_SURFACE`; it is not an authorization boundary. For a workflow that is not wired end to end, use the new-workflow path below.

## Read and identify

1. Identify the requested workflow's frontend ID, backend ID (if any), destination surface, and intended audience. Inspect `src/lib/workflows.ts`, the destination profile in `src/surfaces/`, and `src/lib/workflowPanels.ts`. Confirm the existing lifecycle and that the request actually authorizes exposure to that audience.
2. Read tool-parse `docs/ADR-007-workflow-template.md`, then [ADR 0006](adr/0006-workflow-template.md), [ADR 0005](adr/0005-workflow-catalog-surface-intake.md), and [DICTIONARY.md](../DICTIONARY.md). Follow workflow-specific ADRs and route documentation for special lanes. The repositories communicate over HTTP; refer to tool-parse by repository name, not a relative repository link.
3. Confirm the workflow is implemented and enabled for the intended deployment: check its panel, backend route and capability, deployment allowlist or other flags, and any unresolved release blockers. A catalog entry, a panel, or a visible card alone does not prove that it can run. Preserve the existing authorization and processing policy; surface exposure does not grant access.

## Register and check the gates

1. Add the existing frontend ID to the destination profile's `workflows` in `src/surfaces/`. If the destination is new, register its profile in `src/surfaces/index.ts` and confirm its selection and navigation. The current resolver filters in catalog order, not profile-list order. Add only supported copy overrides or narrower input modes under the surface contract; effective modes are an intersection. Do not change backend identity, protocol, authentication, or capabilities in a surface override.
2. Confirm the existing explicit `WORKFLOW_PANELS` entry matches the lifecycle: job entries use the job shell and result guard; own-frame entries own their session or other lifecycle. Capability metadata does not choose a panel or transport. Reuse the existing panel and its safeguards rather than registering a second lifecycle for the surface.
3. Trace `getWorkflow`, `getRoutableWorkflow`, `useWorkflowCapabilities`, and `Playground` for the chosen ID. Disabled entries can be displayed as launching soon but cannot mount intake; unknown or surface-excluded IDs are unavailable on direct URLs. A successful backend catalog response that omits a backend-backed ID makes it unavailable. Discovery failure uses static fallback and defaults identity to protected; capability restrictions and workflow-specific gates still apply. Check that empty or incompatible effective intake cannot submit and that protected flows do not mount before authentication resolves. Visibility is presentation policy, not permission to process data.
4. Check special cases before exposure. `agreement-review` is disabled and requires its exact public, protected-document, fixed-pseudonymisation capability before mounting; tool-parse ADR-007 records release blockers. `term-isolation` is a protected, presentation-only frontend entry with a dedicated own-frame raw lifecycle and no public backend catalog ID. Tool-parse ADR-009 describes its hidden raw lane and release conditions; do not infer readiness from the frontend entry. ADR 0006's general statement that a null `backendId` must be disabled does not describe this existing exception. Do not use that exception as a template for a new workflow. Check the current workflow-specific contract and rollout state for any other hidden or special workflow.

## Verify

- Add or update focused tests for the destination profile and direct query URLs, including exclusion on other surfaces, disabled/unavailable behavior, identity and capability gates, and the existing lifecycle where relevant. Check surface-specific samples and copy do not leak or widen capability.
- Run `npm test` and `npm run build` in site-lawyerlab. Run the relevant tool-parse tests if backend or deployment configuration changes. Inspect the diff and preserve unrelated work.
- For an authorized deployment, follow the unified deployment guide and perform an appropriate synthetic, authenticated or anonymous smoke test for the actual policy. Verify the relevant capability/allowlist and the full processing and cleanup path; a page HTTP 200 is not proof of processing. Report checks not performed.

## If the workflow is not yet wired

Use the interview, lane selection, backend builder, route, policy and test checklist in tool-parse ADR-007 and the frontend template in ADR 0006; the `Adding a workflow` section of AGENTS.md gives the cross-repository sequence. Resolve required identity, guest, PII, handling and rollout decisions with the user where unknown. Build and verify the backend contract and lifecycle before exposing the workflow. Keep display-only entries disabled unless an existing, explicitly documented exception applies; do not make a surface registration stand in for backend implementation or release approval.
