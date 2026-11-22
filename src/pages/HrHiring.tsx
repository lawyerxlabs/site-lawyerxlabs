import { useProcessingFocus } from "@/components/useProcessingFocus"
import { ProcessingState } from "@/components/ProcessingState"
import { useEffect, useRef, useState } from "react"
import { SessionSourceIntake } from "@/components/intake/SessionSourceIntake"
import { WorkflowPage } from "@/components/WorkflowPage"
import { ReviewWorkspace } from "@/components/ReviewWorkspace"
import { CopyControl } from "@/components/CopyControl"
import { validateFile } from "@/components/FileIntake"
import { Alert } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import type { Workflow } from "@/lib/workflows"
import { createHrSession, deleteHrSession, generateHrSession, hrFriendlyError, type HrCriterion, type HrDecision, type HrGeneration, type HrSession } from "@/lib/api"
import { useHandlingContext } from "@/lib/handlingContext"

const decisions: HrDecision[] = ["confirm", "correct", "exclude", "unresolved"]

function download(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }))
  const anchor = document.createElement("a")
  anchor.href = url; anchor.download = "improved-job-description.md"; anchor.click(); URL.revokeObjectURL(url)
}

export function HrHiringPanel({ workflow }: { workflow: Workflow }) {
  const { freezeRun, clearRun, validateIntake, beginSubmission, cancelSubmission } = useHandlingContext()
  const [mode, setMode] = useState<"file" | "text">("file")
  const [sourceText, setSourceText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [session, setSession] = useState<HrSession | null>(null)
  const [decisionsState, setDecisions] = useState<Record<string, { decision: HrDecision; value: string }>>({})
  const [generation, setGeneration] = useState<HrGeneration | null>(null)
  const [busy, setBusy] = useState(false)
  const { processingRef, destinationRef, captureFocus } = useProcessingFocus(busy)
  const [error, setError] = useState<string | null>(null)
  const [generationUncertain, setGenerationUncertain] = useState(false)
  const request = useRef(0)
  const generationKey = useRef<{ fingerprint: string; key: string } | null>(null)
  const filePick = useRef(0)
  const sourceHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusSourceAfterReplace = useRef(false)
  const sessionId = session?.session_id
  // Catalog decides intake modes; a file-only workflow never shows the paste box and a text-only one never shows the PDF input.
  const modes = workflow.inputModes.filter((m) => m !== "file" || !!workflow.acceptedFileTypes?.includes(".pdf"))
  const allowFile = modes.includes("file")
  const allowText = modes.includes("text")
  const noModes = modes.length === 0
  // Only the modes still allowed by the resolved catalog feed a submission (text can be pasted before a narrowing lands).
  const activeMode = modes.includes(mode) ? mode : allowFile ? "file" : "text"
  const text = allowText && activeMode === "text" ? sourceText : ""
  const pdf = allowFile && activeMode === "file" ? file : null

  useEffect(() => () => { if (sessionId) void deleteHrSession(sessionId).catch(() => {}) }, [sessionId])

  useEffect(() => () => { request.current++ }, [])

  useEffect(() => {
    if (!session && focusSourceAfterReplace.current) {
      focusSourceAfterReplace.current = false
      sourceHeadingRef.current?.focus()
    }
  }, [session])

  // Bumping request.current makes any in-flight prepare/generate ignore its result. The sessionId effect cleanup sends the one DELETE.
  const replace = () => { focusSourceAfterReplace.current = true; request.current++; filePick.current++; setBusy(false); setSession(null); clearRun(); setGeneration(null); setDecisions({}); setError(null); setGenerationUncertain(false); generationKey.current = null }
  const prepare = async () => {
    if (!text.trim() && !pdf) return
    const id = ++request.current
    setBusy(true); setError(null); setGeneration(null); setGenerationUncertain(false); generationKey.current = null
    try {
      const intake = await validateIntake()
      if (id !== request.current) return
      if (!intake.valid) {
        setError("Handling options changed or are unavailable. Review the current options before submitting.")
        return
      }
      const expectedHandling = intake.submitted ?? workflow.handling?.default
      if (!expectedHandling) {
        setError("The requested handling mode could not be verified. Review the current options before submitting.")
        return
      }
      beginSubmission(intake.submitted)
      const next = await createHrSession(pdf ? { kind: "pdf", file: pdf } : { kind: "pasted_text", text }, intake.submitted)
      if (id !== request.current) {
        void deleteHrSession(next.session_id).catch(() => {})
        return
      }
      if (next.workflow_settings?.handling !== expectedHandling) {
        let discardConfirmed = false
        if (next.session_id) {
          try {
            await deleteHrSession(next.session_id)
            discardConfirmed = true
          } catch {}
        }
        if (id === request.current) {
          cancelSubmission()
          setError(discardConfirmed
            ? "The source was submitted and processed, but the server did not confirm the requested handling mode. The prepared session was deleted without being shown. Contact support before continuing."
            : "The server did not confirm the requested handling mode, and session removal could not be confirmed. Contact support before continuing.")
        }
        return
      }
      freezeRun(intake.submitted)
      setSession(next)
      setSourceText(""); setFile(null)
      setDecisions(Object.fromEntries(next.criteria.map((c) => [c.criterion_id, { decision: c.decision, value: "" }])))
    } catch (e) {
      if (id === request.current) { cancelSubmission(); setError(hrFriendlyError(e)) }
    } finally {
      if (id === request.current) { captureFocus(); setBusy(false) }
    }
  }
  const generate = async () => {
    if (!session || session.criteria.some((c) => !decisionsState[c.criterion_id]?.decision)) return
    const id = ++request.current; setBusy(true); setError(null)
    const criteria = session.criteria.map((c) => { const d = decisionsState[c.criterion_id]; return { criterion_id: c.criterion_id, decision: d.decision, ...(d.decision === "correct" ? { value: d.value } : {}) } })
    const fingerprint = JSON.stringify([session.session_id, criteria])
    if (generationKey.current?.fingerprint !== fingerprint) generationKey.current = { fingerprint, key: crypto.randomUUID() }
    try {
      const result = await generateHrSession(session.session_id, criteria, generationKey.current.key)
      if (id === request.current) { setGeneration(result); generationKey.current = null }
    } catch (e) {
      if (id === request.current) {
        const uncertain = !(e instanceof Error && "status" in e && typeof e.status === "number" && e.status < 500)
          || (e instanceof Error && "code" in e && ["generation_in_progress", "generation_outcome_unknown", "generation_already_completed", "generation_validation_unavailable", "generation_output_invalid", "generation_output_rejected", "generation_fact_violation"].includes(String(e.code)))
        setError(uncertain ? "Generation outcome is uncertain. Do not retry or replace this source as a resolution. Contact support to reconcile the outcome before continuing." : hrFriendlyError(e))
        setGenerationUncertain(uncertain)
      }
    } finally { if (id === request.current) setBusy(false) }
  }
  return <AlertDialog><div className="hr-hiring">
      {!session && !noModes && <section aria-labelledby="source-heading"><h2 ref={sourceHeadingRef} id="source-heading" className="visually-hidden" tabIndex={-1}>Original source</h2>
        {busy ? <ProcessingState statusRef={processingRef} focusOnMount message="Preparing job description…" /> : <><SessionSourceIntake modes={modes} mode={activeMode} onMode={setMode} file={file} text={sourceText} onText={setSourceText} busy={busy} acceptedFileTypes={workflow.acceptedFileTypes ?? []} onFile={async (selected) => { const pick = ++filePick.current; setFile(null); setError(null); const invalid = selected ? await validateFile(selected, workflow.acceptedFileTypes ?? []) : null; if (pick !== filePick.current) return; setFile(invalid ? null : selected ?? null); setError(invalid) }} />
        <Button disabled={busy || (!text.trim() && !pdf)} onClick={prepare}>{busy ? "Preparing…" : "Prepare source"}</Button></>}</section>}
      {!session && noModes && <p role="alert">This workflow needs an update before a source can be submitted.</p>}
      {error && <Alert ref={destinationRef} tabIndex={-1} role="alert">{error}</Alert>}
        {session && !generation && <><section aria-labelledby="preview-heading"><h2 ref={destinationRef} tabIndex={-1} id="preview-heading">Prepared source preview</h2><p className="hr-source-meta">Source: {session.source.kind}; SHA-256: {session.source.sha256}; handling: {session.workflow_settings?.handling ?? "the submitted mode"}</p>{session.workflow_settings?.handling === "off" && <p role="note">Personal information may remain in this source preview and may be sent for generation. Screening still applies.</p>}<pre>{session.preview.text}</pre>{session.limitations.map((x) => <p key={x}>{x}</p>)}</section><section aria-labelledby="criteria-heading"><h2 id="criteria-heading">Extracted criteria</h2>{session.criteria.map((criterion: HrCriterion) => { const state = decisionsState[criterion.criterion_id]; return <fieldset key={criterion.criterion_id} disabled={busy}><legend>{criterion.label}</legend><p>{String(criterion.extracted_value ?? "Not found")}</p>{criterion.provenance && <small>Source: {criterion.provenance.locator?.anchor ?? criterion.provenance.anchor ?? "prepared source"}</small>}{decisions.map((decision) => <label key={decision}><input type="radio" name={criterion.criterion_id} checked={state?.decision === decision} onChange={() => setDecisions((old) => ({ ...old, [criterion.criterion_id]: { ...old[criterion.criterion_id], decision } }))} /> {decision}</label>)}{state?.decision === "correct" && <input aria-label={`Correction for ${criterion.label}`} value={state.value} onChange={(e) => setDecisions((old) => ({ ...old, [criterion.criterion_id]: { ...old[criterion.criterion_id], value: e.target.value } }))} />}</fieldset>})}</section>{busy && <ProcessingState message="Generating improved job description…" />}{generationUncertain && <Alert role="alert">Generation outcome is uncertain. Do not retry or replace this source as a resolution. Contact support to reconcile the outcome before continuing.</Alert>}<Button disabled={busy || generationUncertain || session.criteria.some((c) => !decisionsState[c.criterion_id] || (decisionsState[c.criterion_id].decision === "correct" && (!decisionsState[c.criterion_id].value.trim() || decisionsState[c.criterion_id].value.length > 2000)))} onClick={generate}>Generate improved job description</Button>{!generationUncertain && <AlertDialogTrigger asChild><Button variant="secondary">Replace source</Button></AlertDialogTrigger>}</>}
      {session && generation && <div ref={(node) => node?.querySelector<HTMLElement>(".job-status-line")?.focus()}><ReviewWorkspace
        title="Improved job description ready"
        outputLabel="Improved job description"
          actions={<div className="job-result-actions"><Button variant="secondary" onClick={() => download(generation.content)}>Download Markdown</Button><CopyControl content={`${generation.content}\n\n${generation.disclaimer}`} label="improved job description" failureMessage="Copy failed. Download Markdown for the job description; the disclaimer remains visible on screen." /><AlertDialogTrigger asChild><Button variant="secondary">Replace source</Button></AlertDialogTrigger></div>}
         source={<><p>{session.workflow_settings?.handling === "off" ? "Prepared source preview. Personal information may remain in this material; screening still applies. The original file is not kept in the browser." : "Redacted preview of the prepared source. The original file is not kept in the browser."}</p><pre className="working-copy-source">{session.preview.text}</pre></>}
         output={<><pre>{generation.content}</pre><p>{generation.disclaimer}</p>{session.workflow_settings?.handling === "off" && <p role="note">This draft was generated with Off handling. Personal information may remain in the source and generated text; screening still applies.</p>}</>} /></div>}
       <AlertDialogContent>
         <AlertDialogTitle>Replace job-description source?</AlertDialogTitle>
         <AlertDialogDescription>This clears the prepared source, extracted criteria, and any generated description from this screen, and requests deletion of the session. Normal server expiry still applies.</AlertDialogDescription>
         <div className="ll-alert-actions">
           <AlertDialogCancel>Keep job description</AlertDialogCancel>
           <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={replace}>Delete source and replace</AlertDialogAction>
         </div>
       </AlertDialogContent>
     </div>
   </AlertDialog>
 }

export function HrHiring({ workflow }: { workflow: Workflow }) {
  return <WorkflowPage workflow={workflow} uploadLabel="Original source"><HrHiringPanel workflow={workflow} /></WorkflowPage>
}
