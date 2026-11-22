import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"

type EvidenceQuestion = { theme: string; question: string; requirementId: string; requirement: string; evidence: string }
type ScreeningState = "ready" | "unavailable" | "incomplete" | "category-1-rejected"
type EvidenceState = "ready" | "unavailable" | "incomplete"

/**
 * Mirrors the committed screenHiringPackageText contract (tool-parse): accepted
 * results carry the screened text and changed flag; category_1_detected carries
 * no text; screening failures throw (screening_unavailable,
 * screening_invalid_result) and fail closed.
 */
export type ScreeningRetryResult =
  | { accepted: true; text: string; changed: boolean }
  | { accepted: false; code: "category_1_detected" }

/** Isolated, fixture-only UI. Deliberately absent from the workflow catalog and panel registry. */
export function HiringDescriptionReviewPrototype({
  draft,
  previousText,
  changed,
  screeningState = "unavailable",
  expired = false,
  pending = false,
  onApprove,
  onRepost,
  onRetryScreening,
  live = false,
}: {
  draft: string
  previousText?: string
  changed: boolean
  screeningState?: ScreeningState
  expired?: boolean
  pending?: boolean
  onApprove: (text: string) => void
  onRepost: (text: string) => void
  onRetryScreening?: (text: string) => ScreeningRetryResult | Promise<ScreeningRetryResult>
  /** Live member review: draft is read-only, so no edit can enter a screening-retry state. */
  live?: boolean
}) {
  const [text, setText] = useState(draft)
  const [screenedText, setScreenedText] = useState(screeningState === "ready" ? draft : null)
  const [retryScreeningChange, setRetryScreeningChange] = useState<{ before: string; changed: boolean } | null>(null)
  const [confirmedText, setConfirmedText] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState(false)
  const [retryRejected, setRetryRejected] = useState(false)
  const [previousTextLost, setPreviousTextLost] = useState(false)
  const previousDraft = useRef(draft)
  const previousPreviousText = useRef(previousText)
  const previousScreeningState = useRef(screeningState)
  const stateRevision = useRef(0)
  useEffect(() => {
    if (previousPreviousText.current !== undefined && previousText === undefined) {
      setConfirmedText(null)
      setPreviousTextLost(true)
    } else if (previousText !== undefined) setPreviousTextLost(false)
    const screenedResultArrived = screeningState === "ready" && previousScreeningState.current !== "ready"
    if (screenedResultArrived || previousDraft.current !== draft) {
      setText(draft)
      setScreenedText(screeningState === "ready" ? draft : null)
      setRetryScreeningChange(null)
      setDirty(false)
      setConfirmedText(null)
      setRetryRejected(false)
    }
    if (previousDraft.current !== draft || previousScreeningState.current !== screeningState || previousPreviousText.current !== previousText) {
      // Monotonic revision: moves on every parent-supplied transition, including a
      // revert back to the earlier value (A → B → A), so a pending retry can never
      // mistake a reverted state for an unchanged one.
      stateRevision.current += 1
    }
    previousDraft.current = draft
    previousPreviousText.current = previousText
    previousScreeningState.current = screeningState
  }, [draft, previousText, screeningState])
  const screeningReady = screeningState === "ready" && text === screenedText
  const rejected = screeningState === "category-1-rejected" || retryRejected
  const hasScreeningChange = retryScreeningChange?.changed ?? changed
  const screeningPreviousText = retryScreeningChange?.before ?? previousText
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  return <section aria-labelledby="description-review-title">
    <h2 id="description-review-title">Review job description draft</h2>
    {live
      ? <p role="note">Review the generated draft. This read-only text is submitted for server-side safety re-screening; approved text may differ. To change it, discard and start again.</p>
      : <p role="note">Synthetic data only. Do not enter real applicant, employee, or job-description data. This isolated prototype is not connected to screening or approval services.</p>}
    <label htmlFor="description-draft">Draft description</label>
    <textarea id="description-draft" value={text} readOnly={live} disabled={retrying} onChange={live ? undefined : (event) => { setText(event.target.value); setDirty(true); setConfirmedText(null) }} />
    {rejected ? <div role="alert">
      <p>Rejected: Category 1 content was detected. Do not approve or use this draft. Approval and generation are paused.</p>
    </div> : expired ? <div role="alert"><p>This review expired. Re-submit the current text to recover it.</p><button onClick={() => onRepost(text)}>Re-submit current text</button></div> : !screeningReady ? <div role="alert">
      <p>{screeningState === "unavailable" ? "Screening is unavailable." : screeningState === "incomplete" ? "Screening did not complete." : "This text has changed since screening and must be screened again."} Approval and generation are paused; no generation will be attempted until screening completes.</p>
      {retryError && <p role="alert">Screening retry failed. Your draft is still here; try again.</p>}
      <button disabled={!onRetryScreening || retrying} onClick={async () => {
         if (!onRetryScreening) return
         const requestedRevision = stateRevision.current
         setRetrying(true)
         setRetryError(false)
          try {
            const result = await onRetryScreening(text)
            if (stateRevision.current !== requestedRevision) {
              // Stale attempt: the parent changed draft or screening state while the
              // request was in flight — any transition counts, including a revert to
              // the original values. Discard the outcome; it describes text the
              // component no longer holds.
              return
            }
            if (result.accepted) {
              setRetryScreeningChange({ before: text, changed: result.changed })
              setText(result.text)
              setScreenedText(result.text)
              setDirty(false)
            } else {
              setRetryRejected(true)
            }
          } catch {
            if (stateRevision.current === requestedRevision) setRetryError(true)
          } finally { setRetrying(false) }
        }}>{retrying ? "Screening…" : screeningState === "ready" ? "Screen edited draft" : "Retry screening"}</button>
    </div> : <>
      {hasScreeningChange && <div aria-labelledby="changed-title"><p id="changed-title">Screening changed this draft. Compare the supplied texts, then confirm the exact text you want screened and approved.</p>
        <div><h3>Before screening</h3><pre>{screeningPreviousText ?? "Previous text unavailable"}</pre></div>
        <div><h3>Current draft</h3><pre>{text}</pre></div>
        {screeningPreviousText !== undefined
          ? <button onClick={() => setConfirmedText(text)}>Confirm this text</button>
          : previousTextLost
            ? <p role="alert">pre-screening text is unavailable. Recover the prior version before approval.</p>
            : <><p role="alert">Safety screening changed this draft. pre-screening text is unavailable; review current draft before approval.</p><Button variant="secondary" onClick={() => setConfirmedText(text)}>Confirm screened draft</Button></>}
       </div>}
      {!hasScreeningChange && <Button variant="primary" disabled={pending} onClick={() => onApprove(text)}>Approve description</Button>}
      {hasScreeningChange && confirmedText === text && <Button variant="primary" disabled={pending} onClick={() => onApprove(confirmedText)}>Approve confirmed description</Button>}
      {dirty && <p role="status">You have unsaved changes.</p>}
    </>}
  </section>
}

export function InterviewGuideReviewPrototype({
  versionId,
  questions,
}: {
  versionId: string
  questions: readonly EvidenceQuestion[]
}) {
  return <section aria-labelledby="interview-guide-title">
    <h2 id="interview-guide-title">Interview guide draft</h2>
    <p>Draft for human review · Approved description version {versionId}</p>
    {questions.length === 0 ? <p>No interview themes are available for this version.</p> : <ol>
      {questions.map((item, index) => <li key={`${item.theme}-${index}`}>
        <h3>{item.theme}</h3><p>{item.question}</p><blockquote>Evidence from approved description: “{item.evidence}”</blockquote>
        <p>Requirement {item.requirementId}: {item.requirement}</p>
      </li>)}
    </ol>}
    <p>Use role requirements only; do not include candidate-specific information. Fixture content is unverified. Evidence links and exclusion of protected-characteristic themes require server-side validation and review.</p>
  </section>
}

export function InterviewGuideGenerationGatePrototype({ evidenceState, onRetryEvidence, onGenerate }: {
  evidenceState: EvidenceState
  onRetryEvidence: () => void
  onGenerate: () => void
}) {
  if (evidenceState !== "ready") return <div role="alert">
    <p>{evidenceState === "unavailable" ? "Approved-description evidence is unavailable." : "Approved-description evidence check is incomplete."} Interview-guide generation is paused.</p>
    <button onClick={onRetryEvidence}>Retry evidence check</button>
  </div>
  return <button onClick={onGenerate}>Generate interview guide</button>
}

const OFFER_DRAFT_TEMPLATE = `Dear {{candidate}},

We propose to offer you the position of {{role}} at a pay range of {{pay_range}}, with a proposed start date of {{start_date}}.

Additional terms: {{terms}}`

type OfferDraftFields = { wording: string; candidate: string; startDate: string; terms: string }
type OfferDraftRecord = OfferDraftFields & { versionId: string }

const EMPTY_OFFER_DRAFT: OfferDraftFields = { wording: OFFER_DRAFT_TEMPLATE, candidate: "", startDate: "", terms: "" }
const offerDraftKey = (packageId: string) => `hiring-package-offer-draft:${packageId}`

const OFFER_DRAFT_FIELDS = ["versionId", "wording", "candidate", "startDate", "terms"]

/** Malformed, missing, or extra-keyed storage reads as no record; never throws. */
function readOfferDraft(key: string): OfferDraftRecord | null {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null")
    if (typeof parsed !== "object" || parsed === null) return null
    const record = parsed as Record<string, unknown>
    const keys = Object.keys(record)
    const exact = keys.length === OFFER_DRAFT_FIELDS.length && OFFER_DRAFT_FIELDS.every((field) => keys.includes(field))
    const valid = exact && OFFER_DRAFT_FIELDS.every((field) => typeof record[field] === "string")
    return valid ? (record as OfferDraftRecord) : null
  } catch {
    return null
  }
}

type OfferDraftApproved = { packageId: string; versionId: string; role: string; selectedPayRange?: string }

export function OfferDraftPrototype({ approved, onUnsaved }: { approved: OfferDraftApproved; onUnsaved?: (unsaved: boolean) => void }) {
  return <OfferDraftForm key={JSON.stringify([approved.packageId, approved.versionId])} approved={approved} onUnsaved={onUnsaved} />
}

/** Remounted per packageId+versionId by OfferDraftPrototype, so no field state or storage write crosses identities. */
function OfferDraftForm({ approved, onUnsaved }: { approved: OfferDraftApproved; onUnsaved?: (unsaved: boolean) => void }) {
  const storageKey = offerDraftKey(approved.packageId)
  const [stored, setStored] = useState(() => readOfferDraft(storageKey))
  const stale = stored !== null && stored.versionId !== approved.versionId
  const initial = stored?.versionId === approved.versionId ? stored : EMPTY_OFFER_DRAFT
  const [wording, setWording] = useState(initial.wording)
  const [candidate, setCandidate] = useState(initial.candidate)
  const [startDate, setStartDate] = useState(initial.startDate)
  const [terms, setTerms] = useState(initial.terms)
  const [dirty, setDirty] = useState(false)
  const [persisted, setPersisted] = useState(stored?.versionId === approved.versionId)
  const [discardFailed, setDiscardFailed] = useState(false)
  // Only user edits write storage, so mount/restore never overwrites an existing record.
  useEffect(() => {
    if (!dirty) return
    if (stale) {
      setPersisted(false)
      return
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ versionId: approved.versionId, wording, candidate, startDate, terms } satisfies OfferDraftRecord))
      setPersisted(true)
    } catch {
      setPersisted(false)
    }
  }, [dirty, stale, storageKey, approved.versionId, wording, candidate, startDate, terms])
  // Guard only edits sessionStorage did not keep; persisted edits survive in-tab navigation.
  useEffect(() => () => onUnsaved?.(false), [])
  useEffect(() => { onUnsaved?.(dirty && !persisted) }, [dirty, persisted])
  const discardPriorDraft = () => {
    try {
      sessionStorage.removeItem(storageKey)
    } catch {
      setDiscardFailed(true)
      return
    }
    setDiscardFailed(false)
    setStored(null)
    setWording(EMPTY_OFFER_DRAFT.wording)
    setCandidate(EMPTY_OFFER_DRAFT.candidate)
    setStartDate(EMPTY_OFFER_DRAFT.startDate)
    setTerms(EMPTY_OFFER_DRAFT.terms)
    setDirty(false)
  }
  const update = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setter(event.target.value)
    setDirty(true)
  }
  const draftStatus = persisted
    ? "Draft saved in this browser session only. Closing the tab clears it."
    : "Draft is on this page only; browser storage did not save it."
  const payRange = approved.selectedPayRange ?? ""
  const values: Record<string, string> = {
    candidate: candidate || "[Candidate name]",
    role: approved.role,
    pay_range: payRange || "[Selected pay range]",
    start_date: startDate || "[Start date]",
    terms: terms || "[Offer terms]",
  }
  const preview = wording.replace(/\{\{(candidate|role|pay_range|start_date|terms)\}\}/g, (_, key: string) => values[key])
  return <section aria-labelledby="offer-draft-title">
    <h2 id="offer-draft-title">Offer-letter draft</h2>
    {stale && <div role="alert">
      <p>A prior approved version's local draft was not restored.</p>
      {discardFailed && <p>Could not discard the prior-version draft because browser storage is unavailable. It is still stored; try again.</p>}
      <button onClick={discardPriorDraft}>Discard prior-version draft</button>
    </div>}
    <p>Local draft only. Candidate identity and offer terms stay in this page and are not sent to a server.</p>
    <p>Draft placeholder wording. Human review required before use.</p>
    <label>Offer draft wording<textarea value={wording} onChange={update(setWording)} rows={6} /></label>
    <label>Candidate name<input maxLength={200} value={candidate} onChange={update(setCandidate)} /></label>
    <p>Approved role: {approved.role}</p>
    <p>Selected pay range: {payRange || "[Pay range not supplied]"}</p>
    {!payRange && <p role="status">Incomplete: select a pay range in the compensation step before using this draft.</p>}
    <label>Start date<input type="date" value={startDate} onChange={update(setStartDate)} /></label>
    <label>Additional terms (optional)<textarea maxLength={2000} value={terms} onChange={update(setTerms)} /></label>
    {(dirty || persisted) && <p role="status">{draftStatus}</p>}
    <p>If no additional terms apply, remove the offer-terms placeholder from the final document. Resolve every bracketed placeholder before use.</p>
    <h3 id="offer-draft-preview-title">Preview</h3>
    <p><a href="#offer-draft-preview">Go to offer draft preview</a></p>
    <pre id="offer-draft-preview" tabIndex={-1}>{preview}</pre>
    <p role="note">Draft for human review only; not legal advice or legal approval. Nothing is sent automatically.</p>
  </section>
}
