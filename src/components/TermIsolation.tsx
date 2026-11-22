import { useProcessingFocus } from "@/components/useProcessingFocus"
import { CopyControl } from "@/components/CopyControl"
import { lazy, Suspense, useRef, useState, type FormEvent } from "react"
import { Download } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ProcessingState } from "@/components/ProcessingState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileDropzone } from "@/components/intake/FileDropzone"
import { validateFile } from "@/components/FileIntake"
import { WorkflowPage } from "@/components/WorkflowPage"
import { ReviewWorkspace } from "@/components/ReviewWorkspace"
import { submitTermIsolation, takeRawArtifact, termError, type TermIsolationArtifact, type TermVisualEvidence } from "@/lib/api"
import type { Workflow } from "@/lib/workflows"
import { useTier } from "@/lib/useTier"

// pdf.js loads only when a PDF source is shown, matching JobPlayground.
const SourcePreview = lazy(() => import("@/components/SourcePreview").then((m) => ({ default: m.SourcePreview })))
type TermTab = "terms" | "json"

export function TermIsolation({ workflow }: { workflow: Workflow }) {
  const { signedIn } = useTier()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const { processingRef, destinationRef, captureFocus } = useProcessingFocus(busy)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [result, setResult] = useState<TermIsolationArtifact | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [visualEvidence, setVisualEvidence] = useState<TermVisualEvidence[]>([])
  const [tab, setTab] = useState<TermTab>("terms")
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const pickSeq = useRef(0)

  // FileDropzone reports drops and picks unvalidated; check here so only PDF/DOCX can become the submit-ready file.
  async function pick(next: File | undefined) {
    const seq = ++pickSeq.current
    setFile(null); setError(null); setSelectedFieldId(null)
    if (!next) return
    const invalid = await validateFile(next)
    if (seq !== pickSeq.current) return
    if (invalid) setError(invalid)
    else setFile(next)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!file || !signedIn || busy) return
    setBusy(true); setError(null); setStatus("")
    try {
      const { id } = await submitTermIsolation(file)
      // One-read: never retried. A failed take surfaces as an error, not a second request.
      const taken = await takeRawArtifact(id)
      setResult(taken.artifact); setVisualEvidence(taken.visual_evidence)
      setStatus("Terms extracted. Copy or download result now.")
    } catch (cause) { setError(termError(cause)) }
    finally { captureFocus(); setBusy(false) }
  }

  // Upload and result are mutually exclusive: the form is unmounted while a result is shown, so it cannot be cleared by accident.
  // The source File lives only in this React state (never sent to the store or persisted); reset drops it with the result.
  function reset() {
    ++pickSeq.current
    setFile(null); setResult(null); setVisualEvidence([]); setError(null); setStatus(""); setTab("terms"); setSelectedFieldId(null)
  }

  const selectedField = result?.fields.find((field) => field.id === selectedFieldId && field.claim) ?? null

  const text = result?.fields.map((field) => `${field.label}\t${field.status}\t${field.value ?? "—"}${field.claim ? `\tPage ${field.claim.page}: “${field.claim.quote}”` : ""}`).join("\n") ?? ""

  const copyContent = tab === "json" && result ? JSON.stringify(result, null, 2) : text

  function download() {
    if (!result) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url; link.download = "term-isolation.json"; link.click()
    URL.revokeObjectURL(url)
    setStatus("JSON downloaded.")
  }

  const templateSelect = (
    <label>Template
      <select defaultValue="orea" disabled>
        <option value="orea">OREA Form 100 — Agreement of Purchase and Sale</option>
        <option value="placeholder" disabled>Placeholder — coming soon</option>
      </select>
    </label>
  )

  const sourcePdf = file !== null && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))

  return <WorkflowPage workflow={workflow} uploadLabel="Agreement source" optionsSlot={templateSelect}>
    {!result && !signedIn && <Alert>Sign in as a member to use this workflow. Submission is unavailable.</Alert>}
    {!result && !busy && <form className="intake-form" onSubmit={submit}>
      <FileDropzone file={file} busy={busy} compact={false} onFile={pick} />
      <Button className="submit-button" type="submit" variant="primary" disabled={!file || !signedIn}>Isolate Terms</Button>
    </form>}
    {!result && busy && <ProcessingState statusRef={processingRef} focusOnMount message="Extracting terms from the agreement…" />}
    {error && <Alert ref={destinationRef} tabIndex={-1} aria-live="polite">{error}</Alert>}
    <div role="status" aria-live="polite" aria-atomic="true" className="playground-note">{status}</div>
    {result && file && <ReviewWorkspace headingRef={destinationRef}
      title="Extracted terms"
      notice={<p className="result-notice" role="note"><strong>One-time result.</strong> Refresh or navigation loses it. Copy or download now.</p>}
      actions={<div className="job-result-actions">
         <Button type="button" variant="secondary" onClick={download}><Download size={15} aria-hidden="true" /> Download JSON</Button>
        <Button type="button" variant="primary" onClick={() => setConfirmingReset(true)}>Process another document</Button>
        <AlertDialog open={confirmingReset} onOpenChange={setConfirmingReset}><AlertDialogContent><AlertDialogTitle>Discard extracted terms?</AlertDialogTitle><AlertDialogDescription>This one-time result will be lost. Copy or download it first if you need it.</AlertDialogDescription><div className="ll-alert-actions"><AlertDialogCancel>Keep result</AlertDialogCancel><AlertDialogAction onClick={reset}>Discard result</AlertDialogAction></div></AlertDialogContent></AlertDialog>
      </div>}
      source={<>{sourcePdf
          ? <Suspense fallback={<div className="playground-empty"><h2 role="status">Loading source…</h2></div>}><SourcePreview file={file} evidence={selectedField?.claim ? visualEvidence.find((evidence) => evidence.field_id === selectedField.id) ?? selectedField.claim : null} /></Suspense>
          : <div className="playground-empty"><p>{`Visual source location is unavailable for ${file.name}. DOCX results are quote-only; check each term against the Page and quote shown in the results.`}</p></div>}</>}
      output={<>
        <Tabs value={tab} onValueChange={(value) => setTab(value as TermTab)}>
          <TabsList aria-label="Term views">
            <TabsTrigger value="terms">Extracted terms</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="terms">
            <div className="job-result-actions"><CopyControl content={copyContent} label="terms table" failureMessage="Copy failed. Download JSON is still available." /></div>
            <div className="table-scroll" role="region" aria-label="Extracted terms table" tabIndex={0}>
              <table className="report-table">
                <caption>Terms found in agreement</caption>
                <thead>
                  <tr><th scope="col">Term</th><th scope="col">Status</th><th scope="col">Value</th><th scope="col">Evidence</th></tr>
                </thead>
                <tbody>
                  {result.fields.map((field) => <tr key={field.id}>
                    <th scope="row">{field.label}</th>
                    <td>{field.status === "found" ? "Found" : field.status === "review" ? "Review source" : "Not found"}</td>
                    <td>{field.value ?? "—"}</td>
                    <td>{field.claim
                      ? <button type="button" className="evidence-select" aria-pressed={field.id === selectedFieldId} onClick={() => setSelectedFieldId(field.id)}>{`Page ${field.claim.page}: “${field.claim.quote}”`}</button>
                      : "—"}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="json"><div className="job-result-actions"><CopyControl content={copyContent} label="term JSON" failureMessage="Copy failed. Download JSON is still available." /></div><pre className="playground-json">{JSON.stringify(result, null, 2)}</pre></TabsContent>
        </Tabs>
      </>}
    />}
  </WorkflowPage>
}
