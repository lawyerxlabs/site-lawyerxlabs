import { ProcessingState } from "@/components/ProcessingState"
import { useNavigate } from "react-router-dom"
import { FileIntake } from "@/components/FileIntake"
import { Alert } from "@/components/ui/alert"
import { WorkflowPage } from "@/components/WorkflowPage"
import { setSource } from "@/lib/sourceStore"
import { useWorkflowJob } from "@/lib/useWorkflowJob"
import type { Workflow } from "@/lib/workflows"

// Alias-document flow: uploads, then hands off to the job page for non-alias workflows.
export function DocaliasPanel({ workflow }: { workflow: Workflow }) {
  const navigate = useNavigate()
  const { submit, busy, error } = useWorkflowJob({ uploadId: workflow.uploadId })

  async function handleSubmit(file: File, token: string) {
    const job = await submit(file, token)
    if (!job) return
    setSource(job.job_id, file)
    const params = new URLSearchParams()
    if (workflow.id !== "docalias") params.set("workflow", workflow.id)
    navigate(`/playground/jobs/${job.job_id}${params.toString() ? `?${params.toString()}` : ""}`)
  }

  return (
    <WorkflowPage workflow={workflow} uploadLabel="Upload a document">
      {busy && <ProcessingState focusOnMount message="Uploading document…" />}
      <div hidden={busy}><FileIntake samples={workflow.samples} inputModes={workflow.inputModes} acceptedFileTypes={workflow.acceptedFileTypes} onSubmit={handleSubmit} busy={busy} submitLabel={workflow.action} /></div>
      {error && <Alert className="pg-error">{error}</Alert>}
    </WorkflowPage>
  )
}
