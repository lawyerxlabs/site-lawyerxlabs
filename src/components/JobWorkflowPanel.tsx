import { useEffect, useRef, useState, type ReactNode } from "react"
import { ProcessingState } from "@/components/ProcessingState"
import { FileIntake } from "@/components/FileIntake"
import { Alert } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { fetchArtifact, friendlyError, type Job } from "@/lib/api"
import { clearSource, setSource } from "@/lib/sourceStore"
import { useWorkflowJob } from "@/lib/useWorkflowJob"
import type { Workflow } from "@/lib/workflows"

// A null entry records a discarded read without retaining its contents or fetching it again.
const pendingArtifact = new Map<string, Promise<unknown> | null>()

// Reuse a read-once request across remounts until it is discarded or expires.
function loadArtifactOnce(jobId: string, expiresAt: string | null) {
  if (pendingArtifact.has(jobId)) return pendingArtifact.get(jobId) ?? null
  const request = fetchArtifact(jobId)
  pendingArtifact.set(jobId, request)
  if (expiresAt) {
    const expire = () => {
      const delay = Date.parse(expiresAt) - Date.now()
      if (!Number.isFinite(delay) || delay <= 0) { pendingArtifact.set(jobId, null); clearSource(jobId) }
      else setTimeout(expire, Math.min(delay, 2147483647))
    }
    expire()
  }
  return request
}

class IncompatibleArtifact extends Error {}

export type WorkflowPanelProps<T> = {
  workflow: Workflow
  job: Job
  artifact: T
  onReset: () => void
}

type JobWorkflowPanelProps<T> = {
  workflow: Workflow
  accepts: (result: T) => boolean
  children: (props: WorkflowPanelProps<T>) => ReactNode
}

// /v1 job lifecycle panel: upload → poll → read-once artifact → result children.
export function JobWorkflowPanel<T>({ workflow, accepts, children }: JobWorkflowPanelProps<T>) {
  const { job, busy, error: lifecycleError, submit, reset: resetJob } = useWorkflowJob({ uploadId: workflow.uploadId ?? workflow.id })
  const [artifact, setArtifact] = useState<T | null>(null)
  const [artifactError, setArtifactError] = useState<string | null>(null)
  const artifactRequested = useRef(false)
  const generation = useRef(0)
  const intakeHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusIntakeAfterReset = useRef(false)
  const [expired, setExpired] = useState(false)
  const error = lifecycleError ?? artifactError

  useEffect(() => {
    if (job?.status === "purged") {
      pendingArtifact.set(job.job_id, null)
      clearSource(job.job_id)
    }
  }, [job])

  useEffect(() => {
    if (!job?.expires_at) return
    let timer: ReturnType<typeof setTimeout>
    const expire = () => {
      const delay = Date.parse(job.expires_at!) - Date.now()
      if (Number.isFinite(delay) && delay > 0) { timer = setTimeout(expire, Math.min(delay, 2147483647)); return }
      generation.current++
      pendingArtifact.set(job.job_id, null)
      clearSource(job.job_id)
      setArtifact(null)
      setExpired(true)
    }
    expire()
    return () => clearTimeout(timer)
  }, [job?.job_id, job?.expires_at])

  useEffect(() => {
    if (!job && focusIntakeAfterReset.current) {
      focusIntakeAfterReset.current = false
      intakeHeadingRef.current?.focus()
    }
  }, [job])

  useEffect(() => {
    if (!job || expired || job.status !== "completed" || artifact || artifactRequested.current) return
    if (job.expires_at && (!Number.isFinite(Date.parse(job.expires_at)) || Date.parse(job.expires_at) <= Date.now())) return
    if (job.workflow?.status === "queued" || job.workflow?.status === "running") return
    // Stricter than the hook on purpose: this shell requires a workflow run, so a missing one is a failure.
    // The artifact carries no workflow id; the job record is the only identity check.
    if (!job.workflow || job.workflow.status !== "completed" || job.workflow.id !== (workflow.uploadId ?? workflow.id)) {
      setArtifactError(`${workflow.label} could not process this document.`)
      return
    }
    artifactRequested.current = true
    const current = generation.current
    const request = loadArtifactOnce(job.job_id, job.expires_at)
    if (!request) { setArtifactError("This result is no longer available."); return }
    void request
      .then((result) => {
        if (current !== generation.current || pendingArtifact.get(job.job_id) !== request) return
        const typed = result as T
        if (!accepts(typed)) throw new IncompatibleArtifact("This workflow needs an update before its result can be shown.")
        setArtifact(typed)
      })
      .catch((e: unknown) => { if (current === generation.current && pendingArtifact.get(job.job_id) === request) setArtifactError(e instanceof IncompatibleArtifact ? e.message : friendlyError(e)) })
  }, [job, artifact, expired, workflow, accepts])

  function reset(discardingResult = false) {
    if (discardingResult) focusIntakeAfterReset.current = true
    generation.current++
    if (job) { clearSource(job.job_id); pendingArtifact.set(job.job_id, null) }
    resetJob()
    setArtifact(null)
    setArtifactError(null)
    setExpired(false)
    artifactRequested.current = false
  }

  return (
    <AlertDialog>
    <main className="workspace-panel">
      {error && <Alert><h2>{artifactError ? "Result could not be displayed" : "Document could not be processed"}</h2><p>{error}</p></Alert>}
      {!job && busy && <ProcessingState focusOnMount message="Uploading document…" />}
      {!job && <div hidden={busy}>{!busy && <h2 ref={intakeHeadingRef} className="visually-hidden" tabIndex={-1}>Upload a document</h2>}<FileIntake samples={workflow.samples} inputModes={workflow.inputModes} acceptedFileTypes={workflow.acceptedFileTypes} busy={busy} submitLabel={workflow.action} onSubmit={(file, token) => { void submit(file, token).then((next) => { if (next) setSource(next.job_id, file) }) }} /></div>}
      {job && !artifact && !error && !expired && job.status !== "purged" && job.status !== "failed" && job.status !== "rejected" && <ProcessingState message={job.workflow?.status === "queued" || job.workflow?.status === "running" ? "Running workflow…" : job.status === "completed" ? "Loading result…" : job.status === "queued" ? "Waiting to start…" : "Preparing document…"} />}
      {job && !error && (expired || job.status === "purged" || job.status === "failed" || job.status === "rejected") && <p role="status">{expired || job.status === "purged" ? "Output is no longer available" : "Document could not be processed"}</p>}
      {(error || expired || job?.status === "failed" || job?.status === "rejected" || job?.status === "purged") && <Button onClick={() => reset()}>Try another document</Button>}
      {job && artifact && <>
        {children({ workflow, job, artifact, onReset: reset })}
        <AlertDialogTrigger asChild><Button type="button">Process another document</Button></AlertDialogTrigger>
      </>}
      <p className="retention-note">Results are temporary and shown only in this session. Detected placeholders are not legal conclusions.</p>
      <AlertDialogContent>
        <AlertDialogTitle>Start another document?</AlertDialogTitle>
        <AlertDialogDescription>This result will be cleared from this screen; the server's normal expiry still applies. Copy it first if you need it.</AlertDialogDescription>
        <div className="ll-alert-actions">
          <AlertDialogCancel>Keep result</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: "destructive" })} onClick={() => reset(true)}>Discard review and start another document</AlertDialogAction>
        </div>
      </AlertDialogContent>
    </main>
    </AlertDialog>
  )
}
