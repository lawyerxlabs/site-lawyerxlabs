import { useProcessingFocus } from "@/components/useProcessingFocus"
import { ProcessingState } from "@/components/ProcessingState"
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import { SessionSourceIntake } from "@/components/intake/SessionSourceIntake"
import { WorkflowPage } from "@/components/WorkflowPage"
import { Alert } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { ReviewWorkspace } from "@/components/ReviewWorkspace"
import { CopyControl } from "@/components/CopyControl"
import type { Workflow } from "@/lib/workflows"
import { ApiError, createTxSession, deleteTxSession, type TxField, type TxFieldStatus, type TxSession, type TxSource } from "@/lib/api"
import { useHandlingContext } from "@/lib/handlingContext"

// Fixed field order. Values and statuses are only read from the server session; never from the request body.
const FIELDS = [
  ["buyer", "Buyer"],
  ["seller", "Seller"],
  ["property_address", "Property address"],
  ["purchase_price", "Purchase price"],
  ["deposit", "Deposit"],
  ["irrevocability", "Irrevocability"],
  ["completion_date", "Completion date"],
] as const

type FieldId = (typeof FIELDS)[number][0]
type ReviewStatus = "unreviewed" | "confirmed" | "corrected" | "rejected"
type Review = { status: ReviewStatus; correction: string }

// pdf.js loads only when a PDF source is shown, matching JobPlayground.
const SourcePreview = lazy(() => import("@/components/SourcePreview").then((m) => ({ default: m.SourcePreview })))

const locatorText = (l: { page: number; anchor: string }) => `p.${l.page} ${l.anchor}`
const BADGE: Record<TxFieldStatus, string> = { found: "Found", ambiguous: "Ambiguous", not_found: "Not found" }
const REVIEW_LABEL: Record<ReviewStatus, string> = { unreviewed: "Not reviewed", confirmed: "Confirmed", corrected: "Corrected", rejected: "Cannot determine" }
const TEMPLATES = [
  { id: "auto", label: "Auto-detect" },
  { id: "ontario-orea-form-100-aps", label: "OREA Form 100 APS" },
]

type Failure = { kind: "template_unmatched" | "other"; message: string }

// Fixed copy by code/status only. Server messages are never shown or logged.
function failure(e: unknown): Failure {
  if (!(e instanceof ApiError)) return { kind: "other", message: "Something went wrong — try again" }
  if (e.status === 404) return { kind: "other", message: "This session expired or is unavailable. Start again." }
  if (e.code === "template_unmatched") return { kind: "template_unmatched", message: "The source does not match the selected template. Choose a template below, then retry." }
  if (e.code === "invalid_source" || e.code === "too_large") return { kind: "other", message: "This source cannot be processed. Paste text or choose one PDF within the size limit." }
  if (e.code === "extraction_failed") return { kind: "other", message: "Text extraction failed. Try again or use a different source." }
  if (e.code === "queue_full" || e.code === "session_limit_reached") return { kind: "other", message: "The service is busy. Try again later." }
  if (e.code === "feature_disabled") return { kind: "other", message: "Transaction review is not available." }
  if (e.code === "unauthorized") return { kind: "other", message: "Sign in again to continue." }
  return { kind: "other", message: "Something went wrong — try again" }
}

const deleteQuietly = (id: string) => void deleteTxSession(id).catch(() => {})

// Client-side guard only so non-PDF files never reach the Tx API; the server still validates.
const isPdf = (file: File) => file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name))
const NON_PDF: Failure = { kind: "other", message: "Only PDF files can be uploaded here. Paste text instead, or choose a PDF." }

export function TransactionReview({ workflow }: { workflow: Workflow }) {
  const [template, setTemplate] = useState("auto")
  const templateSelect = (
    <label>
      Template
      <select value={template} onChange={(e) => setTemplate(e.target.value)}>
        {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
  )
  return <WorkflowPage workflow={workflow} uploadLabel="Transaction source" optionsSlot={templateSelect}><TransactionReviewPanel workflow={workflow} template={template} templateSelect={templateSelect} /></WorkflowPage>
}

// Rendered inside WorkflowPage so it can read the selected handling from context.
function TransactionReviewPanel({ workflow, template, templateSelect }: { workflow: Workflow; template: string; templateSelect: ReactNode }) {
  const { freezeRun, clearRun, validateIntake, beginSubmission, cancelSubmission } = useHandlingContext()
  const [mode, setMode] = useState<"file" | "text">("file")
  const [sourceText, setSourceText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [session, setSession] = useState<TxSession | null>(null)
  const [reviews, setReviews] = useState<Partial<Record<FieldId, Review>>>({})
  const [draft, setDraft] = useState<{ id: FieldId; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const { processingRef, destinationRef, captureFocus } = useProcessingFocus(busy)
  const [error, setError] = useState<Failure | null>(null)
  const request = useRef(0)
  const active = useRef<string | null>(null)
  const intakeHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusIntakeAfterReplace = useRef(false)

  // Unmount: invalidate in-flight create and delete the active session. Only the ref is read, so no re-run on state change.
  useEffect(() => () => {
    request.current++
    if (active.current) deleteQuietly(active.current)
    active.current = null
  }, [])

  useEffect(() => {
    if (!session && focusIntakeAfterReplace.current) {
      focusIntakeAfterReplace.current = false
      intakeHeadingRef.current?.focus()
    }
  }, [session, busy])

  // Explicit only: called from the Submit / Retry button, never from mount or input change.
  async function submit() {
    const source: TxSource | null = activeMode === "file" && file ? { kind: "pdf", file } : activeMode === "text" && sourceText.trim() ? { kind: "pasted_text", text: sourceText } : null
    if (!source) return
    const id = ++request.current
    setBusy(true); setError(null)
    try {
      const intake = await validateIntake()
      if (id !== request.current) return
      if (!intake.valid) { setError({ kind: "other", message: "Handling options changed or are unavailable. Review the current options before submitting." }); return }
      beginSubmission(intake.submitted)
      const next = await createTxSession(source, template, intake.submitted)
      // Replaced or unmounted while in flight: discard the newly created session.
      if (id !== request.current) { deleteQuietly(next.session_id); return }
      active.current = next.session_id
      freezeRun(intake.submitted)
      setSession(next); setReviews({}); setDraft(null)
    } catch (e) {
      if (id === request.current) { cancelSubmission(); setError(failure(e)) }
    } finally {
      if (id === request.current) { captureFocus(); setBusy(false) }
    }
  }

  function replace() {
    focusIntakeAfterReplace.current = true
    request.current++
    if (active.current) deleteQuietly(active.current)
    active.current = null
    clearRun()
    setSession(null); setReviews({}); setDraft(null); setError(null); setBusy(false)
    setSourceText(""); setFile(null)
  }

  const setReview = (id: FieldId, review: Review) => setReviews((old) => ({ ...old, [id]: review }))
  const modes = workflow.inputModes.filter((m) => m !== "file" || !!workflow.acceptedFileTypes?.includes(".pdf"))
  const activeMode = modes.includes(mode) ? mode : modes.includes("file") ? "file" : "text"
  const hasSource = modes.includes(activeMode) && (activeMode === "file" ? Boolean(file) : Boolean(sourceText.trim()))
  const partial = session && FIELDS.some(([id]) => session.fields[id]?.status !== "found")
  const copyContent = session ? [
    "Transaction review — draft; professional review required.",
    `Template: ${session.matched_template.name} v${session.matched_template.version}`,
    ...(partial ? ["Partial evidence: some fields are ambiguous or not located. Check the source before relying on this draft."] : []),
    ...FIELDS.map(([id, label]) => {
      const field = session.fields[id]
      const status = field?.status ?? "not_found"
      const review = reviews[id] ?? { status: "unreviewed" as const, correction: "" }
      const value = review.status === "corrected" ? review.correction : status === "found" ? field?.value ?? "Not located in source" : status === "ambiguous" ? "Ambiguous — no value shown" : "Not located in source"
      const evidence = field?.locators.length ? `; Source: ${field.locators.map((l) => l.anchor).join("; ")}` : ""
      return `${label}: ${value} [${BADGE[status]}${field?.page != null ? `; Page ${field.page}` : ""}${evidence}; Review: ${REVIEW_LABEL[review.status]}]`
    }),
  ].join("\n") : ""

  const notice = <p className="tx-notice" role="note">Professional review required — this is a draft.</p>

  return <>
    {!session && <section aria-labelledby="tx-source-heading">
      <h2 ref={intakeHeadingRef} id="tx-source-heading" className="visually-hidden" tabIndex={-1}>Source</h2>
      {busy ? <><ProcessingState statusRef={processingRef} focusOnMount message="Preparing transaction review…" /><Button type="button" variant="secondary" onClick={replace}>Cancel</Button></> : <><SessionSourceIntake modes={modes} mode={activeMode} onMode={setMode} file={file} text={sourceText} onText={setSourceText} busy={busy} acceptedFileTypes={workflow.acceptedFileTypes ?? []} onFile={(picked) => { const ok = !picked || isPdf(picked); setFile(ok ? picked ?? null : null); setError(ok ? null : NON_PDF) }} />
      {!hasSource && !busy && <p role="status">No source yet. Paste text or upload one PDF.</p>}
      {error?.kind === "template_unmatched" && templateSelect}
      <Button type="button" disabled={busy || !hasSource} onClick={submit}>
        {error?.kind === "template_unmatched" ? "Retry with selected template" : "Prepare review"}
      </Button></>}
    </section>}
    {!session && notice}
    {error && <Alert ref={destinationRef} tabIndex={-1} role="alert">{error.message}</Alert>}
    {session && <AlertDialog><ReviewWorkspace headingRef={destinationRef}
      title="Review ready. Check the extracted fields below."
      notice={notice}
       actions={<div className="job-result-actions"><CopyControl content={copyContent} label="transaction review" /><AlertDialogTrigger asChild><Button type="button" variant="secondary">Replace source</Button></AlertDialogTrigger></div>}
      source={activeMode === "file" && file
        ? <Suspense fallback={<div className="playground-empty"><h2 role="status">Loading source…</h2></div>}><SourcePreview file={file} /></Suspense>
        : <pre className="working-copy-source">{sourceText}</pre>}
      outputLabel="Extracted fields"
      output={<>
      <p>Template: {session.matched_template.name} v{session.matched_template.version}</p>
      {partial && <p role="note">Partial evidence: some fields are ambiguous or not located. Check the source before relying on this draft.</p>}
      {FIELDS.map(([id, label]) => {
        const field: TxField | undefined = session.fields[id]
        const status: TxFieldStatus = field?.status ?? "not_found"
        const review: Review = reviews[id] ?? { status: "unreviewed", correction: "" }
        // Ambiguous and not-found values are never shown; the server value is used only when found.
        const text = review.status === "corrected" ? review.correction : status === "found" ? field?.value ?? null : null
        const placeholder = status === "ambiguous" ? "Ambiguous — no value shown" : "Not located in source"
        return <fieldset key={id}>
          <legend>{label}</legend>
          <p><span className={`tx-badge tx-badge--${status}`}>{BADGE[status]}</span> {text ?? placeholder}</p>
          <small>{field?.page != null ? `Page ${field.page}` : "No page"}{field?.locators.length ? ` · Source: ${field.locators.map(locatorText).join("; ")}` : ""}</small>
          <p>Review: {REVIEW_LABEL[review.status]}</p>
          <button type="button" aria-label={`Confirm ${label}`} onClick={() => setReview(id, { status: "confirmed", correction: "" })}>Confirm</button>
          <button type="button" aria-label={`Correct ${label}`} onClick={() => setDraft({ id, text: text ?? "" })}>Correct</button>
          <button type="button" aria-label={`Cannot determine ${label}`} onClick={() => setReview(id, { status: "rejected", correction: "" })}>Cannot determine</button>
          {draft?.id === id && <div>
            <input aria-label={`Correction for ${label}`} value={draft.text} onChange={(e) => setDraft({ id, text: e.target.value })} />
            <button type="button" disabled={!draft.text.trim()} onClick={() => { setReview(id, { status: "corrected", correction: draft.text.trim() }); setDraft(null) }}>Save</button>
          </div>}
        </fieldset>
      })}
      </>} />
      <AlertDialogContent>
        <AlertDialogTitle>Replace transaction review?</AlertDialogTitle>
        <AlertDialogDescription>This clears the review from this screen and requests deletion of its source session. Normal server expiry still applies. Copy the review first if you need it.</AlertDialogDescription>
        <div className="ll-alert-actions">
          <AlertDialogCancel>Keep review</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={replace}>Discard review and replace source</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>}
  </>
}
