# Workflow ADR 0016: Prepare Onboarding Sequence roadmap

**Status:** Proposed record; existing decisions retain the status of their cited sources.
**Date:** 2026-11-02
**Implementation status:** Historical roadmap; relationship to implemented HR onboarding needs confirmation.

## Context and recorded direction

The roadmap proposes a sequence from role details and employer policies; the separately registered HR onboarding workflow already has a dedicated contract.

## Decisions and alignment to resolve

Decide whether this card is superseded or identifies a distinct workflow. Preserve the rule against invented employer practices or claims of complete obligations; do not assume approved role/start data is an existing input.

Apply the [security characteristics](README.md#security-characteristics) as a checklist. Each item needs an evidence-backed workflow-specific answer or an explicit open decision; this record does not authorize a route, implementation, real-document use or deployment.

## Workflow-specific checklist (2026-11-02)

- **Surface and backend:** The HR Lab roadmap card may overlap the registered onboarding workflow in 0009; distinct identity versus supersession is undecided.
- **Identity and authorization:** Identity and guest eligibility remain open for a separate workflow.
- **Input, screening and confidentiality:** Role details and employer policies are proposed inputs; do not assume the current onboarding contract accepts all roadmap inputs.
- **Lifecycle and deletion:** If separate, expiry, deletion and failure handling remain open.
- **Integrity and human control:** Do not invent employer practices or claim complete obligations; users review outputs.
- **Reliability and release:** Transport, version binding and release validation remain open if this remains distinct.

The intended shared rules are in [0017](0017-common-workflow-baseline.md). For model use, review [0018](0018-llm-data-handling-policy.md) and its unresolved conflicts; neither record proves deployed behavior. Evidence still needed: workflow-specific tests, accessibility and authorized end-to-end verification, provider/operator approvals where applicable, and rollback.

## References

- [../hr-lab/HIRE-SPEC.md](../hr-lab/HIRE-SPEC.md)
- [0009-onboarding.md](0009-onboarding.md)
- Backend owner: tool-parse; consult its current catalog, routes, contracts and deployment gates before changes.
