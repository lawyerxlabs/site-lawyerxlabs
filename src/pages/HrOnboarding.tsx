import { useProcessingFocus } from "@/components/useProcessingFocus"
import { ProcessingState } from "@/components/ProcessingState"
import { useEffect, useRef, useState } from "react"
import { MultiDocumentIntake } from "@/components/intake/MultiDocumentIntake"
import { WorkflowPage } from "@/components/WorkflowPage"
import { useHandlingContext } from "@/lib/handlingContext"
import { OnboardingResult } from "@/components/OnboardingResult"
import { ReviewWorkspace } from "@/components/ReviewWorkspace"
import { Alert } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import type { Workflow } from "@/lib/workflows"
import { ApiError, confirmOnboardClassifications, createOnboardSession, deleteOnboardSession, friendlyError, generateOnboardSequence, type OnboardArtifact, type OnboardConfirmed, type OnboardSession } from "@/lib/api"

// Closed enum from docs/hr-lab/ONBOARDING-V1-API-CONTRACT.md §4.
const documentTypes = ["job_description", "policy", "procedure", "role_document", "other", "unclassified"]

// Copy and actions from docs/hr-lab/ONBOARDING-RESULT-PANEL-DESIGN.md §3.
type GenAction = "retry" | "replace" | "startOver"
const generationErrors: Record<string, { copy: string; actions: GenAction[] }> = {
  pii_detected: { copy: "Personal data was detected before generation. Nothing was sent to the AI service. Review the source documents before trying again.", actions: ["retry", "replace"] },
  processing_failed: { copy: "The checklist could not be generated. No partial result was saved.", actions: ["retry"] },
  processing_unavailable: { copy: "Checklist generation is temporarily unavailable. Try again later.", actions: ["retry"] },
  llm_not_configured: { copy: "Checklist generation is not configured yet.", actions: ["retry", "startOver"] },
  already_generated: { copy: "This checklist was already generated and cannot be fetched again. Start over to create a new one.", actions: ["startOver"] },
  session_state_conflict: { copy: "Another session action is still in progress. Wait a moment, then try again.", actions: ["retry"] },
  session_not_found: { copy: "This session was deleted or expired. Start over with your documents.", actions: ["startOver"] },
}

// Applied when session creation succeeds: selected files are cleared and the session/types take over.
export function applyPreparedSession(
  next: OnboardSession,
  set: { setFiles: (f: File[]) => void; setSession: (s: OnboardSession) => void; setTypes: (t: Record<string, string>) => void },
) {
  set.setFiles([])
  set.setSession(next)
  set.setTypes(Object.fromEntries(next.classification_review.classifications.map((c) => [c.source_id, c.document_type])))
}

export function HrOnboardingPanel({ workflow }: { workflow: Workflow }) {
  const { freezeRun, clearRun, validateIntake, beginSubmission, cancelSubmission } = useHandlingContext()
  const [files, setFiles] = useState<File[]>([])
  const [session, setSession] = useState<OnboardSession | null>(null)
  const [types, setTypes] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<OnboardConfirmed | null>(null)
  const [artifact, setArtifact] = useState<OnboardArtifact | null>(null)
  const [busy, setBusy] = useState(false)
  const { processingRef, destinationRef, captureFocus } = useProcessingFocus(busy)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [genError, setGenError] = useState<Error | null>(null)
  const request = useRef(0)
  const inFlightGeneration = useRef<number | null>(null)
  const discarded = useRef<string | null>(null)
  const returnFocus = useRef(false)
  const sessionId = session?.session_id

  useEffect(() => () => { request.current++ }, [])
  useEffect(() => () => { if (sessionId && discarded.current !== sessionId) void deleteOnboardSession(sessionId).catch(() => {}) }, [sessionId])
  useEffect(() => { if (!session && returnFocus.current) { returnFocus.current = false; document.getElementById("files-heading")?.focus() } }, [session])

  const replace = () => { request.current++; inFlightGeneration.current = null; clearRun(); setFiles([]); setSession(null); setConfirmed(null); setTypes({}); setArtifact(null); setGenError(null); setError(null); setBusy(false); setGenerating(false) }
  const acceptedTypes = workflow.inputModes.includes("file") ? workflow.acceptedFileTypes ?? [] : []
  const invalidSelection = files.some((file) => !acceptedTypes.some((ext) => file.name.toLowerCase().endsWith(ext)))
  const selectFiles = (next: File[]) => {
    setFiles([]); setError(null)
    if (next.length > 5) { setError("Choose no more than 5 files."); return }
    if (next.some((file) => !acceptedTypes.some((ext) => file.name.toLowerCase().endsWith(ext)) || file.size === 0)) { setError("Choose non-empty files in the accepted formats."); return }
    setFiles(next)
  }
  const prepare = async () => {
    if (!files.length || !acceptedTypes.length || invalidSelection) return
    const id = ++request.current; setBusy(true); setError(null)
    try {
      const intake = await validateIntake()
      if (id !== request.current) return
      if (!intake.valid || intake.submitted !== undefined) { setError("Handling options changed or are unavailable. Reload before submitting these documents."); return }
      beginSubmission("redact")
      const next = await createOnboardSession(files, "redact")
      if (id !== request.current) { void deleteOnboardSession(next.session_id).catch(() => {}); return }
      if (next.workflow_settings?.handling !== "redact") {
        let removalConfirmed = false
        if (next.session_id) {
          try {
            await deleteOnboardSession(next.session_id)
            removalConfirmed = true
          } catch {}
        }
        if (id !== request.current) return
        cancelSubmission()
        setError(removalConfirmed
          ? "These documents were submitted and may have been processed. Redact was not confirmed; the prepared session was deleted and will not be shown. Contact support before continuing."
          : "These documents were submitted and may have been processed. Redact was not confirmed; removal of the prepared session could not be confirmed. The session was not shown. Contact support before continuing.")
        return
      }
      // Lock the verified handling value before presenting the prepared source.
      freezeRun("redact")
      applyPreparedSession(next, { setFiles, setSession, setTypes })
    } catch (e) { if (id === request.current) { cancelSubmission(); setError(e instanceof ApiError && e.code === "pii_detected" ? "Personal data was detected. Review the source documents before trying again." : friendlyError(e)) } }
    finally { if (id === request.current) { captureFocus(); setBusy(false) } }
  }
  const confirm = async () => {
    if (!session) return
    const id = ++request.current; setBusy(true); setError(null)
    try {
      const next = await confirmOnboardClassifications(session.session_id, session.sources.map((s) => ({ source_id: s.source_id, document_type: types[s.source_id] })))
      if (id === request.current) setConfirmed(next)
    } catch (e) { if (id === request.current) setError(friendlyError(e)) }
    finally { if (id === request.current) setBusy(false) }
  }
  // Read-once: one POST per click; never retried automatically.
  const generate = async () => {
    if (!session || inFlightGeneration.current !== null) return
    const id = ++request.current; inFlightGeneration.current = id; setBusy(true); setGenerating(true); setGenError(null)
    try {
      const next = await generateOnboardSequence(session.session_id)
      if (id === request.current) setArtifact(next.artifact)
    } catch (e) { if (id === request.current) setGenError(e as Error) }
    finally {
      if (inFlightGeneration.current === id) inFlightGeneration.current = null
      if (id === request.current) { setBusy(false); setGenerating(false) }
    }
  }
  const startOver = async () => {
    if (!session) return
    const id = ++request.current; const doomed = session.session_id; setBusy(true); setGenError(null)
    try {
      await deleteOnboardSession(doomed).catch((e) => { if (!(e instanceof ApiError && e.status === 404)) throw e })
      // Only a successful or 404 delete suppresses the unmount-cleanup delete; on failure cleanup retries.
      discarded.current = doomed
      if (id === request.current) { returnFocus.current = true; replace() }
    } catch (e) { if (id === request.current) setError(friendlyError(e)) }
    finally { if (id === request.current) setBusy(false) }
  }
  const hasJobDescription = Object.values(types).includes("job_description")
  const failure = genError instanceof ApiError ? generationErrors[genError.code] : undefined
  const genActions: GenAction[] = failure?.actions ?? ["retry"]

  return <>
    <div className="hr-hiring">
      {!session && <section aria-labelledby="files-heading"><h2 id="files-heading" className="visually-hidden" tabIndex={-1}>Source documents</h2>
        {busy ? <ProcessingState statusRef={processingRef} focusOnMount message="Preparing documents…" /> : <><p>Include a job description. You can upload up to 5 documents and confirm their types next.</p>
        <MultiDocumentIntake files={files} onFiles={selectFiles} busy={busy} acceptedFileTypes={acceptedTypes} />
        {!acceptedTypes.length && <p role="alert">This workflow needs an update before documents can be submitted.</p>}
        {invalidSelection && <p role="alert">The accepted formats changed. Choose your documents again.</p>}
        <Button variant="primary" disabled={busy || !files.length || !acceptedTypes.length || invalidSelection} onClick={prepare}>{busy ? "Preparing…" : "Prepare"}</Button></>}</section>}
      {error && <Alert ref={destinationRef} tabIndex={-1} role="alert">{error}</Alert>}
      {session && !artifact && <AlertDialog><section aria-labelledby="classify-heading"><h2 ref={destinationRef} tabIndex={-1} id="classify-heading">Confirm document types</h2>
        <ul>{session.sources.map((s) => <li key={s.source_id}><label>{s.filename}{" "}
          <select aria-label={`Document type for ${s.filename}`} disabled={busy || !!confirmed} value={types[s.source_id]} onChange={(e) => setTypes({ ...types,
            [s.source_id]: e.target.value })}>
            {documentTypes.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></label></li>)}</ul>
        {!hasJobDescription && <p>Classify at least one document as a job description.</p>}
        {!confirmed && <>{busy && <ProcessingState message="Confirming document types…" />}<Button variant="primary" disabled={busy || !hasJobDescription} onClick={confirm}>Confirm</Button></>}
        {confirmed && <>
          {generating ? <ProcessingState message="Generating checklist…" /> : <p role="status">Types confirmed.</p>}
          <Button variant="primary" disabled={busy || inFlightGeneration.current !== null} onClick={generate}>Generate checklist</Button>
          {genError && <Alert><p>{failure?.copy ?? friendlyError(genError)}</p>
            <div className="job-result-actions">
              {genActions.includes("retry") && <Button variant="secondary" disabled={busy} onClick={generate}>Try again</Button>}
              {genActions.includes("replace") && <AlertDialogTrigger asChild><Button variant="secondary" disabled={busy}>Replace documents</Button></AlertDialogTrigger>}
              {genActions.includes("startOver") && <AlertDialogTrigger asChild><Button variant="secondary" disabled={busy}>Start over</Button></AlertDialogTrigger>}
            </div></Alert>}
        </>}
        {!genError && <AlertDialogTrigger asChild><Button variant="secondary">Replace documents</Button></AlertDialogTrigger>}</section>
        <AlertDialogContent>
          <AlertDialogTitle>Replace onboarding work?</AlertDialogTitle>
          <AlertDialogDescription>This deletes the active source session and reviewed document types. You can upload documents again afterward.</AlertDialogDescription>
          <div className="ll-alert-actions">
            <AlertDialogCancel>Keep onboarding work</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => { void startOver() }}>Delete session and replace documents</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>}
      {session && artifact && <ReviewWorkspace
        title="Onboarding checklist ready"
        outputLabel="Onboarding checklist"
        source={<div className="playground-empty"><p>Source files are not kept in the browser, so a visual preview is unavailable. Each item cites its source file by name.</p><ul>{session.sources.map((s) => <li key={s.source_id}>{s.filename}</li>)}</ul></div>}
        output={<OnboardingResult artifact={artifact} sources={session.sources} onStartOver={startOver} startOverBusy={busy} />} />}
    </div>
  </>
}

export function HrOnboarding({ workflow }: { workflow: Workflow }) {
  return <WorkflowPage workflow={workflow} uploadLabel="Source documents"><HrOnboardingPanel workflow={workflow} /></WorkflowPage>
}
