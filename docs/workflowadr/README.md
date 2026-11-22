# Workflow decision records

These records guide future workflow changes across all surfaces and the shared backend. Hiring v2 provides a reference checklist, not a mandate that every workflow use its guest intake, handling or lifecycle. A proposed record does not grant approval or establish deployed behavior. Existing accepted decisions and API contracts remain authoritative; resolve conflicts explicitly.

## Security characteristics

For every workflow, record the actual approved rule, source and verification or mark it **open**:

1. **Identity and authorization:** guests versus members, server-enforced access, owner and organization isolation, and how handoffs are authorized. A surface catalog is not authorization.
2. **Data minimisation and confidentiality:** permitted sources and fields, sensitive categories, handling in browser, network, logs and telemetry, and approved providers and subprocessors.
3. **Input and screening:** type and size limits, untrusted content, handling modes, detection limits and fail-closed behavior. Pseudonymisation is not a guarantee of anonymity.
4. **Lifecycle and deletion:** storage locations, ownership, expiry, consumption, explicit deletion, backups, cancellation and failure paths. Distinguish a consumed result from confirmed deletion.
5. **Integrity and human control:** provenance, version and approval binding where applicable, output validation, professional review, and restrictions on conclusions or automated decisions.
6. **Reliability and abuse:** quotas, concurrency, atomic transitions, retries and idempotency, safe errors and recovery after uncertain outcomes.
7. **Evidence and release:** tests, accessible interaction, synthetic and authorized-data evaluation, provider and operator approvals, deployment and rollback. Record what has actually been verified.

## Shared baseline and policy

[Reconciliation decisions](RECONCILIATION-DECISIONS.md) lists unresolved policy choices, affected workflows and evidence needed before release.

[0017: Common workflow baseline](0017-common-workflow-baseline.md) is the adopted intended baseline for all workflows.

[0018: LLM data handling policy](0018-llm-data-handling-policy.md) is the canonical LLM provider, screening and retention record. Every workflow that sends screened content to a model starts here. Open conflicts with 0017 are listed in 0018 and are not yet resolved. Existing contracts describe current behavior until migrated; workflow-specific differences and implementation gaps require review. Guest-workflow selection remains open.

[0019: Model provider selection](0019-model-provider-selection.md) supersedes 0017's local-model default: each LLM workflow requires an approved local or hosted provider. Implementation and provider verification remain separate.

## Records

| Workflow | Record | Status |
|---|---|---|
| Hiring v2 | [0001](0001-hiring-v2-intake-and-handoff.md) | Proposed |
| Alias / docalias | [0002](0002-alias.md) | Proposed record |
| Contract review | [0003](0003-contract-review.md) | Proposed record |
| Transaction review | [0004](0004-transaction-review.md) | Proposed record |
| Term isolation | [0005](0005-term-isolation.md) | Proposed record |
| Agreement analysis | [0006](0006-agreement-analysis.md) | Proposed record |
| Case analysis | [0007](0007-case-analysis.md) | Proposed record |
| Structured job-description review / hr-hiring | [0008](0008-job-description-review.md) | Proposed record |
| HR onboarding | [0009](0009-onboarding.md) | Proposed record |
| Performance Management | [0010](0010-performance-management.md) | Proposed record |
| Disciplinary File | [0011](0011-disciplinary-file.md) | Proposed record |
| Accommodation File | [0012](0012-accommodation-file.md) | Proposed record |
| Investigation File | [0013](0013-investigation-file.md) | Proposed record |
| Dismissal File / Exit pilot | [0014](0014-dismissal-file.md) | Proposed record |
| Prepare Offer File | [0015](0015-offer-file.md) | Proposed record |
| Prepare Onboarding Sequence roadmap | [0016](0016-onboarding-roadmap.md) | Proposed record |
