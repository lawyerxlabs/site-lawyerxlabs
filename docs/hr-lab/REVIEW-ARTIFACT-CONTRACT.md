# Job Description Review artifact — compatibility contract (Hire / `review`)

**Status:** Existing compatibility contract. **Scope:** synthetic/sanitized pilot data only. **Tracking:** site-lawyerlab #44 (decision); implementation history: tool-parse #71.

## Purpose

`review` is a **structured, source-anchored extraction of one job description or role brief**. It remains available through the existing `/v2/hr/packages` route for compatibility and rollback. It is internal preparation data, not the Phase 1 customer-selected artifact. Phase 1 instead prepares one PDF or pasted-text source and returns only the selected `improved_job_description` Markdown artifact. That generated Markdown may be LLM-assisted. Extracted criteria retain source provenance; generated prose is not mechanically source-verified, except that configured money/pay/equity figures must match digits in the source. Human sign-off is required. Public URLs, HTML fetching, staged DOCX parsing, additional outcomes, and persistence are deferred.

`review` is not an HR assessment, a compliance review, or a recommendation. Any new staged artifact requires its own contract version and approval.

## Ownership

- **tool-parse** implements the compatibility parser (`/v2/hr/packages`, `src/api/hr-review.js`). It is deterministic: heading and label matching over extracted pages. No LLM, no inference.
- The staged Phase 1 preparation/generation contract is documented separately in [STAGED-HR-API-CONTRACT.md](STAGED-HR-API-CONTRACT.md).
- **site-lawyerlab** owns this contract and renders the response. It calls tool-parse over HTTP only.
- Changing the response shape from the earlier source outline requires a new `contract_version`.

## Fields (v1)

Single-value: `role_title`, `role_summary`, `work_location`, `employment_type`, `compensation`, `hiring_timeline`.

List: `responsibilities`, `qualifications`, `required_experience`, `preferred_experience`, `skills`, `education`, `working_conditions`.

Plus `unclassified_content` (list) and `gaps` (list).

Every extracted item:

```json
{
  "value": "<source wording, verbatim, bounded>",
  "status": "source_anchored",
  "source": { "page": 2, "anchor": "<bounded source text>" }
}
```

## Rules

1. **Verbatim.** Source wording is preserved. No normalization, enums, or paraphrase.
2. **Anchored.** Every extracted value carries page and a bounded anchor. If the location cannot be determined, the anchor is `source location unavailable` and the item is still reported.
3. **Classified only by source labels.** A block is placed in a field only if the source heading or `label:` line names that field (fixed synonym list per field, recorded in the implementation). Otherwise it goes to `unclassified_content`. Content is never dropped and never guessed into a field.
4. **Gaps.** A single-value field with no source match is listed in `gaps` with `status: not_extracted_from_source`. A gap means "not found by the configured labels", not "absent from the document" and not an ambiguity or compliance finding.
5. **Intake is separate.** Structured intake values are returned as `user_provided` and are never merged into source fields or used to fill gaps. This compatibility behavior is not the Phase 1 staged criterion-decision model.
6. **Statuses.** Item: `source_anchored | user_provided | not_extracted_from_source`. Artifact: `ok` (at least one field classified from source labels), `partial` (readable, but nothing classified; plain-text or table layouts), `extraction_unavailable` (no readable pages).
7. **Limits.** Output is bounded (items per field, characters per value/anchor). Truncation is reported in `limitations`. Numeric limits are contract-version details.
8. **Limitations always listed.** The response states recognized structure (headings and `label:` lines only) and that gap detection is label-based.
9. **Staged Phase 1 boundary.** The staged flow accepts one PDF or pasted text, prepares before outcome selection, permits only confirm/correct/exclude/unresolved decisions on extracted criteria, and returns only `improved_job_description` Markdown. It does not add criteria, return `review` as a customer artifact, or persist source/result state.
9. **Parser edge cases (confirmed 2026-10-24).** (a) Duplicate single-value field: the first source claim wins; later claims are kept verbatim in `unclassified_content`, never dropped. (b) A heading's body ends at the next heading or the page end and never spans pages, so every item's page and anchor co-locate. (c) List items keep their source text verbatim, including bullet prefixes (no stripping, per rule 1).

## Explicit exclusions

No candidate scoring, ranking, screening, or hiring recommendation. No legal conclusion, compliance certification, or lawfulness assurance. No inferred facts. No hidden unselected artifacts. No `myNotes`. Human judgment and sign-off required; the disclaimer is present in every response.

## Input boundary

The legacy compatibility path accepts exactly one primary PDF/DOCX and structured intake only. The staged Phase 1 path accepts exactly one PDF or pasted text; pasted text is 100–100,000 Unicode characters after trimming with a 512 KiB request-body limit. Raw HR paths require `TOOL_PARSE_HR_REVIEW_MODE=synthetic_raw` and are off by default.

## Approval

- Status: **approved for implementation**
- Approved by: Romesh Hettiarachchi / product owner
- Date: 2026-10-24
- Scope: synthetic/sanitized data only; `review` only (`plan` requires separate approval)
