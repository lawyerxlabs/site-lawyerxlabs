# Human Resources Lab: Exit Pilot Specification

**Status:** Proposed product and contract specification; not implemented.  
**Scope:** Ontario employment-law and HR-consulting professionals using a bounded dismissal-file review workflow.  
**Decision owner:** Product owner, with employment counsel and HR-consultant pilot participants.  
**Pilot name:** Dismissal File.

## 1. Scope, users, and non-goals

### Users

Ontario HR consultants and employment counsel who assemble and review dismissal files. They retain professional judgment, make all substantive decisions, and sign off on any work product used with a client or employer. The Lab organizes source material and prepares a review package; it does not replace professional review.

### In scope

- One primary PDF or DOCX per submission, plus a small, explicitly defined set of structured facts.
- User selection of one or more output cards from the existing Options concept.
- A single structured review package containing selected artifacts, evidence references, and limitations.
- A professional review step before the package is relied on or shared.

### Out of scope

- A dismissal recommendation or decision about whether to dismiss.
- Legal conclusions, final legal advice, entitlement or damages calculations, or predictions of outcome.
- Drafting communications intended to be sent to an employee, employer, or third party.
- Multi-file matter management, collaboration, persistence, matter history, or saved profiles.
- Legal research, precedent search, workflow IDs, authentication/authorization design, retention promises, or an implementation plan represented as already available.

## 2. Exit catalogue and sequencing

The following is a proposed catalogue, not a live workflow catalogue. The current `src/lib/workflows.ts` catalog does not establish an HR workflow. Its existing Options cards are explanatory UI content; they do not establish selectable output types or generation capability.

| Sequence | Option card | Role in review | Status |
|---|---|---|---|
| 1 | File Inventory | List submitted source, detected document properties, and relevant sections/pages for review. | Proposed capability gap |
| 2 | Chronology | Extract dated events with source references and uncertainty flags. | Proposed capability gap |
| 3 | Missing Records/Facts | Identify records or facts that appear absent or unclear, phrased as questions for the professional. | Proposed capability gap |
| 4 | Escalation Summary | Surface issues requiring professional attention, with evidence and reason for review; not a legal conclusion. | Proposed capability gap |
| 5 | Dismissal Plan for Review | Consultant/counsel planning and checklist artifact only. No recommendation, entitlement calculation, final legal advice, or send-ready communications. | Proposed capability gap; highest review sensitivity |

### Sequencing

1. Validate intake, file constraints, and safe handling before extraction.
2. Prepare source-grounded inventory and chronology.
3. Identify missing records/facts and review escalations.
4. Prepare the Dismissal Plan only if selected, with explicit review-only labeling and professional review acknowledgement.
5. Assemble only selected outputs into one package; do not imply that unselected outputs were generated or checked.

No option-selection UI, HR processing, or package generator is established by the current frontend/API contract. These are proposed capabilities.

## 3. Full pilot flow

1. **Start:** User chooses the proposed Dismissal File pilot. Present scope, limitations, and a warning not to submit material they are not authorized to process.
2. **Intake:** User uploads one primary PDF/DOCX and enters the agreed small structured-facts set. Exit inherits the shared contract's common context: a user-chosen, non-person matter label; Ontario as intended jurisdiction; and document date range where known. Exit-specific additions, exact limits, and the authoritative server schema remain to be agreed with the service owner. Reject unsupported or multiple primary files rather than silently merging them.
3. **Review intake:** Show filename, file type, and entered facts for confirmation. Allow correction or removal before submission. Clearly state the processing and deletion behavior only after the owning service confirms it; do not promise retention or deletion terms that are not verified.
4. **Choose outputs:** User selects one or more of the five cards. Explain that each output is a draft for professional review and may be incomplete or uncertain.
5. **Process:** Submit once to a server-authorized HR workflow when one exists. Show progress and recoverable errors. Do not expose internal credentials or treat browser-side catalogue filtering as authorization.
6. **Review package:** Return one structured package, containing selected artifacts only. Each factual assertion should point to a page/section or to a submitted structured fact. Mark uncertain, inferred, or unlocated items distinctly; never fill gaps by invention.
7. **Professional review acknowledgement:** Require a clear acknowledgement that the professional reviewed the package before external reliance or use. This acknowledgement is not a substitute for legal judgment, audit-grade sign-off, or legal approval by the service.
8. **Close:** Provide the package for the current session under the confirmed result-access model. No saved matter, history, or persistence is in scope.

The existing API exposes one job and read-once markdown/report result endpoints (`docs/API-CONTRACT.md`). Whether that transport can support a structured multi-artifact package, partial selection, and the required review safeguards is unresolved. Do not assume compatibility or alter the frozen MVP contract implicitly.

## 4. Functional requirements and artifact contents

### Intake facts (proposed; exact schema unresolved)

Keep the initial intake small. Candidate fields for pilot validation: relevant employment start/end dates if known; role/title; work location in Ontario; and bounded, counsel-approved date/document-status fields. Do not collect a requested dismissal outcome, open-ended instructions, legal conclusions, or sensitive personal details. Fields should permit “unknown.” Final field list and necessity require counsel/operator review before implementation.

### Common package rules

- Include selected artifact names, generation status, source filename, and a clear “For HR consultant/employment counsel review” label.
- Separate source-grounded facts from user-provided facts, generated summaries, and questions/inferences.
- Attach source location references wherever available. Do not claim a citation proves completeness or correctness.
- Show limitations, unresolved items, and extraction warnings prominently.
- Preserve the original meaning; do not convert ambiguity into certainty.
- Do not include hidden notes, unsupported source content, or content from another matter.

### Artifact definitions

**File Inventory**
- Submitted file name/type and processing outcome.
- Document/section inventory sufficient to orient the reviewer.
- Potentially relevant passages with page/section locations; no assertion that the inventory is exhaustive unless validated.
- Extraction/OCR and unreadable-page warnings.

**Chronology**
- Event/date description, source location, and provenance category (document or user fact).
- Date precision as found; distinguish exact, approximate, and conflicting dates.
- Flag chronology conflicts and undated events instead of resolving them without evidence.

**Missing Records/Facts**
- Concrete missing or unclear record/fact, why it may matter to review, and a question for the professional/client to resolve.
- Do not state that a record is legally required unless independently established by an approved rule source and explicitly in scope.

**Escalation Summary**
- Issue requiring human attention, supporting source references, uncertainty, and suggested reviewer/action owner (e.g. counsel review).
- No final risk rating or legal conclusion unless separately approved, validated, and scoped; none is assumed here.

**Dismissal Plan for Review**
- Checklist/planning artifact for the consultant or counsel, with open questions, tasks, source links, owner, and completion status where appropriate.
- Must be explicitly labeled “planning/checklist for professional review.”
- Must not recommend dismissal, calculate statutory/common-law entitlements, provide final legal advice, or produce send-ready employee communications.

## 5. Safety, professional boundary, and escalation

- Keep the professional as the decision-maker and sign-off authority at every point.
- Do not describe generated content as a legal opinion, determination, or complete file review.
- Escalate contradictions, missing source material, uncertain identity/date extraction, potentially urgent or high-impact issues, and any request for a conclusion outside scope to the professional; identify the evidence and uncertainty without deciding the issue.
- If extraction fails or evidence cannot be located, say so. Do not produce a confident substitute from general knowledge.
- Do not generate advice to an employee or employer or communications suitable for sending.
- The Dismissal Plan’s checklist form does not make it a recommendation. Its title and every presentation/export surface must retain the review-only boundary.
- Ontario-specific legal content, mandatory disclaimers, and escalation triggers require review and approval by qualified Ontario employment counsel. No legal rule or claim is asserted by this specification.

## 6. Privacy and security

- Treat the uploaded document and structured facts as confidential, sensitive matter data.
- Collect only fields necessary for the pilot; avoid unnecessary names, contact details, government identifiers, health information, and other sensitive details.
- Do not place matter content or personally identifying information in logs, analytics, error messages, URLs, or committed fixtures.
- Enforce file type/size/page limits, ownership, and authorization at the server boundary. Hiding a workflow in the frontend is not authorization (`docs/BRANDED-INSTANCE-SOP.md`).
- Use transport and storage controls owned by the deployed service. The frontend must not hold proxy secrets or call internal APIs directly.
- Confirm processing location, subprocessors, access controls, deletion/expiry behavior, backup behavior, and incident handling with the service operator before a pilot accepts real matters. Do not infer a retention promise from the existing read-once API behavior.
- Use synthetic or properly sanitized historical matters for development and evaluation. Never commit real client files.

## 7. UX and accessibility states

- Intake explains allowed file types, one-primary-file limit, required/optional facts, output choices, and professional-review boundary before upload.
- Ensure keyboard-operable upload, fact entry, option cards, selection summary, and result navigation; visible focus and programmatic labels; errors are announced to assistive technology.
- Do not rely on color alone for selected, warning, failed, or uncertain states.
- Provide states for empty intake, invalid/unsupported file, upload in progress, processing, completed, partial/unavailable artifact, extraction warning, failed job, expired/purged result, and read-once result unavailable.
- Preserve entered facts after recoverable validation errors where safe. Never automatically retry a read-once result request; the frozen API contract says result endpoints are read-once.
- On completion, show selected outputs, warnings, evidence references, and the review-acknowledgement reminder before any download/copy action. This is an unrecorded UI control, not audit-grade sign-off.
- No UI should imply persistence or saved matter history.

## 8. Technical constraints and proposed interface/data contract

### Current facts

> **Historical (2026-10-31):** This spec was written before the HR workflows shipped. `src/lib/workflows.ts` now defines `hr-hiring` and `hr-onboarding` (see ADR 0004) and no longer defines `transaction-intake`. The bullets below record the constraints as understood at spec time.

- `src/lib/workflows.ts` defines `alias-doc` (Alias; `alias-doc` is a legacy link only), `transaction-intake`, `case-analysis`, and `agreement-review`. It does not define an HR workflow or these five selectable output cards.
- `src/lib/api.ts` defines the current job/report types and a transaction-intake artifact type. It does not define an HR intake, selectable artifact set, or HR review package.
- `docs/API-CONTRACT.md` freezes the redaction MVP around one uploaded file, job status, and read-once markdown/report endpoints. The gateway owns identity cookies and proxy assertion; LawLabs calls same-origin `/v1` only.
- `docs/BRANDED-INSTANCE-SOP.md` distinguishes frontend presentation from server-side workflow authorization and assigns gateway/workflow registry responsibilities to tool-parse.
- The Second Brain premise is relevant as a product boundary: use the lab to organize and structure a bounded review task, while the professional retains judgment. It does not establish implementation capability, legal authority, or permission to persist matter records.

### Proposed contract (not implemented; names illustrative, not API identifiers)

A future service contract must be designed with the tool-parse owner and must not be inferred from this document. At minimum, it needs to define:

- Intake: one primary PDF/DOCX, validated structured facts, and one-or-more selected output types.
- Server-side authorization of the workflow and output types; frontend selection alone is insufficient.
- A versioned package schema containing selected artifacts, provenance/evidence locations, warnings, uncertainty, and processing status.
- Stable error semantics for invalid input, unsupported formats, authorization denial, extraction failure, limits, and unavailable/expired results.
- Result access and deletion/expiry semantics, including whether a package can be fetched once or requires separate reads. Do not reuse current endpoints until compatibility is demonstrated.
- Safe handling of partial output: identify unavailable artifacts and never represent a partial package as complete.

Until that contract exists, HR processing, structured intake, output selection, and package generation are capability gaps. No workflow ID, endpoint, authentication model, retention period, or persistence behavior is specified here.

## 9. Acceptance and validation

Pilot acceptance requires all of the following:

1. A single supported PDF/DOCX and the approved structured facts can be submitted; invalid/multiple primary inputs are rejected clearly.
2. User can select any non-empty combination of the five options; the returned package contains exactly those selected outputs or explicitly reports which could not be produced.
3. Every factual item is traceable to a source location or an identified user-entered fact; unsupported or uncertain items are marked, not guessed.
4. The Dismissal Plan is a review checklist only and contains none of the prohibited recommendation, calculation, final-advice, or send-ready communication content.
5. Safety boundary and review-acknowledgement notice are visible in intake, results, and any exported artifact; the notice is not audit-grade sign-off.
6. Authorization and file limits are enforced server-side; sensitive content and secrets do not appear in logs or browser-visible credentials.
7. Read-once/result-expiry behavior is tested against the actual service contract; the client does not retry a result read automatically.
8. Keyboard and screen-reader checks cover intake, output selection, errors, progress, warnings, and package review.

### Historical-matter validation

- Use a counsel-approved set of historical matters that are sanitized before entering the system. Define the sanitization procedure and verify re-identification risk; do not assume removal of names alone is sufficient.
- Include varied document quality, missing records, conflicting dates, low-confidence OCR, and cases with no obvious escalation. Have Ontario employment counsel/experienced HR consultants independently review outputs against source files.
- Score extraction fidelity, evidence-location accuracy, omission/uncertainty handling, prohibited-content leakage, and usability separately. Set numerical thresholds only after the pilot owner and reviewers approve a rubric; this specification does not fabricate thresholds.
- Record disagreements and adjudication. A good-looking package is not evidence of legal correctness or completeness.
- Do not use live client matters until privacy/security review, service authorization, and the processing/retention terms are approved.

## 10. Decisions, dependencies, and open questions

### Decisions captured here

- The exit pilot is Dismissal File for Ontario HR consultants/employment counsel.
- Professionals retain judgment and sign-off.
- The five named cards are selectable outputs; one or more selections produce one structured review package.
- The Dismissal Plan is limited to professional planning/checklist use.
- No persistence, invented implementation identifiers, or unverified legal/retention claims are part of this spec.

### Dependencies and open questions

- Tool-parse/service owner: Can the server support a distinct HR workflow and multi-artifact package without weakening the frozen redaction MVP contract?
- Product and counsel: Approve intake fields, artifact schemas, disclaimer wording, escalation triggers, and what “small” means for facts and files.
- Operator/privacy owner: Confirm authorized users, data location, subprocessors, access controls, expiry/deletion, backups, and incident response.
- Pilot reviewers: Select sanitized historical matters, define scoring rubric/thresholds, and establish human review and feedback procedure.
- Product owner: Decide whether partial package delivery is acceptable and how to present unavailable selected artifacts.
- Counsel: Confirm the review-only label and prohibited-content safeguards on the Dismissal Plan.

## 11. One-page roadmap card: Post-Dismissal Implementation Plan

**Outcome:** A professional can submit one dismissal file, choose review artifacts, and receive one source-grounded package for their own review—without delegating the dismissal decision to the system.

| Stage | Deliverable | Exit condition |
|---|---|---|
| 0. Contract and authority | Approved intake/artifact schemas, server authorization and result semantics, privacy/retention facts, Ontario counsel-approved boundaries. | Service owner and product/counsel approve the proposed contract; no conflict with frozen MVP contract. |
| 1. Synthetic vertical slice | HR intake, output selection, server processing, structured package, warnings, and review-only presentation using synthetic files. | End-to-end behavior and failure states pass acceptance checks; no live matters. |
| 2. Historical validation | Sanitized historical corpus, reviewer rubric, independent source comparison, safety and accessibility checks. | Pilot owner accepts measured performance and documented limitations; prohibited content absent. |
| 3. Controlled pilot | Limited authorized professional cohort, approved operational controls and feedback route. | Privacy/security and counsel gates complete; explicit stop/rollback procedure in place. |
| 4. Evaluate and decide | Review errors, omissions, reviewer effort, safety events, and user feedback. | Product owner decides to revise, continue, or stop; no automatic expansion into advice or communications. |

**Stop condition:** Do not implement or expose the HR workflow to real matters until the proposed service contract, server-side authorization, privacy/retention terms, and counsel-approved professional boundary are resolved.

**Not part of this roadmap:** persistence, matter management, additional workflows, legal research, automated decisions, entitlement calculations, or external communications.
