# Workflow policy reconciliation decisions

**Status:** Reconciliation tracker, 2026-11-02. The owner choices below set intended direction; they do not change existing contracts, authorize deployment or prove implementation. Backend and operator evidence is required before migration or release. Existing contracts retain their documented behavior until a separately reviewed migration.

## Owner choices, 2026-11-02

Source: product owner's answers in the documentation reconciliation conversation on 2026-11-02. These choices are recorded here pending their incorporation in the relevant decision records; no other workflow-specific approvals or exceptions are implied.

- **Screening:** Retain 0017's minimum: reject Category 1 information or five or more distinct people and pseudonymise other detected personal information. Review the treatment of location and dates per workflow. Detector coverage and enforcement remain to be verified.
- **Models and providers:** [ADR 0019](0019-model-provider-selection.md) records the choice of an approved local or hosted provider per LLM workflow, superseding 0017's local-model default. Provider terms, account settings and workflow-specific approval remain necessary.
- **Term isolation:** Defer the exception-versus-migration decision until the raw route is verified.
- **Existing HR Hiring:** Defer the handling decision until the effective backend configuration is verified.
- **Guest eligibility:** Require explicit approval per workflow, including Hiring v2. This choice does not itself grant Hiring v2 guest approval or satisfy release gates.
- **Guest results:** Use availability through 15-minute expiry as the intended default; review exceptions per workflow. Existing read-once contracts remain in effect until a separately reviewed migration.
- **Onboarding session:** Adopt the shared intended limits of 30 minutes idle and 60 minutes maximum. Verify the existing lifecycle and review migration before treating these limits as implemented.

The tables below preserve the original questions and evidence needed; read their decision-needed column alongside these owner choices and the remaining workflow-specific questions.

## Source review, 2026-11-02

Read-only inspection of site-lawyerlab `300416d` and tool-parse `e4c1896`; working trees contained other changes. This is source evidence, not proof of deployed configuration or end-to-end behavior. No tests were run for this review.

- **Term isolation:** tool-parse `src/api/server.js` requires member identity, validates one PDF/DOCX and extracts locally without the shared screening step. `src/api/raw-store.js` holds owner-scoped artifacts in memory for 15 minutes and removes the live payload on take or expiry; `test/raw-route.js` contains route coverage. Gateway enforcement, all failure paths and deployed behavior remain unverified. The exception decision remains deferred.
- **HR Hiring:** tool-parse `src/api/server.js` reads `TOOL_PARSE_OFF_WORKFLOWS` at startup; its screening function retains the original text for `off` after applying the configured rejection rules. The effective operator configuration and running catalog were not checked, so the handling decision remains deferred.
- **Onboarding:** tool-parse `src/api/onboard-session.js` uses `HR_SESSION_TTL_MS`, defined as 15 minutes in `src/api/hr-session.js`, sets a fixed expiry at creation, and drops stored texts on discard or expiry. The selected 30-minute idle / 60-minute maximum policy requires a reviewed migration; deployment is unverified.
- **Guest results:** tool-parse `src/jobs/orchestrator.js` records anonymous markdown and report reads and purges when both are read. That source evidence does not establish all result endpoints, storage deletion or deployed behavior; preserve the existing contract until migration.
- **Processing UI:** The shared component is referenced by the scoped job, term isolation, transaction and HR panels in the frontend; the component has a test. This is not verification of all acceptance criteria, accessibility, browser behavior or deployment.

## 1. Screening and model use — highest priority

| Scope and evidence | Recorded direction and difference | Decision needed from product owner | Evidence needed before release |
|---|---|---|---|
| All workflows; [0017](0017-common-workflow-baseline.md#access-and-screening), [0018](0018-llm-data-handling-policy.md#open-conflicts-with-0017) | 0017 calls for Category 1 and five-person rejection plus pseudonymisation. 0018 records an onboarding entity list and threshold, without that rejection rule; its LOCATION/DATE_TIME treatment differs from observed Hiring screening. | Reconcile the minimum rejection and entity rules, and identify approved workflow-specific stricter rules or exceptions. | Detector coverage and fail-closed behavior per workflow; effective configuration and tests. |
| LLM workflows; [0017](0017-common-workflow-baseline.md#processing-and-edits), [0018](0018-llm-data-handling-policy.md) | 0017 defaults to a local model; 0018 carries an onboarding hosted-provider sign-off and says its applicability to other uses remains open. | Decide the default and which workflow-specific provider/model exceptions require separate sign-off. Until resolved, 0018 requires a recorded sign-off for each new LLM use. | Verify provider/account retention and written terms, model alias target, data flow and operator configuration. 0018 says its ZDR basis was not verified. |
| Term isolation; [0005](0005-term-isolation.md) | Its protected raw route crosses 0017's intended screening boundary. | Decide whether to approve a bounded exception or migrate the workflow to the baseline; define permitted scope and safeguards. | Verify authorization, raw-data handling, temporary storage, deletion and failure paths. |
| Existing `hr-hiring`; [staged contract](../hr-lab/STAGED-HR-API-CONTRACT.md#handling-capability-and-screening), [0008](0008-job-description-review.md) | The current contract describes selectable handling, including conditionally enabled `off`; 0017 requires pseudonymisation of detected personal information. Screening and prohibited-category rejection still apply under `off`. | Decide whether this workflow needs a documented exception or a migration to the baseline, preserving compatibility until reviewed. | Verify effective catalog and backend configuration, screening coverage, session ownership and affected clients. |

## 2. Guest access and result lifecycle

| Scope and evidence | Recorded direction and difference | Decision needed from product owner | Evidence needed before release |
|---|---|---|---|
| Guest eligibility; [0017](0017-common-workflow-baseline.md#access-and-screening), [Hiring v2 0001](0001-hiring-v2-intake-and-handoff.md), [ADR 0006](../adr/0006-workflow-template.md) | 0017 leaves selection of guest workflows open. Proposed Hiring v2 describes guest pseudonymisation and one-time member handoff; existing `hr-hiring` remains member-only. | Decide selection criteria and whether Hiring v2 is eligible, subject to its explicit release gates; record other approved exceptions individually. | Server-enforced access, owner isolation, handoff atomicity, screening and abuse controls; verify legacy route compatibility. |
| Guest results; [0017](0017-common-workflow-baseline.md#results-and-sessions), [MVP contract](../API-CONTRACT.md), [Alias 0002](0002-alias.md) | Intended guest results remain available until 15-minute expiry; the frozen MVP contract describes read-once results and current retention semantics. | Decide which workflows migrate and whether a documented exception is required; define compatibility and rollout before changing the existing contract. | Trace result consumption, expiry, deletion and failure behavior in the backend and clients; verify migration and rollback. |

## 3. Member session expiry

| Scope and evidence | Recorded direction and difference | Decision needed from product owner | Evidence needed before release |
|---|---|---|---|
| Onboarding; [0017](0017-common-workflow-baseline.md#results-and-sessions), [proposed onboarding contract](../hr-lab/ONBOARDING-V1-API-CONTRACT.md), [0009](0009-onboarding.md) | 0017 intends 30 minutes idle and 60 minutes maximum; the proposal specifies a fixed 15-minute TTL. Contract coverage and deployment are not established. | Decide whether onboarding adopts the shared limits or has an approved exception; define warning and local-copy behavior. | Verify actual session timeout, cleanup, ownership and failure behavior against the chosen contract. |

## Recording outcomes

Record the decision, owner, date, affected workflow and evidence in the relevant decision record. A changed architectural decision requires a new ADR with an explicit supersession or deprecation link; do not rewrite historical decisions. Keep implementation and deployment status separate. Update this list when a decision is recorded, linking to its authoritative record and any remaining migration or verification work.
