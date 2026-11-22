# Human Resources Lab: Manage category spec

**Status:** Draft spec, docs only. Pilot category `Performance Management` is not implemented. Every item marked **PROPOSED** is a contract or capability gap, not current behaviour.
**Date:** 2026-10-23
**Audience:** Ontario HR consultants and employment counsel (the users), and the developers who will build the pilot.
**Owner of judgment:** the user. The Lab organises and prepares material. It does not decide.

## 1. Status, scope, users, non-goals

### 1.1 Current state (facts, from the repo)

> **Historical snapshot (2026-11-02):** The bullets below describe the repository when this spec was written. The current HR surface lists `docalias`, `hr-hiring` and `hr-onboarding`; check the current catalog and contracts before relying on these historical statements. The Manage pilot remains proposed.

- The `human-resources` surface exists in `src/surfaces/human-resources.ts` (untracked). It serves two workflows, `alias-doc` (home, free guest) and `hr-hiring` (gated), with the disclaimer "This extracts source-labelled details. It does not infer missing information or make legal or compliance assessments. Review every output with a human before use."
- `alias-doc` (Alias; `prepare-doc` is a legacy link only) is the catalogue entry in `src/lib/workflows.ts`. It takes one PDF or DOCX, replaces personal information with placeholders, and returns a working copy (markdown) plus a report.
- `src/lib/api.ts` uploads one file with `cf_turnstile_response` and an optional `workflow` id. It has no structured-input, multi-output, or package call.
- `docs/API-CONTRACT.md` (frozen for `mvp-2026-10-19`) defines one job per upload, `/result/markdown` and `/result/report`, read-once results, and purge after both are read.
- `docs/BRANDED-INSTANCE-SOP.md` covers creating a branded instance. Its section 0 states that surface and catalogue settings are presentation only; authorization is server-side.
- The Options-tab cards named in the brief (Build Chronology, Identify Missing Records/Facts, Prepare Manager Meeting Pack, Prepare Performance-Plan Review Pack) are **not in this repo**. No file under `src/` or `docs/` contains them. Treat their wording as a brief input to be confirmed.
- The "Second Brain" premise named in the brief is **not in this repo**. Nothing under `docs/` or `src/` cites it. Treat it as a source gap until a document is supplied.

### 1.2 Scope

Add a `Manage` category to the Human Resources Lab, with `Performance Management` as the pilot. A user uploads one primary PDF or DOCX plus a small set of structured facts, selects one or more output cards, and receives one structured review package for their own review.

### 1.3 Users

- Ontario HR consultants and employment counsel. They keep judgment and sign-off on every output.
- Their clients are employers. Employees are indirectly affected, because their records are in the input.

### 1.4 Non-goals

- No disciplinary recommendation, termination advice, or conclusion on whether an employee's performance is adequate.
- No conclusion on the merits of an investigation, accommodation, or complaint.
- No persistence of matters, facts, or packages beyond what the platform already does for an upload.
- No new auth model, retention period, legal claim, or workflow/API identifier in this spec. Each one needs an owning-repo or operator decision.
- No change to `docs/API-CONTRACT.md`. It is frozen. Any new contract is a separate, versioned document.
- No change to the Alias behaviour or to the shared `alias-doc` entry.

## 2. Manage catalogue and sequencing

| Order | Item | Status | Gate to start |
|---|---|---|---|
| 1 | Performance Management pilot | PROPOSED | This spec accepted; decisions in section 11.1 closed for the pilot |
| 2 | Disciplinary File | Roadmap card only (section 12.1) | Pilot acceptance passed; counsel review of safety boundary |
| 3 | Accommodation File | Roadmap card only (section 12.2) | Pilot acceptance passed; privacy review of health-related data |
| 4 | Investigation File | Roadmap card only (section 12.3) | Pilot acceptance passed; counsel review of process-fairness content |

Sequencing rule: no card starts before the pilot passes section 10.1 acceptance. Each later card reuses the pilot's intake, taxonomy, and package contract. It does not add a new one.

## 3. Full pilot flow

1. **Entry.** The user opens the Manage category on the Human Resources surface. Copy states the disclaimer and the no-conclusion boundary before any upload.
2. **Primary document.** The UI may reuse the current one-file upload interaction, but this is not a claim that `upload()` in `src/lib/api.ts` can submit HR facts or card selections. A versioned HR transport/endpoint decision is required before any submission implementation. Turnstile remains required at the gateway.
3. **Structured facts.** The user fills a short form (section 5.2). Facts are typed fields, not free text. Required fields are checked in the browser and again on the server (PROPOSED).
4. **Output selection.** The user selects one or more of the four Options-tab cards. At least one is required. Selection is an input to the package, not a separate job.
5. **Processing.** PROPOSED: an approved HR processing design receives the primary document, structured facts, and selected outputs to generate the package. Whether it processes identifiable or aliased material, and the provenance, access, and deletion rules for that material, are blocking service-design decisions. Current capability has no HR package-generation step.
6. **Gap check.** Each selected output is checked against the taxonomy (section 5.3). Missing items are listed in the package under "Missing records", not inferred.
7. **Package.** One structured review package is returned. It contains one section per selected output, a source map, and the disclaimer. It states no recommendation and no conclusion.
8. **Review.** The user reviews each section against the source. Nothing is exported or sent by the Lab.
9. **Result access and expiry.** The HR service contract must define package retrieval, retry, expiry, and purge behavior. Until then, no client may assume the frozen redaction result endpoints apply; if it adopts read-once semantics, the client must not auto-retry result reads. Retention length is an operator decision, not stated here.

## 4. Pilot functional requirements

| ID | Requirement | Status |
|---|---|---|
| F1 | Accept exactly one primary PDF or DOCX per matter. | Current (one file per upload); "per matter" grouping is PROPOSED. |
| F2 | Accept the structured facts in section 5.2 as typed fields. | PROPOSED |
| F3 | Accept one or more of the four output cards. Reject an empty selection. | PROPOSED |
| F4 | Produce one package with one section per selected output. | PROPOSED |
| F5 | Every factual statement in the package cites a source page or fact field. | PROPOSED |
| F6 | List missing records or facts for each selected output. Do not infer them. | PROPOSED |
| F7 | State "no recommendation, no conclusion" in the package header and in each section. | PROPOSED |
| F8 | Keep personal-information replacement on the primary document, as in Alias. | Current for the document; PROPOSED for facts fields. |
| F9 | Show progress and a clear failure state for each stage. | Partly current (job polling in `useWorkflowJob.ts`); stage-level status PROPOSED. |

## 5. Artifact content and document taxonomy

### 5.1 Output cards (pilot)

| Card | What the package section contains | What it must not contain |
|---|---|---|
| Build Chronology | Dated events from the source, each with source page and the fact field used. | Interpretation of what an event means. |
| Identify Missing Records/Facts | A list of records or facts the selected outputs need and the input does not contain. | Assumed values or inferred dates. |
| Prepare Manager Meeting Pack | A neutral agenda, the chronology extract, open questions, and the missing-records list. | Talking points that argue a result or recommend an action. |
| Prepare Performance-Plan Review Pack | Plan objectives and dates as stated in the source, measurement evidence found, and gaps. | A judgment on whether objectives were met. |

### 5.2 Structured facts (PROPOSED fields)

Required: matter label (user-chosen, not a name), employer jurisdiction (Ontario), date the matter was opened, document date range.
Optional: role title, plan start and end dates, number of prior review meetings, whether a written plan exists.

Do not collect: health information, protected-ground information, or employee identifiers beyond the user's own matter label. If the input contains them, the primary-document pipeline must be the only path; they are not structured fields.

### 5.3 Document taxonomy (pilot)

Used to label the primary document and each record it contains. Five categories:

1. Performance plan or objectives
2. Performance review or evaluation
3. Correspondence (email, letter)
4. Meeting notes or records
5. Other or unknown

Each record gets one category, a source page, and an `unknown` flag when classification is unsure. Classification is for organising only. It is not a finding.

## 6. Safety, professional boundary, escalation

- **Boundary.** The Lab prepares material for a qualified professional. It gives no legal advice and no employment decision. The package says so.
- **No conclusions.** The package never states that performance is adequate or inadequate, that discipline is warranted, that an accommodation is required, or that an investigation found anything.
- **Escalation triggers** (PROPOSED). The package stops and shows a notice, without generating the section, when the input contains:
  - a complaint of harassment, discrimination, or reprisal;
  - a reference to a leave, accommodation request, or medical information;
  - a request in the facts form to decide, rank, or recommend an outcome.
  The user is told to take the matter to counsel. Trigger wording is a decision (section 11.1).
- **Review acknowledgement.** Each package carries a visible professional-review-required notice. A blank or user-entered "Reviewed by" field is not audit-grade sign-off unless a later identity, storage, retention, and audit contract establishes it.

## 7. Privacy and security

- No HR package may claim its source was aliased or de-identified unless an approved service design defines the raw-versus-aliased input policy, provenance, access, and deletion. Facts storage is proposed as none (section 11.1, item 3).
- The current redaction output is read-once and expiring; the HR service contract must separately define package retrieval, expiry, retry, and purge semantics. Retention period is an operator decision.
- No secret, token, or proxy value appears in this spec or in any output. Use names, not values.
- Browser never calls the internal API directly. All calls stay same-origin `/v1` (`docs/API-CONTRACT.md`, topology).
- Turnstile is required on upload. Frontend filtering is presentation only; the server must enforce the workflow allowlist (`docs/BRANDED-INSTANCE-SOP.md`, section 0).
- Logging: PROPOSED that no matter labels, facts, or document text appear in logs. Current logging policy is not documented in this repo; this is a gap.

## 8. UX and accessibility states

States to design and test for each stage (PROPOSED):

| State | Behaviour |
|---|---|
| Empty | Upload prompt, disclaimer visible, no output cards active. |
| Uploading | Progress text; upload control disabled. |
| Processing | Non-deceptive stage label supplied by the approved service contract. No percentage promised. |
| Missing fields | Inline error by field; submit disabled until required fields pass. |
| No output selected | Inline error; submit disabled. |
| Escalation | Notice in place of the affected section; explains next step is counsel. |
| Partial failure | Sections that succeeded show; failed sections show a retry-safe message. Read-once results are not auto-retried. |
| Complete | Package shown; "Reviewed by" field blank; read-once notice shown. |
| Expired or purged | Clear message; user restarts. |

Accessibility: every state must be keyboard reachable, have a visible focus state (`--ll-focus-ring`), announce stage changes to assistive technology, and not rely on colour alone for the escalation notice. Tokens: `src/styles/tokens.css`.

## 9. Technical constraints and PROPOSED interface and data contract

### 9.1 Current constraints (facts)

- One job per upload. `POST /v1/jobs` takes one file and an optional `workflow` string (`src/lib/api.ts`, `upload()`).
- Result endpoints are `/v1/jobs/:id/result/markdown` and `/result/report`. Not `/markdown` or `/report`.
- Result endpoints are read-once. Do not auto-retry (`docs/API-CONTRACT.md`).
- Errors use `{ "error": { "code", "message" } }`. Clients must handle 401, 403, 404, 409, 413, 415, 429.
- The workflow catalogue (`src/lib/workflows.ts`) has `alias-doc` enabled and two disabled placeholders. Surface allowlists are in `src/surfaces/`.
- Workflow identifiers on the gateway are not documented in this repo. No ID is assumed here.

### 9.2 PROPOSED interface (not implemented)

Conceptual shape only. Names are placeholders and need the gateway owner to confirm.

- Client: a Manage workflow entry in the catalogue with `uploadId: <gateway-workflow-id>` (placeholder).
- Input: one primary file plus a `facts` object (section 5.2) plus `outputs` (array of card keys).
- Output: one package object: `sections[]` (one per selected output), `sourceMap[]`, `missingRecords[]`, `notices[]` (escalations), `disclaimer`.
- Errors: add a `422 facts_invalid` and a `409 no_outputs` style code, owned by the gateway. Names are PROPOSED.

Any new endpoint is a separate versioned contract. It does not change the frozen MVP contract.

### 9.3 PROPOSED data contract (sketch)

```text
PackageRequest  { primaryFileId, facts: Facts, outputs: OutputKey[] }
Facts           { matterLabel, jurisdiction: "ON", openedOn, docRange, roleTitle?, planStart?, planEnd?, priorMeetings?, hasWrittenPlan? }
OutputKey       "chronology" | "missing-records" | "manager-meeting" | "plan-review"
PackageResponse { sections: Section[], sourceMap: SourceRef[], missingRecords: string[], notices: Notice[], disclaimer: string }
SourceRef       { page: number, recordId: string, category: TaxonomyKey, unknown: boolean }
```

Do not persist `Facts` or `PackageResponse` beyond the result lifecycle defined by the future HR service contract without a decision (section 11.1).

## 10. Acceptance and validation

### 10.1 Acceptance criteria (pilot)

1. Each output card produces a section that cites a source page/section for every material document-derived assertion and identifies the fact field for every material context-derived assertion (F5).
2. Every selected output lists its missing records (F6). No value is inferred.
3. No section contains a recommendation, a conclusion, or a legal opinion (F7). Check by review against the boundary list in section 6.
4. Escalation triggers in section 6 stop the affected section and show the notice.
5. The package does not claim source material is aliased or de-identified unless the approved service design can demonstrate the defined processing chain and provenance.
6. Each UX state in section 8 is reachable and tested.
7. Keyboard-only run completes an upload and a package.

### 10.2 Sanitised historical matters

Validation uses sanitised, synthetic matters only. Do not use real client documents (`AGENTS.md`: fixtures are synthetic; new fixtures need `git add -f`).

Proposed test set (to be built, none exist in the repo):

- **M1, plan with clear dates:** a synthetic performance plan with three objectives and two review dates. Expect chronology and plan-review sections with sources; no judgment on outcome.
- **M2, plan with missing review:** a synthetic plan with no review record after the first date. Expect a missing-records entry, no inference that the review happened or did not.
- **M3, meeting notes with a complaint line:** a synthetic note containing an allegation of reprisal. Expect the escalation notice; the affected section is not generated.
- **M4, mixed correspondence:** emails with no dates in headers. Expect `unknown` flags, not guessed dates.

Each matter needs a fixture note explaining what is synthetic.

## 11. Decisions and dependencies

### 11.1 Open decisions (owner in brackets)

1. Escalation trigger wording and the full list. [counsel]
2. Retention period and purge rules for the package. [operator]
3. Whether facts are stored at all. Current recommendation: not stored. [product owner]
4. Gateway workflow identifier and whether a new workflow or the existing `alias-doc` is used. [tool-parse owner]
5. Whether Turnstile remains on every package request. [operator]
6. Whether the "Second Brain" premise is a document this repo should cite. [product owner]
7. Final wording of the four output cards. [product owner and counsel]

### 11.2 Dependencies

- tool-parse gateway: a multi-output or package step, or an approved pattern for one job plus client-side assembly. Not in this repo.
- Operator: retention, `VITE_SURFACE` build for the HR surface, Turnstile hostname.
- Counsel review: safety boundary and escalation list.
- Logto or session work is out of scope here. See `docs/adr/0002-logto-auth-sidecar.md`.

### 11.3 Sources

- `src/lib/workflows.ts`: catalogue and `alias-doc` options.
- `src/lib/api.ts`: `upload()`, result fetchers, `Job` and `Report` types.
- `src/surfaces/human-resources.ts`: surface, allowlist, disclaimer.
- `docs/API-CONTRACT.md`: frozen endpoints, read-once rule, error shapes.
- `docs/BRANDED-INSTANCE-SOP.md`: surface configuration, server-side enforcement.
- Second Brain premise: not located in this repo (source gap).

## 12. Roadmap cards (one page each, not started)

### 12.1 Disciplinary File

- **Purpose:** organise the record of a disciplinary matter for counsel review.
- **Inputs:** primary document; facts (dates, prior warnings, policy reference).
- **Outputs (PROPOSED):** chronology; missing records; policy reference list.
- **Excluded:** any view on whether discipline is warranted or which level applies. Escalate every matter touching termination.
- **Gate:** pilot accepted; counsel sign-off on boundary; wording review of "warning" fields.
- **Open:** policy document handling; retention of prior-warning records.

### 12.2 Accommodation File

- **Purpose:** organise the record of an accommodation request and the steps taken, for counsel review.
- **Inputs:** primary document; facts (request date, response dates, role function).
- **Outputs (PROPOSED):** chronology; missing records; open steps list.
- **Excluded:** any medical content beyond what the user has already placed in the record; any decision on whether the accommodation is required or reasonable. Health-related data is excluded from structured facts.
- **Gate:** pilot accepted; privacy review; counsel review of the health-data boundary.
- **Open:** how health data in the primary document is handled before display.

### 12.3 Investigation File

- **Purpose:** organise the record of a workplace investigation (steps, dates, interviews, documents) for the investigator and counsel.
- **Inputs:** primary document; facts (complaint date, investigator role, interview dates).
- **Outputs (PROPOSED):** chronology; missing records; process-step checklist.
- **Excluded:** any finding of fact, credibility assessment, or conclusion on the complaint. Complaints of harassment or reprisal always trigger escalation (section 6).
- **Gate:** pilot accepted; counsel review of process-fairness wording; escalation list agreed.
- **Open:** interview notes handling; who holds the investigator record.
