# HR Onboarding Result / Handoff Panel

## 1. Reuse from alias-document UX

| Existing element | Reference | Onboarding mapping |
|---|---|---|
| Result container and action layout | `src/components/JobStatus.tsx:201-218`; `.job-result`, `.job-result-actions` in `src/index.css:114-118` | Wrap complete onboarding result; hold copy/download controls. |
| Neutral result notice | `.result-notice` in `src/index.css:107-108` | Artifact-level AI notice. Must be first content inside result. Render `artifact.notice` verbatim. |
| Summary card | `.report-summary`, `.report-summary-heading` in `src/index.css:94-106` | Checklist title, item count, and status “Ready to review.” |
| Status/error pattern | `src/components/JobStatus.tsx:186-200` | `role="status"` during generation; `Alert` plus explicit action after failure. |
| In-memory copy/download behavior | `src/components/JobStatus.tsx:143-160`; `src/pages/JobPlayground.tsx:214-225` | Serialize artifact once to Markdown; both actions use that in-memory string. Never re-fetch. |
| Read-once request discipline | `src/components/JobStatus.tsx:24-42`; `src/components/WorkflowShell.tsx:10-22` | Cache generation response in page state. No automatic retry or result request. |
| Destructive confirmation | `src/components/JobStatus.tsx:219-227` | Confirm before deleting session and losing read-once result. |
| Replace/start-over behavior | `src/pages/HrOnboarding.tsx:23,46-60` | Delete current session, clear result/classifications, return to file intake. |
| Buttons | `src/components/ui/button.tsx:6-17` | `primary` only for Prepare/Generate. Result actions—Download, Copy, Start over—use `secondary`; destructive confirmation action uses `destructive`. |
| Badges | `src/components/ui/badge.tsx:5-7`; styles in `src/styles/components.css:30-32` | Visible “Source-backed,” “Needs confirmation,” and `confirmation_label` chips. |
| Mobile action stacking | `src/index.css:187-195` | Reuse wrapping/full-width behavior; no separate mobile toolbar. |
| Existing HR page shell | `src/pages/HrOnboarding.tsx:46-60`; `.hr-hiring` rules in `src/index.css:377-385` | Keep current page layout and classification flow. Do not introduce a new shell or source-preview pane. |

Do **not** reuse `SourcePreview`: provenance spans can come from several PDF, DOCX, or TXT files and have no page geometry. Native `<details>/<summary>` disclosures fit better.

---

## 2. Panel anatomy

Use one `<section aria-labelledby="onboarding-result-title">`. On generation completion, move focus to its heading; do not move focus when individual disclosures open.

### A. Artifact notice — first

Use `.result-notice`, not a destructive alert.

**Exact rendered text:** use `artifact.notice` verbatim:

> AI-assisted draft. This checklist was generated using AI and the materials provided. This material may contain errors or omissions. Review with your professional advisors before use.

### B. Summary

Use `.report-summary`.

- Eyebrow/status: **“Ready to review”**
- `<h2 id="onboarding-result-title">`: `artifact.title`
- Summary: **“{n} onboarding items prepared from {n} source files.”**
- Singularize “item” and “file” when count is 1.

### C. Ordered checklist

Render `items` sorted by `position` in `<ol>`, even if response order changes.

Each item is an `<li id="onboard-item-{id}">` with:

1. Heading: **“{position}. {task}”**
2. Literal metadata:
   - owner value as supplied, without adding another “Owner:” prefix;
   - `timing === null`: **“Timing: Not specified”**
   - empty dependencies: **“Dependencies: None”**
   - otherwise: **“Dependencies: {comma-separated values}”**
3. State chips:
   - non-empty provenance: **“Source-backed”**
   - empty provenance: **“Needs confirmation”**
   - when `confirmation_required`, also show `confirmation_label`; contract fallback: **“Confirm with employer”**
4. Provenance:
   - One disclosure per provenance entry.
   - Summary: **“View source: {filename}”**
   - Body filename label: **“Source file: {filename}”**
   - Quote in `<blockquote>` as plain React text: `“{quote}”`
   - No raw offsets in normal UI.
   - Unknown `source_id` fallback: **“Source file unavailable”**; never expose the opaque ID as a filename.

Empty-provenance items need a different border treatment **and** the textual “Needs confirmation” chip—never colour alone.

Render `<PERSON>`, `<EMAIL_ADDRESS>`, and equivalent angle-bracket labels as literal text. Visually style matched placeholder tokens like inline code; never use `dangerouslySetInnerHTML`.

### D. Missing information

Show only when non-empty.

- `<h3>`: **“Information to confirm”**
- Intro: **“These points were not established by the uploaded sources.”**
- Each entry:
  - Link to `#onboard-item-{item_id}`.
  - Link text: `confirmation_label`, fallback **“Confirm with employer”**
  - Detail shown directly after link.

Example:

> **Confirm with employer** — The uploaded sources do not identify required employee forms.

### E. Limitations

Show only when non-empty.

- `<h3>`: **“Limitations”**
- Render each contract string unchanged in a list.

### F. Handoff action bar

`aria-label="Checklist actions"`:

1. **“Download checklist”** — secondary; downloads `onboarding-sequence.md`.
2. **“Copy checklist”** — secondary; success label **“Copied”**.
3. Clipboard failure alert:
   **“Copy failed — your browser blocked clipboard access. Use Download checklist instead.”**

Markdown should preserve title, notice, ordered items, metadata, confirmation labels, provenance quotes with source filenames, missing information, and limitations. Both actions use one memoized in-memory serialization.

### G. Read-once warning

Immediately below handoff actions:

> **Save this checklist now.** This result cannot be fetched again after you leave this result or start over.

Keep visible—not a tooltip or dismissible message.

### H. Start over

Secondary button: **“Start over”**

Confirmation dialog:

- Title: **“Start over?”**
- Description: **“This checklist and its source session will be deleted immediately. Save a copy first if you need it. This cannot be undone.”**
- Cancel: **“Keep checklist”**
- Confirm, destructive: **“Delete and start over”**

Successful deletion returns focus to the source-document heading/file input.

---

## 3. Generation failure states

Place failure `Alert` where the result panel would appear, directly after the generation control. Preserve confirmed classifications. No automatic retry.

| Code | Exact copy | Actions |
|---|---|---|
| `pii_detected` · 422 | **“Personal data was detected before generation. Nothing was sent to the AI service. Review the source documents before trying again.”** | **Try again**; **Replace documents** |
| `processing_failed` · 502 | **“The checklist could not be generated. No partial result was saved.”** | **Try again** |
| `processing_unavailable` · 503 | **“Checklist generation is temporarily unavailable. Try again later.”** | **Try again** |
| `llm_not_configured` · 503 | **“Checklist generation is not configured yet.”** | **Try again**; **Start over** |
| `already_generated` · 409 | **“This checklist was already generated and cannot be fetched again. Start over to create a new one.”** | **Start over** |
| `session_state_conflict` · 409 | **“Another session action is still in progress. Wait a moment, then try again.”** | **Try again** |
| `session_not_found` · 404 | **“This session was deleted or expired. Start over with your documents.”** | **Start over** |

`Try again` is always an explicit button, never an automatic request. `already_generated` and `session_not_found` are contract exceptions: current session cannot produce another retrievable result.

---

## 4. Minimum new UI surface

### One new component

`src/components/OnboardingResult.tsx`

```ts
type OnboardingResultProps = {
  artifact: OnboardArtifact
  sources: OnboardSourceMeta[]
  onStartOver: () => void
  startOverBusy?: boolean
}
```

Component owns Markdown serialization, copied state, clipboard error, download, provenance disclosures, and start-over confirmation. `HrOnboarding` continues owning session/generation lifecycle and API errors.

### New classes—names and intent only

No new tokens needed; use existing `--ll-*` tokens.

- `.onboarding-result` — result section grid/vertical rhythm.
- `.onboarding-items` — reset ordered-list spacing.
- `.onboarding-item` — item card structure and anchor scroll margin.
- `.onboarding-item-confirm` — distinct ungrounded item border/surface treatment.
- `.onboarding-item-meta` — wrapping owner/timing/dependency row.
- `.onboarding-item-chips` — wrapping badge row.
- `.onboarding-provenance` — native disclosure spacing and focus treatment.
- `.onboarding-quote` — quoted source text with readable measure and overflow wrapping.
- `.redaction-placeholder` — monospace inline treatment for literal `<…>` labels.
- `.onboarding-read-once` — compact warning below action bar.

At narrow widths, metadata and action controls stack; quotes wrap; no horizontal item scrolling. Native `<summary>` remains keyboard-operable and receives existing focus-ring treatment, expanded as needed to cover `summary:focus-visible`.

---

## 5. Owner decisions (2026-10-26)

1. Download filename is derived from `artifact.title`. The title is model-written and untrusted: slug to `[a-z0-9-]`, cap length, fall back to `onboarding-sequence` when empty, append `.md`.
2. `llm_not_configured` shows **Try again** and **Start over**, as in the failure table.
3. Provenance disclosures are collapsed by default.

Risk: the contract is still marked proposed; copy or response semantics may change if B2 differs.
