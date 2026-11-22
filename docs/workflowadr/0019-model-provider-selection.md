# Workflow ADR 0019: Approve model providers per workflow

**Status:** Accepted by product owner, 2026-11-02.
**Applies to:** Intended provider selection for LLM workflows. This decision supersedes only the local-model default in [0017](0017-common-workflow-baseline.md#processing-and-edits); its other decisions remain subject to their stated scope and reconciliation.
**Implementation:** Not established. Existing contracts and deployments do not change through this record.
**Last verified:** Owner choice recorded in the documentation reconciliation conversation on 2026-11-02; provider terms, account settings and implementation were not verified.

## Context

0017 sets a local-model default with approved exceptions. [0018](0018-llm-data-handling-policy.md) records an onboarding hosted-provider sign-off and unresolved questions about applying it elsewhere. Each workflow has its own processing and data-handling boundaries.

## Decision

Each LLM workflow uses an approved local or hosted provider selected for that workflow; local is no longer the general default. A provider's prior approval for another workflow does not itself approve its use for a new workflow. Record the applicable provider and approval with the workflow. This decision does not approve a specific provider or relax screening and other applicable safeguards.

## Alternatives considered

- **Local by default, hosted by exception:** Not selected; the owner chose approval per workflow without a general preference for local or hosted.
- **A shared hosted default:** Not selected; provider selection and approval remain workflow-specific.

## Consequences

- Each workflow requires an explicit provider decision, including applicable data handling and operational review.
- Provider terms and account settings, including retention where relevant, require verification before real-document use; 0018 records an unverified retention basis for onboarding.
- Existing contracts and runtime behavior remain unchanged until separately reviewed and implemented. Changing the provider or model does not itself grant release approval.

## References

- [0017: Common workflow baseline](0017-common-workflow-baseline.md)
- [0018: LLM data handling policy](0018-llm-data-handling-policy.md)
- [Reconciliation decisions](RECONCILIATION-DECISIONS.md)
