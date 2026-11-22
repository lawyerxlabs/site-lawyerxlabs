# ADR 0008: Consistent processing experience across workflows

**Status:** Accepted (2026-10-31)
**Date:** 2026-10-31
**Applies to:** LawyerLab workflow processing presentation; existing workflow protocols remain authoritative
**Relates to:** ADR 0001, ADR 0005, [processing experience specification](../PROCESSING-EXPERIENCE.md)
**Implementation:** Partial evidence: shared processing UI and multiple workflow integrations exist in the repository. Complete coverage, acceptance criteria and deployment are not verified here.
**Last verified:** 2026-11-02: inspected `ProcessingState` callers in the frontend and its component test; no tests were run for this documentation update.
**Review triggers:** Changes to processing presentation, workflow lifecycle or accessibility behavior.

## Context

At the decision date, workflow panels presented pending work differently. `JobStatus` reported job states, `JobWorkflowPanel` reported base and workflow states, while transaction, term isolation and HR panels mostly exposed a pending request without finer server stages. These workflows have different session, source and result lifecycles (ADR 0005). A uniform visual treatment must not imply that their protocols or retention behavior are uniform.

Romesh agreed to a dedicated processing view after source submission and the same pattern inline after intermediate decisions, retaining relevant context. This is a presentation decision; the linked specification states requirements and verification limits. Server behavior and page-close outcomes have not been independently verified for every workflow.

## Decision

1. After an accepted source submission begins, show a dedicated processing view in the workflow frame. After an intermediate decision begins an operation, show the same processing pattern inline with relevant review context retained. Explain the operation in workflow-specific language.
2. Show only states actually reported by the applicable operation or protocol. When no finer status is exposed, show one pending message and an indeterminate indicator. Do not invent percentages, timed stage changes, completion estimates, or handling claims.
3. Make status changes accessible and errors understandable. Offer only recovery actions supported by that workflow and failure state. Page-open guidance requires verified lifecycle evidence.
4. Preserve each workflow's access, privacy, source ownership, cancellation, concurrency, cleanup, result and read-once semantics. Shared presentation must not introduce a universal lifecycle or alter endpoints.

## Alternatives considered

- Keep each existing presentation: avoids migration but leaves inconsistent feedback and accessibility across workflows.
- Simulate a common sequence or percentage: rejected because it could describe work that has not happened.
- Force all workflows through one job lifecycle: rejected because session and one-shot workflows have different contracts and cleanup rules.

## Consequences

**Good**
- Users get consistent, truthful feedback while workflow-specific contracts remain intact.
- A shared presentation can improve accessibility without unifying transports.

**Costs**
- Each panel needs explicit state mapping and regression coverage; the specification limits initial scope and requires a separate audit for other registered panels.
- Lifecycle-dependent wording remains unavailable until verified; the implementation must omit it in the meantime.

## References

- [Processing experience specification](../PROCESSING-EXPERIENCE.md)
- `src/components/JobStatus.tsx`, `src/components/JobWorkflowPanel.tsx`, `src/lib/pollJob.ts`, `src/lib/useWorkflowJob.ts`
- `src/components/TermIsolation.tsx`, `src/pages/TransactionReview.tsx`, `src/pages/HrHiring.tsx`, `src/pages/HrOnboarding.tsx`
