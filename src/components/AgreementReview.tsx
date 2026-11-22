import { useEffect, useRef, useState } from "react"
import { FileIntake } from "@/components/FileIntake"
import { ReviewWorkspace } from "@/components/ReviewWorkspace"
import { WorkflowPage } from "@/components/WorkflowPage"
import { CopyControl } from "@/components/CopyControl"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ApiError, submitAgreementReview, type AgreementReviewResult } from "@/lib/api"
import type { Workflow } from "@/lib/workflows"

export function AgreementReview({ workflow }: { workflow: Workflow }) {
  const [result, setResult] = useState<AgreementReviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const current = useRef<AbortController | null>(null)
  useEffect(() => () => { current.current?.abort(); current.current = null }, [])

  async function submit(file: File, token: string) {
    if (current.current) return
    const controller = new AbortController(); current.current = controller
    setBusy(true); setError(""); setResult(null)
    try {
      const next = await submitAgreementReview(file, token, controller.signal)
      if (current.current === controller) setResult(next)
    } catch (cause) {
      if (current.current !== controller || controller.signal.aborted) return
      const code = cause instanceof ApiError ? cause.code : ""
      setError(code === "pii_rejected" ? "This document contains restricted personal information and cannot be processed." : code === "pii_ambiguous" ? "Personal-information screening was inconclusive. Review the document before trying again." : code === "incompatible_artifact" ? "This workflow needs an update before the result can be shown." : code === "invalid_file" ? "The document could not be read locally. Choose a text-based PDF or DOCX." : "Analysis could not be completed. Please try again.")
    } finally {
      if (current.current === controller) { current.current = null; setBusy(false) }
    }
  }

  const report = result ? ["Agreement analysis", "", result.notice, "", "Check each finding against the cited excerpt. A citation does not guarantee that a finding is supported.", ...result.artifact.claims.flatMap((claim, index) => ["", `Finding ${index + 1}`, claim.finding, `Page ${claim.anchorId.slice(5)}`, claim.quote])].join("\n") : ""
  function download() {
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }))
    const link = document.createElement("a"); link.href = url; link.download = "agreement-analysis.txt"; link.click(); URL.revokeObjectURL(url)
  }

  return <WorkflowPage workflow={workflow} uploadLabel="Upload an agreement">
    {result ? <ReviewWorkspace title="Agreement analysis ready" outputLabel="Agreement analysis"
      source={<p>The original agreement is not available here. Review each finding against the cited excerpt and your agreement.</p>}
      output={<>
        <p role="note">{result.notice}</p>
        <p>Check each finding against the cited excerpt. A citation does not guarantee that a finding is supported.</p>
        {result.artifact.claims.length === 0 && <p>No findings were returned. This does not mean the agreement has no issues.</p>}
        {result.artifact.claims.map((claim, index) => <section key={`${claim.anchorId}:${index}`}>
          <h3>Finding {index + 1}</h3><p>{claim.finding}</p><p>Page {claim.anchorId.slice(5)}</p><blockquote>{claim.quote}</blockquote>
        </section>)}
        <p>Save this analysis before leaving; it cannot be retrieved again.</p>
        <div className="job-result-actions">
          <Button type="button" variant="secondary" onClick={download}>Download analysis</Button>
          <CopyControl content={report} label="agreement analysis" failureMessage="Copy failed. Use Download analysis instead." />
          <Button type="button" variant="secondary" onClick={() => setResult(null)}>Start over</Button>
        </div>
      </>} /> : <>
      <FileIntake samples={workflow.samples} inputModes={workflow.inputModes} acceptedFileTypes={workflow.acceptedFileTypes} onSubmit={submit} busy={busy} submitLabel={workflow.action} />
      {busy && <p role="status">Analyzing agreement…</p>}
      {error && <Alert className="pg-error">{error}</Alert>}
    </>}
  </WorkflowPage>
}
