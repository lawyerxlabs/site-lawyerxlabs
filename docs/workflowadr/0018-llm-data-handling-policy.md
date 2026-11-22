# LLM data handling policy

**Status:** Canonical record, 2026-11-02. It carries forward the owner sign-offs recorded in issue #58 (closed) and #54 (closed), which were written for `hr-onboarding`. It does not establish current implementation or deployment. Where it differs from [0017](0017-common-workflow-baseline.md), the difference is listed under Open conflicts and is not resolved here.

**Relates to:** [0017](0017-common-workflow-baseline.md), [README](README.md) security characteristics 2 and 3, tool-parse `docs/ADR-007-workflow-template.md`
**Implementation:** Not established by this record; workflow-specific and deployment verification are required.
**Last verified:** The underlying sign-offs are dated 2026-10-25 and 2026-10-27; their values were not re-verified on 2026-11-02. Provider retention remains unverified against the written policy and account.
**Review triggers:** See [Re-review triggers](#re-review-triggers) below.

## Scope

Every workflow that sends screened content to a language model. A workflow with its own sign-off may be stricter. Any looser rule needs an owner decision recorded in that workflow's record.

The sign-offs carried forward here were for onboarding. Whether their baseline applies unchanged to other LLM uses remains open; each new LLM use needs its own recorded sign-off as stated below. This record does not resolve the differences with [0017](0017-common-workflow-baseline.md#implementation-and-reconciliation).

## Approved baseline

Values below come from the owner sign-offs of 2026-10-25 and 2026-10-27. Nothing here was re-verified on 2026-11-02.

| Rule | Decision |
|---|---|
| Provider and model | Alias `onboarding` on omni, resolving to `openrouter/z-ai/glm-5.3-flash`. One target, no fallback. |
| Retention at provider | Zero data retention (ZDR). Training use: none. Region: Americas. |
| Basis for ZDR | Owner statement of the OpenRouter ZDR policy. ZDR is account-level. The proxy sends no per-request ZDR flag, so code does not enforce it. The values were **not checked against the written policy**. Accepted risk. |
| Personal data | Presidio screens every source before any model call. Default mode `redact`; fail closed if Presidio is unavailable. `block` is available. `shadow` is for synthetic fixtures only and is not approved for production. |
| Entities screened | `PERSON`, `EMAIL_ADDRESS`, `PHONE_NUMBER`, `CREDIT_CARD`, `US_SSN`, `IBAN_CODE`, `CA_SIN` (Luhn check), `CA_ON_HEALTH_CARD` (ten digits). Score threshold 0.3, because 0.7 let phone numbers through. Over-redaction of ten-digit and some nine-digit numbers is accepted as the safe direction. |
| Deliberately not redacted | `LOCATION`, `DATE_TIME`, `URL`. |
| Known not covered | Passport, driver licence, IP, bank account numbers, and names Presidio mislabels. Redaction reduces personal data reaching the model. It does not guarantee none does. |
| Span shown to member | Typed label, for example `<PERSON>`. |
| Provenance | Original text with server-assigned fact IDs. The model never supplies offsets or quotes. Provenance quotes are never sent to the model. |
| PII mode control | Fixed per workflow in `workflows/<id>/pii.js` (tool-parse ADR-005). A change needs a commit and deploy. |
| Failure behaviour | Model output is untrusted. A schema, grounding or provider failure returns `502 processing_failed`. The artifact is discarded and nothing is stored. No automatic retry. Upstream response bodies are never forwarded. |
| Model ID control | Set in the backend by a pinned, allowlisted environment variable, never by the client. |
| Egress | tool-parse calls only the fixed-upstream proxy (`tool-parse-proxy`). The omni key lives only in the proxy secret. |
| User notice | Approved wording, root-level `notice` field: "AI-assisted draft. This checklist was generated using AI and the materials provided. This material may contain errors or omissions. Review with your professional advisors before use." Reuse for another workflow needs the owner to approve the wording. |
| Approver | The owner. |

## Re-review triggers

The owner records a decision before any of these ships:

- A change to the `onboarding` alias target, or to the provider behind it. The alias can change on omni without a tool-parse change. Check `updatedAt` and the target list. `version` stayed at 2 across edits and is not a reliable marker.
- A new LLM-using workflow or alias.
- A change to a workflow's PII profile mode or entity list.
- A new source type, file count or size limit sent to a model.
- A change to the failure policy or the retention basis.

## Open conflicts with 0017

1. **Model location (resolved 2026-11-02).** [ADR 0019](0019-model-provider-selection.md) supersedes 0017's local-model default: each workflow requires approval for its chosen local or hosted provider. This record's onboarding sign-off does not itself approve a provider for Hiring v2; provider terms and account settings remain to be verified.
2. **Entity coverage.** This record leaves `LOCATION` and `DATE_TIME` unredacted. Hiring screening redacts them (observed on 2026-11-02 in a local run on five authorized real postings; `Location` and `Date` tokens appeared in every output; counts only, no text recorded). Both lists cannot be the baseline.
3. **Screening basis.** 0017 rejects on Category 1 or five or more distinct people. This record specifies entities and a score threshold. It has no Category 1 rule or person cap. They are complementary but never reconciled.

## Open items

- Verify ZDR against the provider account and the written policy, and decide how often to re-check. No verification has been done.
- Pin the alias target, or alert on change.
- Decide whether this baseline applies as is to other LLM uses, or each needs its own sign-off. Until then, each new LLM use needs its own recorded sign-off.

## Out of scope

- Workflows that do not call a model, such as redaction (`alias-doc`).
- Choosing the model for a feature. That is recorded per workflow.
- Price, token bounds and budget caps. Those belong to the workflow's budget gate (Hiring v2: #86).
