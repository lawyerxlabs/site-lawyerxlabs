import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { needsPolling, pollJob } from "@/lib/pollJob"
import type { Job, WorkflowStatus } from "@/lib/api"

const api = vi.hoisted(() => ({ getJob: vi.fn() }))
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), getJob: api.getJob }))

const jobWith = (status: Job["status"]) => ({ job_id: "j1", status }) as Job
const withWorkflow = (status: Job["status"], wf: WorkflowStatus) =>
  ({ job_id: "j1", status, workflow: { id: "lx-transaction-intake", version: "1", status: wf } }) as Job

describe("needsPolling", () => {
  it("treats a completed base job with no workflow as settled", () => {
    expect(needsPolling(jobWith("completed"))).toBe(false)
  })
  it("keeps polling a completed base job while its workflow is queued or running", () => {
    expect(needsPolling(withWorkflow("completed", "queued"))).toBe(true)
    expect(needsPolling(withWorkflow("completed", "running"))).toBe(true)
  })
  it("settles a completed base job once its workflow is completed or failed", () => {
    expect(needsPolling(withWorkflow("completed", "completed"))).toBe(false)
    expect(needsPolling(withWorkflow("completed", "failed"))).toBe(false)
  })
  it("settles a rejected job as terminal", () => {
    expect(needsPolling(jobWith("rejected"))).toBe(false)
  })
  it("keeps polling non-terminal base jobs regardless of workflow", () => {
    expect(needsPolling(jobWith("queued"))).toBe(true)
    expect(needsPolling(withWorkflow("processing", "completed"))).toBe(true)
  })
})

describe("pollJob", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.getJob.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it("keeps polling at the interval while pending and stops at a terminal status", async () => {
    api.getJob.mockResolvedValueOnce(jobWith("processing")).mockResolvedValueOnce(jobWith("processing")).mockResolvedValueOnce(jobWith("completed"))
    const onJob = vi.fn()
    pollJob("j1", { initialDelay: 2000, interval: 5000, onJob, onError: vi.fn() })

    await vi.advanceTimersByTimeAsync(2000)
    expect(api.getJob).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4999)
    expect(api.getJob).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(api.getJob).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.getJob).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getJob).toHaveBeenCalledTimes(3)
    expect(onJob.mock.calls.map(([j]) => j.status)).toEqual(["processing", "processing", "completed"])
  })

  it("keeps polling a completed job while its workflow is still running", async () => {
    api.getJob.mockResolvedValueOnce(withWorkflow("completed", "running")).mockResolvedValueOnce(withWorkflow("completed", "completed"))
    const onJob = vi.fn()
    pollJob("j1", { initialDelay: 0, interval: 3000, onJob, onError: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    expect(api.getJob).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.getJob).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getJob).toHaveBeenCalledTimes(2)
  })

  it("polls immediately when initialDelay is 0", async () => {
    api.getJob.mockResolvedValue(jobWith("completed"))
    pollJob("j1", { initialDelay: 0, interval: 3000, onJob: vi.fn(), onError: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    expect(api.getJob).toHaveBeenCalledTimes(1)
  })

  it("uses a custom load instead of getJob when given", async () => {
    const onJob = vi.fn()
    pollJob("j1", { initialDelay: 0, interval: 3000, load: () => jobWith("failed"), onJob, onError: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    expect(api.getJob).not.toHaveBeenCalled()
    expect(onJob).toHaveBeenCalledWith(jobWith("failed"))
  })

  it("cancel prevents a pending timer and suppresses an in-flight update", async () => {
    let resolve!: (job: Job) => void
    api.getJob.mockReturnValueOnce(new Promise<Job>((r) => { resolve = r }))
    const onJob = vi.fn()
    const cancel = pollJob("j1", { initialDelay: 0, interval: 3000, onJob, onError: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)
    cancel()
    resolve(jobWith("processing"))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(onJob).not.toHaveBeenCalled()
    expect(api.getJob).toHaveBeenCalledTimes(1)
  })

  it("cancel before the first tick never calls getJob", async () => {
    const cancel = pollJob("j1", { initialDelay: 2000, interval: 5000, onJob: vi.fn(), onError: vi.fn() })
    cancel()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(api.getJob).not.toHaveBeenCalled()
  })

  it("a failed poll reports the error and stops until the consumer starts again", async () => {
    const boom = new Error("network")
    api.getJob.mockRejectedValueOnce(boom).mockResolvedValue(jobWith("completed"))
    const onError = vi.fn()
    const onJob = vi.fn()
    pollJob("j1", { initialDelay: 0, interval: 3000, onJob, onError })
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledWith(boom)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(api.getJob).toHaveBeenCalledTimes(1)

    // Consumer-driven retry: a fresh pollJob call restarts polling.
    pollJob("j1", { initialDelay: 0, interval: 3000, onJob, onError })
    await vi.advanceTimersByTimeAsync(0)
    expect(onJob).toHaveBeenCalledWith(jobWith("completed"))
  })
})
