import { useEffect, useRef, useState } from "react"
import { useHandlingContext } from "@/lib/handlingContext"
import { useTier } from "@/lib/useTier"
import { ApiError, friendlyError, upload, type Job } from "@/lib/api"
import { needsPolling, pollJob } from "@/lib/pollJob"

type UseWorkflowJobOptions = {
  uploadId?: string
}

export function useWorkflowJob({ uploadId }: UseWorkflowJobOptions = {}) {
  const [job, setJob] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { refreshMe } = useTier()
  // Outside a WorkflowPage (DocaliasPanel, fixed handling) this is undefined, so nothing is sent.
  const { submitted, validateIntake, beginSubmission, cancelSubmission, freezeRun, clearRun } = useHandlingContext()
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  const jobId = job?.job_id
  const polling = job !== null && needsPolling(job)

  useEffect(() => {
    if (!jobId || !polling) return
    return pollJob(jobId, {
      initialDelay: 1000,
      interval: 1000,
      onJob: setJob,
      onError: (cause) => setError(friendlyError(cause)),
    })
  }, [jobId, polling])

  async function submit(file: File, token: string) {
    const id = ++request.current
    setBusy(true)
    setError(null)
    try {
      const intake = await validateIntake()
      if (id !== request.current) return null
      if (!intake.valid) throw new Error("Handling options changed or are unavailable. Review the current options before submitting.")
      beginSubmission(intake.submitted)
      const next = await upload(file, token, uploadId, intake.submitted)
      if (id !== request.current) return null
      freezeRun(intake.submitted)
      setJob(next)
      setBusy(false)
      void refreshMe().catch(() => {})
      return next
    } catch (cause) {
      if (id === request.current) cancelSubmission()
      if (id === request.current) setError(cause instanceof Error && cause.message.startsWith("Handling options changed") ? cause.message : friendlyError(cause))
      if (id === request.current) setBusy(false)
      if (cause instanceof ApiError && cause.status === 429) void refreshMe().catch(() => {})
      return null
    }
  }

  function reset() {
    request.current++
    clearRun()
    setJob(null)
    setError(null)
    setBusy(false)
  }

  return { job, busy, error, submit, reset }
}
