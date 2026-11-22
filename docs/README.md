# docs index

## Authority and freshness

Read documents within their stated scope. A newer date or a canonical label does not by itself supersede an accepted decision or prove implementation. Resolve stated conflicts explicitly; proposed decisions do not authorize release. Code and tests provide implementation evidence for the revision inspected, while deployment requires separate operational verification.

| Subject | Starting point | Authority and limits |
|---|---|---|
| MVP gateway | [Frozen MVP contract](API-CONTRACT.md) | Current documented redaction contract; [v2](API-CONTRACT-v2.md) is a draft with conditional future supersession. |
| Workflow policy | [Common baseline 0017](workflowadr/0017-common-workflow-baseline.md) and [LLM policy 0018](workflowadr/0018-llm-data-handling-policy.md) | Intended baseline and policy record, respectively; 0018 lists unresolved conflicts. Existing contracts retain their documented behavior until reviewed migration. |
| Workflow-specific decisions | [Workflow records](workflowadr/README.md) | Individual records state their status and cite existing decisions; proposed records do not establish implementation. |
| Architecture | [ADRs](#adrs) | Accepted decisions apply within their stated scope; proposed records are not accepted. Preserve historical decisions and identify explicit supersession. |
| Deployment | [Unified deployment guide](../deploy/unified/README.md) and [ADR 0007](adr/0007-deployment-ownership.md) | Operational procedure and accepted ownership decision; check the actual runtime separately. |
| HR contracts | [HR lab](#hr-lab) | The staged Hire and review-artifact contracts describe their stated implemented/compatibility scopes; the shared and onboarding contracts are proposals. |

For new or materially revised documents, record **Status**, **Scope/authority**, **Implementation** (including partial or unknown where applicable), and **Last verified** with dated evidence or “not verified.” Distinguish deployed status where relevant. Mark mixed-state sections individually; a review date alone does not prove freshness. Link the decision or successor and identify changes that require re-review. See the [ADR template](adr/TEMPLATE.md).

## Contracts
- [API-CONTRACT.md](API-CONTRACT.md) — frozen MVP gateway contract
- [API-CONTRACT-v2.md](API-CONTRACT-v2.md) — draft gateway limits, identity, tiers; conditional future supersession
- [MODEL.md](MODEL.md) — access and pricing decisions

## Deployment & ops
- [POINTERS.md](POINTERS.md) — deployment keys, env, Turnstile pointers
- [DEPLOYMENT-PROFILES.md](DEPLOYMENT-PROFILES.md) — deployment profiles
- [SMOKE-TEST.md](SMOKE-TEST.md) — post-deploy smoke test

## Design & branding
- [BRANDING.md](BRANDING.md) — brand rules
- [DESIGN.md](DESIGN.md) — design system
- [ELEMENTS.md](ELEMENTS.md) — UI element reference
- [SIGNAL-SURFACE.md](SIGNAL-SURFACE.md) — Signal Lawyers surface
- [REVIEW-WORKSPACE.md](REVIEW-WORKSPACE.md) — shared result-screen layout contract
- [PROCESSING-EXPERIENCE.md](PROCESSING-EXPERIENCE.md) — agreed processing UX specification; implementation coverage requires verification
- [mock-up-v3/index.html](mock-up-v3/index.html) — static design mock-up

## Trust & product
- [TRUST-CLAIMS.md](TRUST-CLAIMS.md) — verified customer-facing trust claims

## ADRs
- [workflowadr/README.md](workflowadr/README.md) — workflow-specific records, intended baseline and LLM policy; statuses vary
- [adr/TEMPLATE.md](adr/TEMPLATE.md) — template for new ADRs
- [adr/0001-common-workflow-design.md](adr/0001-common-workflow-design.md) — common workflow design (accepted)
- [adr/0002-logto-auth-sidecar.md](adr/0002-logto-auth-sidecar.md) — Logto auth sidecar (accepted)
- [adr/0003-manage-pilot-transport.md](adr/0003-manage-pilot-transport.md) — Manage pilot transport (proposed)
- [adr/0004-hr-onboarding-workflow.md](adr/0004-hr-onboarding-workflow.md) — HR Onboarding workflow (proposed)
- [adr/0005-workflow-catalog-surface-intake.md](adr/0005-workflow-catalog-surface-intake.md) — workflow catalog and surface intake (accepted)
- [adr/0006-workflow-template.md](adr/0006-workflow-template.md) — workflow template and agent interview (accepted)
- [adr/0007-deployment-ownership.md](adr/0007-deployment-ownership.md) — unified deployment ownership (accepted; cutover completed 2026-10-31)
- [adr/0008-processing-experience.md](adr/0008-processing-experience.md) — processing experience (accepted; implementation coverage requires verification)

Retired records live in [archive/](archive/), e.g. [archive/0002-logto-auth-sidecar-plan.md](archive/0002-logto-auth-sidecar-plan.md). They are historical context, not current instructions.

## HR lab
- [hr-lab/SHARED-WORKFLOW-CONTRACT.md](hr-lab/SHARED-WORKFLOW-CONTRACT.md) — shared HR workflow contract
- [hr-lab/REVIEW-ARTIFACT-CONTRACT.md](hr-lab/REVIEW-ARTIFACT-CONTRACT.md) — review artifact contract
- [hr-lab/ONBOARDING-V1-API-CONTRACT.md](hr-lab/ONBOARDING-V1-API-CONTRACT.md) — onboarding API contract v1 (proposal)
- [hr-lab/STAGED-HR-API-CONTRACT.md](hr-lab/STAGED-HR-API-CONTRACT.md) — staged HR API contract (implemented v1)
- [hr-lab/ONBOARDING-RESULT-PANEL-DESIGN.md](hr-lab/ONBOARDING-RESULT-PANEL-DESIGN.md) — onboarding result panel design
- [hr-lab/HIRE-SPEC.md](hr-lab/HIRE-SPEC.md) — hiring workflow spec
- [hr-lab/MANAGE-SPEC.md](hr-lab/MANAGE-SPEC.md) — management workflow spec
- [hr-lab/EXIT-SPEC.md](hr-lab/EXIT-SPEC.md) — exit workflow spec

## Research
- [research/datalab-pricing.md](research/datalab-pricing.md) — Datalab pricing review
- [research/page-images-handoff.md](research/page-images-handoff.md) — page-images handoff notes
