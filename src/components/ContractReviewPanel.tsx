import { lazy, Suspense } from "react"
import { CopyControl } from "@/components/CopyControl"
import { ReviewWorkspace } from "@/components/ReviewWorkspace"
import { SOURCE_SESSION_UNAVAILABLE, getSource } from "@/lib/sourceStore"
import type { ContractReviewArtifact, Job } from "@/lib/api"
import type { Workflow } from "@/lib/workflows"

// pdf.js loads only when a PDF source is shown, matching JobPlayground.
const SourcePreview = lazy(() => import("@/components/SourcePreview").then((m) => ({ default: m.SourcePreview })))

// Native protected workflow reference: render its fixed artifact directly; do not resolve PSEUDO tokens or add a generic artifact renderer.
// Completed result uses the shared ReviewWorkspace presentation; lifecycle, retention and source ownership stay in JobWorkflowPanel.
export function ContractReviewPanel({ job, artifact }: { workflow: Workflow; job: Job; artifact: ContractReviewArtifact; onReset: () => void }) {
  const claim = artifact.artifact.claims[0]
  const copyContent = ["Protected contract review", artifact.artifact.summary, ...(claim ? ["", "Grounded point", claim.quote] : []), "", "Protected output: Personal information remains pseudonymised. This workspace does not restore original values. Review every output before use."].join("\n")
  const sourceFile = getSource(job.job_id)
  return (
    <ReviewWorkspace
      title="Protected contract review"
      notice={<p className="result-notice" role="note"><strong>Protected output.</strong> Personal information remains pseudonymised. This workspace does not restore original values. Review every output before use.</p>}
      actions={<div className="job-result-actions"><CopyControl content={copyContent} label="protected contract review" /></div>}
      source={sourceFile
        ? <Suspense fallback={<div className="playground-empty"><h2 role="status">Loading source…</h2></div>}><SourcePreview file={sourceFile} /></Suspense>
        : <div className="playground-empty"><p>{SOURCE_SESSION_UNAVAILABLE}</p></div>}
      output={<>
        <p>{artifact.artifact.summary}</p>
        {claim && <section aria-labelledby="grounded-point"><h3 id="grounded-point">Grounded point</h3><blockquote>{claim.quote}</blockquote></section>}
      </>}
    />
  )
}
