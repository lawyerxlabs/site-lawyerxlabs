# Common workflow baseline

**Status:** Adopted as the intended baseline for all workflows, 2026-11-02. These decisions do not establish current implementation or deployment. Workflow-specific decisions will be revisited subsequently; approved exceptions and stricter rules may apply. Record differences in the relevant workflow decision record and resolve conflicts before implementation.

**Implementation:** Requires workflow-specific verification; existing contracts remain in effect until migration.
**Last verified:** Implementation not verified by this record. See [0018](0018-llm-data-handling-policy.md#open-conflicts-with-0017) for unresolved policy conflicts.
**Review triggers:** Changes to shared screening, access, session, result or processing policy, or approval of a workflow-specific exception.

## Access and screening

- A limited set of workflows is available to guests. The rule for choosing those workflows remains open. Guest output defaults to the pseudonymised source; other outputs require workflow-specific approval.
- Guests and members share the same minimum screening: reject the full submission if Category 1 information or five or more distinct people are detected; pseudonymise other detected personal information. Use conservative role labels, retain no identity map, and stop when screening is uncertain or unavailable. Detection coverage requires evidence; pseudonymisation is not a guarantee of anonymity.
- Delete raw and extracted source material on terminal paths, including failure. Protected package state holds screened text.

## Results and sessions

- On success, a guest result is available for copying or downloading until its 15-minute expiry. Where supported, permit one member handoff and retain the guest result until expiry.
- Member sessions expire after 30 minutes idle or 60 minutes maximum. Warn before expiry and offer a local copy or download.
- Expiry is the default, with no retention; workflow-specific exceptions may be approved.

## Processing and edits

> **Supersession:** [ADR 0019](0019-model-provider-selection.md) supersedes the local-model default in the first bullet only. Other decisions remain subject to their stated scope and reconciliation.

- Send screened content to an approved provider, using a local model by default. Approved exceptions may apply.
- Re-screen edits before processing or protected output. Where approval exists, edits require reapproval and earlier dependent output is removed immediately; exceptions may be approved.
- There is no default verification of output; verification is left to the user.

## Guest controls

- Turnstile is the default. If it is unavailable, do not submit; explain and offer retry.
- Allow five successful results per browser session per UTC day, shared across workflows. The allowance resets at midnight UTC; a new browser session can start a new allowance.
- Allow 200 successful guest results globally per UTC day across workflows and 10 guest jobs processing concurrently. These starting values require capacity validation.
- Use Turnstile and concurrency controls for failed submissions; there is no separate attempt limit.

## Implementation and reconciliation

These defaults span surfaces and shared backend behavior and require implementation and verification before they can be relied upon. The proposed Hiring v2 record and tool-parse specification reflect these intended result and quota rules. Existing API contracts retain their current read-once and configured retention semantics until an explicitly reviewed migration; do not infer deployed behavior from this baseline. Selecting which workflows are guest-accessible remains open.

The following differences require reconciliation; these links do not change the existing contracts or approve exceptions:

- **LLM policy:** [0018](0018-llm-data-handling-policy.md#open-conflicts-with-0017) records the resolved general model-location decision and unresolved entity coverage and screening-basis differences.
- **Guest results:** The [frozen MVP contract](../API-CONTRACT.md) and [Alias record](0002-alias.md) describe read-once results, unlike the intended availability through expiry above. The [draft v2 contract](../API-CONTRACT-v2.md) does not replace the MVP contract yet.
- **Raw processing:** [Term isolation](0005-term-isolation.md) describes a raw route crossing the screening boundary; its exception or migration requires reconciliation.
- **HR Hiring:** The [staged HR contract](../hr-lab/STAGED-HR-API-CONTRACT.md#handling-capability-and-screening) describes selectable handling, including conditionally enabled `off`; [workflow record 0008](0008-job-description-review.md) calls for reconciliation with this baseline.
- **Hiring v2 access:** [The proposed Hiring v2 record](0001-hiring-v2-intake-and-handoff.md) describes guest pseudonymisation and protected member handoff; [ADR 0006](../adr/0006-workflow-template.md) records earlier panel guidance and a later clarification. Guest-workflow selection and release gates remain open.
- **Onboarding session:** The [proposed onboarding contract](../hr-lab/ONBOARDING-V1-API-CONTRACT.md) specifies a fixed 15-minute TTL, differing from the intended member session limits above. [Workflow record 0009](0009-onboarding.md) notes the implementation and verification gaps.
