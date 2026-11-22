# Human Resources Lab — shared workflow contract

**Status:** Proposed contract for review. It defines the common shape required before any Hire, Manage, or Exit implementation. It does not change the frozen redaction MVP API or claim that an HR workflow exists today. Phase 1 follows the **staged source-first workflow** in `docs/hr-lab/STAGED-HR-API-CONTRACT.md` (issue #48), which constrains Phase 1 to exactly one source and a review-first outcome.

## 1. Purpose and boundary

Human Resources Lab is a document-preparation product for Ontario HR consultants and employment counsel. It helps organize a supplied record into a selected set of review artifacts. The professional retains judgment, editing, approval, and any communication or employment decision.

The contract supports these category pilots:

| Category | Pilot | Selected artifacts |
| --- | --- | --- |
| Hire | Improved Job Description (Phase 1) | `improved_job_description` Markdown; existing `review` remains compatibility-only |
| Manage | Performance Management | Chronology; Missing Records/Facts; Manager Meeting Pack; Performance-Plan Review Pack |
| Exit | Dismissal File | File Inventory; Chronology; Missing Records/Facts; Escalation Summary; Dismissal Plan for Review |

Interview Guide and Onboarding Plan are deferred. They must not appear as enabled outcomes until separately contracted and approved.

This contract does **not** support candidate selection, performance conclusions, disciplinary or dismissal recommendations, legal advice, entitlement calculations, or send-ready employee communications.

## 2. Current-state constraints

The current LawLabs contract is a redaction MVP: one multipart file is submitted to `POST /v1/jobs`; the browser polls one job and reads markdown and report results once. Anonymous results are purged after both result endpoints are read. ([API contract](../API-CONTRACT.md), [API client](../../src/lib/api.ts)).

`alias-doc` (Alias; `alias-doc` is a legacy link only) is the free guest-accessible HR-surface workflow and aliases one PDF/DOCX. `hr-hiring` is the gated second workflow on this surface; the surface home is `alias-doc`. It has no structured context, selected HR artifacts, or professional sign-off capability. ([workflow catalogue](../../src/lib/workflows.ts), [HR surface](../../src/surfaces/human-resources.ts)).

Phase 1 follows a **source-first staged workflow**: it accepts exactly one source — either one PDF upload or one pasted-text source — and prepares one `improved_job_description` Markdown outcome (LLM-assisted when configured, instructed to use only the prepared source under the session's handling choice; the default `redact` choice sends screened/redacted text, while explicitly enabled `off` can preserve non-prohibited detected values; money, pay, and equity figures are mechanically checked against matching source digits, other generated claims are not mechanically verified) for professional review and sign-off. ([staged contract](STAGED-HR-API-CONTRACT.md)).

Therefore, every HR-specific request/result below is **proposed**. The implementation owner must add a versioned server-side contract in `tool-parse` (or an approved service behind the same gateway) without widening or repurposing the frozen redaction contract. Phase 2 preserves the frozen `/v1/jobs` redaction MVP surface and the existing `/v2/hr/packages` request/result compatibility boundary; HR-specific routing, payloads, and result schemas remain versioned and distinct, and no Phase 2 change repurposes or extends the frozen redaction contract.

## 3. Common user flow

1. Professional selects **Hire**, **Manage**, or **Exit**, then its pilot workflow.
2. Professional supplies exactly one primary source: one PDF upload or one pasted-text source (Phase 1 accepts one source only).
3. Professional confirms the single `improved_job_description` card. Multi-select cards are deferred until more than one artifact is enabled for a pilot.
4. Service validates the selected cards and source input, then prepares **one** review package containing only those artifacts.
5. The browser presents the package once, with limitations, source references, and provenance, for professional review and local export/copy.
6. Professional decides whether to use, change, discard, or escalate the package outside the system.

Phase 1 is source-first: preparation (redaction, extraction, safe preview) happens server-side from the single source, then the selected outcome is confirmed, corrected, excluded, or left unresolved against fixed criteria only. No new criteria are created in Phase 1. If a selected artifact cannot be grounded in the supplied source/context, the package must state that limitation rather than fill the gap.

## 4. Proposed common request model

This is a semantic model, not an endpoint, JSON field-name, or persistence commitment.

| Field | Rule | Notes |
| --- | --- | --- |
| `category` | Required: `hire`, `manage`, or `exit` | Server allowlist, not frontend-only selection. |
| `workflow` | Required pilot within category | Concrete server identifiers remain a design decision. |
| `primary_source` | Exactly one source: one PDF upload or one pasted-text source (Phase 1) | Phase 1 accepts exactly one source; PDF and pasted-text are the only permitted source forms. Public HTTPS URLs/HTML fetching and DOCX are excluded from Phase 1. |
| `context` | Minimal, workflow-specific, structured facts | No free-text instruction channel that changes safety boundaries. |
| `process` | Required: server allowlist; v1 value `hiring` only | Part of the request model; validated server-side. |
| `artifacts` | Non-empty subset of the process's enabled artifacts | Renamed from `selected_artifacts`. Server validates allowed combinations against the registry. |
| `acknowledgements` | Required attestations, if defined by the operator | Exact attestations are an open decision; none may be implied. |

> Artifact machine ids for Hire are `review` and `plan` (replacing earlier names `review-job-description` / `hiring-plan`). Kinds group as source-extractive (`review`, later inventory/chronology/gaps/escalation) versus scaffold (`plan`, later checklist). Unselected artifacts are never generated. The server registry is the authority for enabled `(process, artifact)` cells and their contract versions. `checklist`, `question`, `onboarding`, `performance`, `leave`, `discipline`, and `termination` cells are not enabled in v1 and require their own gates.

Phase 1 is **source-first**: the service prepares a safe preview from the single source, selects only enabled `Improved Job Description` outcomes, and then confirms, corrects, excludes, or leaves unresolved only the fixed v1 criteria. No new criteria are created in Phase 1; no additional outcomes beyond `improved_job_description` are prepared. Persistence, accounts, history, tokens, and HTTPS/HTML fetching are outside Phase 1.

### 4.1 Context rules

Common context is deliberately small: a user-chosen matter label that must not be a person name, Ontario as the intended jurisdiction, and document date range where known. Each pilot may add only fields specified in its category spec.

Context must not collect candidate identifiers, employee names, health information, protected-ground information, legal conclusions, or a requested employment outcome. Facts already present in the uploaded document may be identified as source material, but are not promoted into new structured fields without an approved privacy and data-handling decision.

## 5. Proposed common response: one review package

The successful result is one structured, human-readable review package. Markdown is the initial interchange format because the current product already retrieves markdown; PDF/DOCX export is not part of this contract. Phase 1 output is an `improved_job_description` Markdown artifact derived from the single source and the fixed v1 criteria (LLM-assisted when configured, instructed to use only the prepared redacted source; only money/pay/equity figures are mechanically checked; other generated claims require professional review). Phase 2 refines the Phase 1 shape: the package must follow a fixed, review-first structure with distinct provenance and a required review warning, and it must preserve the frozen redaction MVP API surface and the existing `/v2/hr/packages` compatibility boundary.

Every package must include:

1. **Header:** category, pilot, selected artifacts, preparation timestamp, and `Draft — professional review required`. The header carries a **review warning** that no employment decision, legal conclusion, or external communication is authorized by the package and that the package requires explicit professional review.
2. **Scope and limitations:** what source/context was supplied, unreadable/extraction limitations, assumptions, and what was not assessed. Limitation statements are visible and never silently filled by invented content.
3. **Provenance and evidence:** page/section references where supported; facts supplied in context must be identified as user-provided rather than document-derived; source-anchored claims carry bounded provenance (PDF page/anchor). Provenance is distinct from generated prose and never labels user corrections as source evidence.
4. **Selected artifact sections only:** content prescribed by the relevant category spec.
5. **Missing/conflicting information:** visible gaps, conflicts, and uncertainty; never silently resolved.
6. **Escalation/review prompts:** where an issue meets the category's escalation rules.
7. **Professional review prompt:** clear statement that no employment decision, legal conclusion, or external communication is authorized by the package.
8. **Next steps:** explicit guidance for the professional on using, changing, discarding, or escalating the package, and the next review/action required.

The package must not claim completeness, legal compliance, exhaustive review, or a verified legal requirement unless a later, separately approved capability provides a grounded basis for that claim.

## 6. Evidence and artifact rules

Phase 2 refines the Phase 1 workflow shape. The service follows a source-first staged workflow: **redaction, extraction, and safe preview** happen server-side from the single source, then the outcome is generated as Markdown with bounded provenance. Provenance applies to extracted criteria only: where source extraction supports it, a criterion carries bounded provenance for PDFs (page/anchor). Generated prose is not individually source-anchored. The model is instructed not to invent facts, but that instruction is not mechanically enforced beyond the money/pay/equity digit guard. Excluded criteria are not generated as substantive content. The package follows a fixed, review-first structure: limitations, provenance, missing/conflicting information, escalation/review prompts, and next steps are always present and distinct; no section is omitted to hide an issue.

- Each material document-derived assertion should carry a page/section reference when source extraction makes one available.
- When evidence is unavailable, contradictory, low-confidence, or unreadable, state that condition in the relevant section.
- Use neutral descriptions of source material. Do not convert allegations into findings or missing evidence into a negative conclusion.
- Artifact selection changes presentation and requested preparation only; it cannot bypass an escalation rule or turn a draft into approval.
- A server-produced machine-readable report may supplement the package, but its schema is a separate versioned contract. It cannot be assumed from the current redaction `Report` type.
- Phase 1 does not create new criteria; only the fixed v1 criteria are used for confirmation, correction, exclusion, or unresolved status. No new criteria are added to the workflow.
- The generated artifact carries a review-warning structure, but output is not deterministic; it is LLM-assisted, instructed to use only the prepared source, mechanically guarded only for money/pay/equity figures, and user corrections are never represented as source evidence. The package must always carry the `Draft — professional review required` review warning and bounded provenance where source extraction supports it.

## 7. Professional review and sign-off

The first pilot can require an explicit **review acknowledgement** before a user copies/downloads/acts on a package in the UI. That acknowledgement is only an interaction control unless a future authenticated audit contract records reviewer identity, timestamp, package version, and retention/deletion behaviour.

Accordingly, the initial contract must call this step **review acknowledgement**, not audit-grade sign-off. Any product claim of professional sign-off, approval history, or evidentiary record is blocked pending a dedicated identity, retention, and audit design; current HR behavior does not provide such records.

## 8. Privacy, sensitive data, and processing boundaries

- Use sanitized historical matters for all pilot development, tests, and demonstrations.
- Do not promise that upload data is de-identified. The current `alias-doc` aliasing path does not establish a trusted chained HR-processing flow.
- Do not present Alias as an automatic prerequisite or privacy guarantee for HR workflows until the backend defines how aliased output, provenance, ownership, and deletion work across jobs.
- Before real-matter use, the service owner must approve permitted document types, sensitivity classification, storage/retention/deletion behaviour, processor/subprocessor boundaries, incident handling, and access controls.
- The frontend remains same-origin only and must not receive proxy or service secrets. ([API contract](../API-CONTRACT.md); [branded-instance SOP](../BRANDED-INSTANCE-SOP.md)).

## 9. Error and accessibility requirements

The common UI must provide distinct, accessible states for:

| State | Required behaviour |
| --- | --- |
| No file | Explain accepted file types and that one primary document is required. |
| Unsupported/unreadable file | Preserve selected cards/context where safe; explain the failure without exposing sensitive content. |
| Missing required context/card selection | Identify the field/card and block submission. |
| Processing | Show non-deceptive progress and allow cancellation only when server contract supports it. |
| Partial evidence | Deliver package with prominent limitations; do not represent it as complete. |
| Failed/purged/read-once result | Explain that result retrieval cannot be automatically retried; offer a fresh submission path. |
| Review package | Provide semantic headings, keyboard-operable card controls, and visible review-required notice. |

## 10. Server and frontend responsibilities

| Concern | Owner | Requirement |
| --- | --- | --- |
| Artifact allowlist, input validation, processing | HR workflow service / `tool-parse` owner | Enforce category, pilot, selected-artifact, file, and context rules server-side. |
| Authorization and entitlement | Gateway/auth/service owner | Frontend surface filtering is not authorization. |
| Turnstile and proxy assertion | Existing gateway | Preserve existing trust boundary; browser never sees proxy secret. |
| Workflow UI and package rendering | `site-lawyerlab` | Render only server-authorized capability and safely handle one-time results. |
| Runtime composition | `app-lawyerlab` | Deploy approved service/config only after operator and security requirements are met. |

## 11. Contract acceptance criteria

The shared contract is ready to implement only when all statements below can be demonstrated with sanitized fixtures:

1. A request cannot contain more than one primary file, an unknown category/pilot, no selected artifact, or an artifact unavailable for the selected pilot.
2. Each valid selection returns exactly one package containing selected sections and no unselected artifact section.
3. Evidence, user-provided facts, missing information, and limitations are visibly distinguished.
4. Every package contains the draft/review-required label and never contains prohibited decision/legal/communication output.
5. Unreadable, conflicting, and insufficient sources produce limitations or failures, never invented content.
6. The browser correctly handles read-once output without automatic retry and does not log document/context content or secrets.
7. Consultant/counsel pilot reviewers can identify source gaps and approve/reject the package against a pre-agreed checklist; success measures include completeness and preparation time, not autonomous decision accuracy.

## 12. Implementation gates requiring owner decision

The following issues are intentionally unresolved. No production HR workflow should start until they are decided and recorded:

1. **Service boundary:** extend `tool-parse` with a versioned HR contract, or introduce a separate approved internal service behind the gateway.
2. **Transport:** endpoint/version, multipart shape for structured context, response/package schema, status lifecycle, and read-once semantics.
3. **Identity and review record:** anonymous versus authenticated access; whether acknowledgement is sufficient; if sign-off/audit history is needed, its data model and retention. Tracked in site-lawyerlab #7.
4. **Data handling:** permitted identifiable documents, retention/deletion, storage location, processor terms, access control, and incident response. Tracked in site-lawyerlab #7.
5. **Aliasing policy:** whether HR processing is permitted on identifiable source documents, required to use a validated aliasing chain, or restricted to sanitized files. Tracked in site-lawyerlab #7.
6. **Workflow standards:** approved artifact cards, required context fields, document taxonomies, escalation criteria, and counsel-owned templates/checklists for each pilot.
7. **Multi-file scope:** whether a later matter-bundle model is needed; it is explicitly excluded from these pilots despite likely practical value for Manage and Exit.
8. **Evaluation:** who supplies sanitized benchmark matters, who scores package quality, and the go/no-go thresholds for moving from pilot to real-matter use.

## Related category specifications

- [Hire — Prepare a Hiring Plan](HIRE-SPEC.md)
- [Manage — Performance Management](MANAGE-SPEC.md)
- [Exit — Dismissal File](EXIT-SPEC.md)
