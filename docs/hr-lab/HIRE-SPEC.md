# Human Resources Lab — Hire category specification

**Status:** Phase 1 (`improved_job_description`, issue #48) is implemented; see `STAGED-HR-API-CONTRACT.md`. Sections describing the wider hiring-plan package remain proposals. **Scope:** Phase 1 of issue #48, the source-first `Improved Job Description` workflow for Ontario HR consultants and employment counsel. **Decision authority:** the professional user retains judgment, edits, and sign-off. This document does not amend the frozen alias-doc API contract or claim that the staged HR routes are deployed.

## Scope and user

Phase 1 supports a professional preparing one `improved_job_description` from exactly one source: a PDF upload or pasted text. See [STAGED-HR-API-CONTRACT.md](STAGED-HR-API-CONTRACT.md) for the staged wire contract. The source is prepared, redacted, and safely previewed before the professional selects the enabled outcome. The professional verifies existing extracted criteria and decides what to use, change, or exclude. The system organizes source material and drafts; it does not make hiring decisions or provide legal advice. Public URLs, HTML fetching, staged DOCX parsing, additional outcomes, and user-created criteria are deferred.

The existing alias-doc (Alias) workflow (legacy link: `alias-doc`) is not a general HR workflow engine. Phase 1's staged `improved_job_description` flow is implemented as described in `STAGED-HR-API-CONTRACT.md`; this does not claim deployment is live. `src/lib/workflows.ts` defines the existing workflow catalogue and Options cards; `src/lib/api.ts` defines current job and result shapes; `docs/API-CONTRACT.md` freezes the redaction MVP endpoints and read-once results. The wider structured-intake and hiring-plan package capabilities described below remain proposals or deferred scope, not claims about shipped behavior. The branded-instance SOP assigns frontend, runtime, gateway, and workflow responsibilities to separate repositories; implementation must follow those ownership boundaries.

### Non-goals

- Candidate scoring, ranking, screening, or hiring recommendations.
- Automated legal conclusions, compliance certification, or assurance that a process is lawful.
- Multiple primary documents, candidate files, or a general-purpose HR case-management system.
- Persistence, accounts, history, collaboration, or a new retention promise.
- Invented API routes, workflow IDs, authentication behavior, or server-side controls.
- Replacing or bypassing mandatory redaction in the current alias-doc path without an explicit, reviewed design decision.

## Hire catalogue and sequencing

Phase 1 exposes one enabled outcome: **Improved Job Description** (`improved_job_description`). It is not the old `review` extraction artifact. Preparation is internal; only the selected Markdown outcome is customer-visible. Interview Guide, Onboarding Plan, public URLs, HTML fetching, staged DOCX parsing, user-created criteria, and persistence are deferred.

The existing `POST /v2/hr/packages` route and `review` artifact remain available for compatibility and rollback. They are not the Phase 1 staged workflow and must not be silently reinterpreted as it.

## Pilot flow

1. **Choose workflow.** User opens Hire → Improved Job Description and sees purpose, limits, privacy summary, and professional-review boundary.
2. **Provide one source.** User uploads one PDF or pastes one job description. PDF reuses the existing 10 MiB, page, and worker limits. Pasted text must contain 100–100,000 Unicode characters after trimming; the request body is limited to 512 KiB. Reject invalid or oversized input; never truncate it.
3. **Prepare source.** Service parses, redacts, extracts controlled criteria, and returns only a safe preview, provenance, limitations, gaps, and enabled outcomes. Preparation failure blocks progression.
4. **Select outcome.** User selects Improved Job Description only after preparation succeeds.
5. **Verify criteria.** User may confirm, correct, exclude, or mark an existing extracted criterion unresolved. Phase 1 does not permit adding criteria. Corrections retain original source provenance.
6. **Generate.** Service reprocesses the same source, verifies its exact digest and criterion IDs, then returns one Markdown artifact (LLM-assisted when configured, instructed to use only the prepared source under the session's handling choice; the default `redact` choice sends screened/redacted text, while explicitly enabled `off` can preserve non-prohibited detected values; money, pay, and equity figures are mechanically checked against matching source digits, other generated claims are not mechanically verified; professional review and sign-off required). Unresolved criteria remain unresolved; Phase 1 has no separate gap-answer channel.
7. **Review and continue.** Result includes limitations, provenance, professional-review warning, and `## Next steps`. Browser state is memory-only; replacing the source clears all downstream state and refresh resets the run.
## Functional requirements and selected artifact

### Improved Job Description (`improved_job_description`)

- Use only verified preparation criteria and outcome-specific answers.
- Preserve substantive responsibilities and qualifications, including the distinction between required and preferred qualifications.
- Permit only confirm, correct, exclude, or unresolved decisions on extracted criteria. Do not accept new criteria in Phase 1.
- Never invent responsibilities, qualifications, compensation, benefits, schedules, employment terms, reporting lines, or compliance conclusions.
- Produce Markdown with role, summary, responsibilities, required qualifications, preferred qualifications, limitations/provenance, professional-review warning, and `## Next steps`.
- Corrections may change displayed wording. The original extracted value and source provenance remain available separately; the corrected value is explicitly attributed to the user.
- Return no unselected artifact and no internal parser report.

The old `review` extraction and `plan` package descriptions below are retained only as compatibility documentation for `POST /v2/hr/packages`; they are not enabled Phase 1 outcomes.

### Compatibility package schema

The compatibility route may return the legacy package shape. It is not the Phase 1 staged wire schema:
- `package_status`: draft; `workflow_label`: Prepare a Hiring Plan; `requested_outputs`: selected card(s).
- `source`: original filename and, if available, page count; no source document echo in the result.
- `intake`: submitted role facts, preserving “unknown” distinctly from empty or omitted.
- `job_description_review`: observations and evidence references, if selected.
- `hiring_plan`: ordered steps, owner/decision prompts, and unresolved items, if selected.
- `warnings`: processing limitations, missing facts, assumptions, and professional-review prompts.
- `evidence`: page/passage references only where grounded and supported by the service.

The shape and field names are proposals, not commitments. Package generation and any structured artifact endpoint/schema are capability gaps.

## Safety, professional boundary, and escalation

The product assists the professional; it does not replace their judgment or sign-off. Mark every package **Draft — professional review required**. Avoid guarantees, legal conclusions, or claims that the process satisfies Ontario or federal law. If the user asks for a legal conclusion, the package should identify the question for counsel rather than answer it.

Escalate to human review when the source or facts raise a question about protected grounds, accommodation, bona fide occupational requirements, background/reference checks, privacy, union/collective agreement obligations, immigration/work authorization, compensation rules, or conflicting jurisdictional facts. These are prompts for review, not a complete legal checklist. If processing fails, evidence is unavailable, the document is unreadable, or required facts conflict, disclose the limitation and do not fabricate a substitute.

The Second Brain premise is that professional judgment remains central while AI handles bounded preparation. Treat this as a product principle, not a legal or safety guarantee; confirm the canonical Second Brain source before implementation if exact wording or policy authority is needed.

## Privacy and security

- Collect only the primary role document and the minimum role facts needed for the selected output. Warn users to remove candidate or unrelated personal information before upload; do not request candidate data.
- Use same-origin `/v1` only from the browser. Never expose proxy credentials or internal service endpoints. Follow the ownership and secret-handling rules in `docs/BRANDED-INSTANCE-SOP.md`.
- Apply server-side workflow authorization, file/type/size validation, and abuse controls in the owning gateway/service. Hiding a card in the frontend is not authorization.
- Do not log document contents, intake values, tokens, or package text. Operational logs should use non-sensitive identifiers and bounded error codes.
- Do not promise encryption, access controls, retention periods, deletion behavior, or confidentiality until verified in the deployment and service contract. Current API contract describes owner-only job operations and read-once results, including anonymous purge behavior; whether HR jobs qualify and how facts/results are stored remains unresolved.
- Define data minimization, processing purpose, retention/deletion, backups, access, and incident handling before production exposure. Never use real client matters for development or validation.

## UX and accessibility states

- Use plain language and identify the pilot as a draft-preparation tool for professionals.
- Cards are keyboard operable, have visible focus, expose selected state to assistive technology, and remain understandable without color. Associate each input with a label, format guidance, and field-specific errors.
- Provide upload states for idle, validating, uploading, processing, complete, failed, unsupported type, too large, unreadable/empty, and interrupted connection. Preserve entered facts on recoverable failures; do not resubmit a read-once result request automatically.
- Provide output states for missing evidence, partial processing, unknown intake facts, and warnings. Do not style a warning as a pass/fail compliance indicator.
- Make selected output and draft/professional-review status visible in the result and before submission. Ensure headings, reading order, contrast, zoom/reflow, and status announcements support WCAG 2.2 AA review.

## Technical constraints and proposed interface/data contract

The current API contract is frozen for redaction MVP. Its endpoints are `POST /v1/jobs`, owner-only `GET /v1/jobs/:id`, one-time `GET /v1/jobs/:id/result/markdown` and `/result/report`, and `DELETE /v1/jobs/:id`. Do not repurpose those paths or assume they accept HR fields. The current `Job` and `Report` types in `src/lib/api.ts` do not define this package. Existing workflow IDs in `src/lib/workflows.ts` do not include an HR workflow. No new ID, route, field, or auth mechanism is established by this spec.

**Phase 1 (implemented): staged `improved_job_description` slice.** Item 2 below is the separate staged contract in [STAGED-HR-API-CONTRACT.md](STAGED-HR-API-CONTRACT.md) and is implemented as described there. It is the only HR contract work in Phase 1.

**Wider hiring-package work (proposed; not Phase 1; required before that package is implemented):**

1. Workflow/service owner defines an HR workflow identifier, version, server-side allowlist and sensitive-workflow policy; frontend catalogue configuration must use that confirmed identifier, not a locally invented value.
2. Phase 1 (implemented): the staged contract in [STAGED-HR-API-CONTRACT.md](STAGED-HR-API-CONTRACT.md): exactly one PDF or pasted-text source, preparation before outcome selection, verified existing criteria, `improved_job_description` generation (LLM-assisted when configured, with the money/pay/equity digit guard only and professional review required), stable errors, and no persistence. The legacy `/v2/hr/packages` route remains a compatibility path and is not the staged wire schema.
3. Deferred, not Phase 1: a versioned package result schema, evidence semantics, warnings, partial-failure behavior, status lifecycle, and single-read/purge semantics. Keep result fetches non-retryable unless the service contract explicitly changes. Phase 1 generation is not a read-once result; it is repeatable while the session is live, per the staged contract.
4. Deferred, not Phase 1: define how mandatory redaction interacts with HR processing. Current alias-doc behavior always redacts; a wider pilot cannot claim to review the original or produce source evidence until the service owner establishes safe, tested behavior.
5. Deferred, not Phase 1: establish server-side authorization, data lifecycle, and privacy controls before enabling that package category. Frontend filters are not enforcement. Phase 1 controls are verified by the owning service/operator, not by this document.

Keep frontend API types and fetch functions in `src/lib/api.ts`, and catalogue presentation in `src/lib/workflows.ts`, following their existing ownership. Cross-repository changes belong in the owning service/runtime repositories; the standalone frontend compose is not the production deployment path.

## Acceptance and validation

**Phase 1 acceptance (staged `improved_job_description` slice; this document does not claim live deployment):**

- The Phase 1 Hire catalogue exposes exactly one enabled outcome, `improved_job_description`. Interview Guide and Onboarding Plan are deferred and are not Phase 1 acceptance criteria.
- One PDF or pasted text is accepted through the staged contract; invalid, oversized, malformed, and unauthorized requests fail safely. DOCX is deferred: the staged flow rejects it.
- The staged route produces only the selected `improved_job_description` artifact. Legacy package behavior remains governed by its compatibility contract.
- Money, pay, and equity figures are mechanically checked against matching source digits. Other generated claims are not mechanically verified; traceability and accuracy rely on the professional review the result requires.
- The result is clearly a draft requiring professional review. Failures, unresolved criteria, and partial processing remain visible.
- Phase 1 generation is repeatable within a live session and is not persisted. Read-once result retrieval (`/v1/jobs/:id/result/*`, redaction MVP contract) is not part of the Phase 1 staged flow and is not an acceptance claim for it.

**Deferred wider hiring-package acceptance (not Phase 1; not claimed by this document):**

- The Hire catalogue exposes the pilot workflow and three output choices (Interview Guide and Onboarding Plan are deferred); no candidate-scoring or recommendation capability is present.
- One PDF or DOCX plus required intake can be submitted through a documented, server-authorized contract. DOCX parsing is deferred.
- Every observation and generated plan item is traceable to source/intake or explicitly marked as a general planning prompt/assumption. No unsupported facts, fabricated citations, or legal conclusions appear.
- Result retrieval respects the confirmed read-once/purge behavior and is never automatically retried. Privacy, logs, retention, deletion, authorization, and deployment controls are verified with the owning service/operator.
- Keyboard, screen-reader status, focus, contrast, zoom/reflow, and error states receive accessibility testing.

Validate using sanitized historical matters only, with client/candidate names, contact details, and other identifying details removed or replaced. Use a professionally reviewed set spanning clear role briefs, vague or contradictory requirements, missing location/type/timeline, scanned or unreadable files, and sensitive wording that should trigger review prompts. Professionals compare outputs against source material and identify fabricated details, missed material ambiguity, unsupported legal conclusions, and usability defects. Record evaluator criteria and results without retaining source documents or identifying data. This evaluation is not proof of legal compliance or general accuracy.

## Decisions, dependencies, and open questions

**Decisions in this spec:** one primary role document; one workflow in the pilot; three fixed output selections; structured review package; professional retains judgment/sign-off; no candidate ranking, recommendation, persistence, or legal guarantees.

**Dependencies:** tool-parse/service owner must define and implement HR processing, workflow authorization, package contract, evidence, and lifecycle; app-lawyerlab operator must verify deployment controls; product/legal reviewers must approve scope language and evaluation protocol. Follow `docs/BRANDED-INSTANCE-SOP.md` for repository and deployment ownership.

**Open questions before build:**

- Is the primary document processed before or after mandatory redaction, and can reliable source evidence survive that path?
- What exact service workflow identifier/version, request format, limits, error model, and package schema will the owner support?
- Does existing anonymous identity/ownership and purge behavior apply to HR data and structured facts? What retention and deletion guarantees are verifiable?
- What additional Ontario-specific review prompts should be approved by employment counsel, and who owns their maintenance?
- Which sanitized historical matters may be used, under what authorization and evaluation controls?

## Roadmap cards (not pilot scope)

### Prepare Offer File — later

**User outcome:** organize an approved hiring decision into a draft offer-file checklist for professional review. **Inputs:** proposed role/approved terms and organization-provided policies; exact inputs remain undecided. **Possible outputs:** checklist of required approvals and documents, unresolved terms, and handoff prompts. **Boundaries:** no candidate ranking, offer drafting or legal conclusion unless separately specified and approved; no invented employment terms. **Dependencies:** distinct workflow/service contract, privacy and retention design, counsel review, and explicit approval of any candidate personal data. **Exit gate:** validated contract and sanitized evaluation set before catalogue enablement.

### Prepare Onboarding Sequence — later

**User outcome:** turn confirmed role and organization-specific requirements into a draft onboarding sequence. **Inputs:** approved role/start details and verified employer policies; exact inputs remain undecided. **Possible outputs:** ordered checklist with owners, timing prompts, dependencies, and missing-policy warnings. **Boundaries:** no claims that statutory or policy obligations are complete; no invented deadlines, forms, or employer practices. **Dependencies:** separate workflow contract, verified policy source strategy, privacy/retention review, accessibility testing, and counsel/HR review. **Exit gate:** validated source traceability and sanitized evaluation before catalogue enablement.

## Sources and factual limits

- `src/lib/workflows.ts` — current workflow IDs, labels, options, and catalogue structure; does not establish Hire capability.
- `src/lib/api.ts` — current frontend job/result types and existing transaction artifact type; does not define an HR package.
- `docs/API-CONTRACT.md` — frozen alias-doc MVP endpoints, read-once result semantics, and errors.
- `docs/BRANDED-INSTANCE-SOP.md` — repository/runtime ownership, server-side authorization principle, and no-invented-values rule.
- Second Brain professional-judgment premise — referenced as a product premise; canonical source was not supplied in this task, so exact policy text is unverified.

All HR-specific workflow behavior, interface fields, output schema, safeguards, acceptance criteria, and roadmap items are proposals pending owner review and implementation.
