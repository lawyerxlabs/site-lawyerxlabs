import { getJob, type Job, type JobStatus, type WorkflowStatus } from "@/lib/api"

const TERMINAL: JobStatus[] = ["completed", "failed", "rejected", "purged"]
const WORKFLOW_TERMINAL: WorkflowStatus[] = ["completed", "failed"]

// Shared with useWorkflowJob: a completed base job is not settled while its workflow is queued/running.
export function needsPolling(job: Job) {
  const workflowDone = !job.workflow || WORKFLOW_TERMINAL.includes(job.workflow.status)
  return !(TERMINAL.includes(job.status) && workflowDone)
}

// Polls one job until needsPolling is false. A failed poll stops; the consumer restarts it
// (e.g. manual retry) instead of looping. The returned cancel stops the timer and suppresses any in-flight update.
export function pollJob(
  jobId: string,
  opts: {
    initialDelay: number
    interval: number
    load?: () => Job | Promise<Job>
    onJob: (job: Job) => void
    onError: (cause: unknown) => void
  },
) {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const load = opts.load ?? (() => getJob(jobId))
  const tick = async () => {
    try {
      const next = await load()
      if (stopped) return
      opts.onJob(next)
      if (needsPolling(next)) timer = setTimeout(tick, opts.interval)
    } catch (cause) {
      if (!stopped) opts.onError(cause)
    }
  }
  if (opts.initialDelay === 0) void tick()
  else timer = setTimeout(tick, opts.initialDelay)
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
