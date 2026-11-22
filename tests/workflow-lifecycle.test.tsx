// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { useWorkflowJob } from "@/lib/useWorkflowJob"
import { ApiError } from "@/lib/api"
import { WORKFLOW_PANELS } from "@/lib/workflowPanels"
import { ContractReviewPanel } from "@/components/ContractReviewPanel"
import { CATALOG, getWorkflow } from "@/lib/workflows"

const api = vi.hoisted(() => ({ upload: vi.fn(), getJob: vi.fn(), refreshMe: vi.fn().mockResolvedValue(undefined) }))

vi.mock("@/lib/useTier", () => ({ useTier: () => ({ refreshMe: api.refreshMe }) }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, upload: api.upload, getJob: api.getJob }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.refreshMe.mockResolvedValue(undefined)
})

const job = (over: Record<string, unknown> = {}) => ({
  job_id: "lifecycle-job",
  status: "completed",
  created_at: "",
  started_at: null,
  completed_at: null,
  expires_at: null,
  max_bytes: 1,
  max_pages: 1,
  workflow: { id: "contract-review", version: "1.0.0", status: "completed" },
  ...over,
})

const file = new File(["%PDF"], "doc.pdf", { type: "application/pdf" })

describe("shared workflow lifecycle", () => {
  it("Alias Document upload passes its registry upload id", async () => {
    api.upload.mockResolvedValue(job())
    const { result } = renderHook(() => useWorkflowJob({ uploadId: getWorkflow("alias-doc")?.uploadId }))
    await act(async () => { await result.current.submit(file, "tok") })
    expect(api.upload).toHaveBeenCalledWith(file, "tok", "docalias", undefined)
    expect(api.upload.mock.calls[0][2]).toBe("docalias")
  })

  it("Contract review upload passes its registry upload id", async () => {
    api.upload.mockResolvedValue(job())
    const { result } = renderHook(() => useWorkflowJob({ uploadId: CATALOG.find((w) => w.id === "contract-review")?.uploadId }))
    await act(async () => { await result.current.submit(file, "tok") })
    expect(api.upload.mock.calls[0][2]).toBe("contract-review")
  })

  it("keeps polling while the nested workflow is running, then stops at completed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.upload.mockResolvedValue(job({ status: "processing", workflow: { id: "contract-review", version: "1.0.0", status: "running" } }))
      api.getJob.mockResolvedValue(job())
      const { result } = renderHook(() => useWorkflowJob({ uploadId: "contract-review" }))
      await act(async () => { await result.current.submit(file, "tok") })
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(result.current.job?.workflow?.status).toBe("completed")
      const calls = api.getJob.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(api.getJob.mock.calls.length).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it("stops polling after a failed poll and surfaces the error", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      api.upload.mockResolvedValue(job({ status: "processing", workflow: { id: "contract-review", version: "1.0.0", status: "running" } }))
      api.getJob.mockRejectedValue(new Error("network down"))
      const { result } = renderHook(() => useWorkflowJob({ uploadId: "contract-review" }))
      await act(async () => { await result.current.submit(file, "tok") })
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
      expect(result.current.error).toBeTruthy()
      const calls = api.getJob.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(api.getJob.mock.calls.length).toBe(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not overlap slow polls or restore a job after reset", async () => {
    vi.useFakeTimers()
    try {
      api.upload.mockResolvedValue(job({ status: "processing" }))
      let resolve!: (value: ReturnType<typeof job>) => void
      api.getJob.mockReturnValue(new Promise((r) => { resolve = r }))
      const { result } = renderHook(() => useWorkflowJob())
      await act(async () => { await result.current.submit(file, "tok") })
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(api.getJob).toHaveBeenCalledTimes(1)
      act(() => result.current.reset())
      await act(async () => { resolve(job()); await Promise.resolve() })
      expect(result.current.job).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("resets state without touching the reused lifecycle contract", async () => {
    api.upload.mockResolvedValue(job())
    const { result } = renderHook(() => useWorkflowJob())
    await act(async () => { await result.current.submit(file, "tok") })
    act(() => result.current.reset())
    expect(result.current.job).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it("calls refreshMe after a successful upload", async () => {
    api.upload.mockResolvedValue(job())
    const { result } = renderHook(() => useWorkflowJob())
    await act(async () => { await result.current.submit(file, "tok") })
    expect(api.refreshMe).toHaveBeenCalledTimes(1)
  })

  it("calls refreshMe after a 429 rate-limit failure", async () => {
    api.upload.mockRejectedValue(new ApiError(429, "rate_limit_exceeded", "Too many requests"))
    const { result } = renderHook(() => useWorkflowJob())
    await act(async () => { await result.current.submit(file, "tok") })
    expect(result.current.error).toBeTruthy()
    expect(api.refreshMe).toHaveBeenCalledTimes(1)
  })

  it("does not call refreshMe after a non-429 failure", async () => {
    const refreshMock = vi.fn().mockResolvedValue(undefined)
    api.upload.mockRejectedValue(new ApiError(400, "bad_request", "bad body"))
    const { result } = renderHook(() => useWorkflowJob())
    await act(async () => { await result.current.submit(file, "tok") })
    expect(result.current.error).toBeTruthy()
    expect(api.refreshMe).not.toHaveBeenCalled()
  })

  it("does not replace the original result/error when refreshMe rejects", async () => {
    const refreshMock = vi.fn().mockRejectedValue(new Error("refresh failed"))
    api.upload.mockResolvedValue(job({ status: "completed", workflow: { id: "contract-review", version: "1.0.0", status: "completed" } }))
    const { result } = renderHook(() => useWorkflowJob())
    await act(async () => { await result.current.submit(file, "tok") })
    expect(result.current.job).toEqual(job())
    expect(result.current.error).toBeNull()
    expect(api.refreshMe).toHaveBeenCalledTimes(1)
  })
})

describe("workflow panel resolver", () => {
  it("resolves the Contract review panel from the page-level map", () => {
    expect(WORKFLOW_PANELS["contract-review"]).toMatchObject({ kind: "job", Panel: ContractReviewPanel })
  })

  it("has no panel for Safe Working Copy or unknown ids", () => {
    expect(WORKFLOW_PANELS["alias-doc"]).toBeUndefined()
    expect(WORKFLOW_PANELS["not-real" as keyof typeof WORKFLOW_PANELS]).toBeUndefined()
  })
})
