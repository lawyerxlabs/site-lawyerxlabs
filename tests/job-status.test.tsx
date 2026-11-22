// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode, useState } from "react"
import { JobStatus } from "@/components/JobStatus"
import { ApiError, type Block, type Job, type Report } from "@/lib/api"

const api = vi.hoisted(() => ({
  getJob: vi.fn(),
  getMarkdown: vi.fn(),
  getReport: vi.fn(),
  deleteJob: vi.fn(),
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, ...api }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

// Result caches are session-lifetime and keyed by job ID: every test gets a fresh ID.
let testSeq = 0
let job: Job = makeJob()
function makeJob(): Job {
  return {
    job_id: `synthetic-job-id-${++testSeq}`,
    status: "completed",
    created_at: "2026-10-19T12:00:00.000Z",
    started_at: "2026-10-19T12:00:01.000Z",
    completed_at: "2026-10-19T12:00:02.000Z",
    expires_at: "2026-10-19T13:00:00.000Z",
    max_bytes: 10_000_000,
    max_pages: 20,
  }
}

beforeEach(() => {
  job = makeJob()
})

const blocks: Block[] = [
  { id: "heading-1", page: 1, type: "heading", text: "Overview", x: 0, y: 0, width: 100, height: 20, confidence: 1, engine: "synthetic" },
  { id: "paragraph-1", page: 1, type: "paragraph", text: "Redacted placeholder text.", x: 0, y: 22, width: 100, height: 20, confidence: 1, engine: "synthetic" },
  { id: "list-1", page: 1, type: "list_item", text: "A redacted item.", x: 0, y: 44, width: 100, height: 20, confidence: 0.7, engine: "synthetic" },
]

const report: Report = {
  schema_version: "2",
  entity_counts: { PERSON: 2, EMAIL_ADDRESS: 1 },
  low_confidence_spans: [{}],
  unprocessed_pages: [3],
  dropped_images: 1,
  blocks,
}

const ocrReport: Report = {
  ...report,
  // Missing ocrUsed must be treated as false (DOCX or legacy reports).
  pages: [{ page: 1, source: "ocr", ocr_model: "chandra" }],
}

function renderCompleted(onJobUpdate = vi.fn()) {
  api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
  api.getReport.mockResolvedValue(report)
  render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={onJobUpdate} />)
  return onJobUpdate
}

describe("JobStatus result workspace", () => {
  it("copies visible report details and preserves rendered document structure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    renderCompleted()
    await screen.findByRole("heading", { name: "Overview" })
    await userEvent.click(screen.getByRole("tab", { name: "Redaction report" }))
    await userEvent.click(screen.getByRole("button", { name: "Copy redaction report" }))
    const reportText = writeText.mock.lastCall?.[0] as string
    for (const detail of ["Review outputs before use in your practice.", "3 items found", "Email addresses: 1", "People: 2", "Low-confidence items: 1", "Dropped images: 1", "Unprocessed pages: 3"]) expect(reportText).toContain(detail)

    await userEvent.click(screen.getByRole("tab", { name: "Document" }))
    await userEvent.click(screen.getByRole("button", { name: "Copy document" }))
    expect(writeText.mock.lastCall?.[0]).toBe("## Overview\n\nRedacted placeholder text.\n\n- A redacted item.")
  })

  it("opens on a structured document view with the public result tabs", async () => {
    renderCompleted()
    await waitFor(() => expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy())

    expect(screen.getByRole("tab", { name: "Document" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Markdown" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy()
    expect(screen.queryByRole("tab", { name: "JSON" })).toBeNull()
    expect(screen.getByText("Redacted placeholder text.")).toBeTruthy()
    expect(screen.queryByText("# Overview")).toBeNull()
  })

  it("keeps Markdown behind its own tab and prioritizes the working-copy download", async () => {
    const user = userEvent.setup()
    renderCompleted()
    await waitFor(() => expect(screen.getByRole("button", { name: "Download working copy" })).toBeTruthy())

    expect(screen.getByRole("button", { name: "Download working copy" }).classList.contains("ll-button-primary")).toBe(true)
    expect(screen.getByRole("button", { name: "Copy document" }).classList.contains("ll-button-secondary")).toBe(true)
    expect(screen.getByRole("button", { name: "Delete output" }).classList.contains("ll-button-destructive")).toBe(true)
    expect(screen.queryByRole("button", { name: "Download report JSON" })).toBeNull()

    await user.click(screen.getByRole("tab", { name: "Markdown" }))
    expect(screen.getByLabelText("Markdown source").textContent).toContain("# Overview")
    await user.click(screen.getByRole("button", { name: "Delete output" }))
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    expect(screen.getByText("The prepared document and report will be removed immediately. This cannot be undone.")).toBeTruthy()
  })

  it("shows the detection summary above the document before the report tab", async () => {
    renderCompleted()
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    expect(screen.getByText("Review outputs before use in your practice.")).toBeTruthy()
    expect(screen.getByText("3 items found")).toBeTruthy()
    expect(screen.getByText("People")).toBeTruthy()
    expect(screen.getByText("Email addresses")).toBeTruthy()
    expect(screen.getByText(/Low-confidence items: 1/)).toBeTruthy()

    const user = userEvent.setup()
    await user.click(screen.getByRole("tab", { name: "Redaction report" }))
    expect(screen.getAllByText("Review outputs before use in your practice.").length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText("A redacted item.")).toBeNull()
  })

  it("requests read-once result endpoints only once in React StrictMode", async () => {
    api.getMarkdown.mockResolvedValue("# Overview")
    api.getReport.mockResolvedValue(report)
    render(<StrictMode><JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} /></StrictMode>)

    await waitFor(() => expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy())
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("does not fetch document-linked images or leave external links active in the fallback view", async () => {
    const unstructuredReport = { ...report, blocks: [] }
    api.getMarkdown.mockResolvedValue("A [redacted link](https://example.test) and ![diagram](https://example.test/image.png).")
    api.getReport.mockResolvedValue(unstructuredReport)
    render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await waitFor(() => expect(screen.getByText(/redacted link/)).toBeTruthy())
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByRole("img")).toBeNull()
  })

  it("reports refreshed job metadata to its parent", async () => {
    const onJobUpdate = vi.fn()
    const processingJob = { ...job, status: "processing" as const, expires_at: null }
    api.getJob.mockResolvedValue(job)
    api.getMarkdown.mockResolvedValue("# Overview")
    api.getReport.mockResolvedValue(report)
    vi.useFakeTimers()
    render(<JobStatus job={processingJob} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={onJobUpdate} />)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(onJobUpdate).toHaveBeenCalledWith(job)
  })

  it("settles from a stateful parent that feeds the polled job back as its prop", async () => {
    const queued: Job = { ...makeJob(), status: "queued", completed_at: null, expires_at: null }
    const completed: Job = { ...queued, status: "completed", completed_at: "2026-10-19T12:00:02.000Z", expires_at: "2026-10-19T13:00:00.000Z" }
    api.getJob.mockResolvedValue(completed)
    api.getMarkdown.mockResolvedValue("# Overview")
    api.getReport.mockResolvedValue(report)
    vi.useFakeTimers()
    function Parent() {
      const [current, setCurrent] = useState(queued)
      return <JobStatus job={current} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={setCurrent} />
    }
    render(<Parent />)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(api.getJob).toHaveBeenCalledTimes(1)
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy()

    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(api.getJob).toHaveBeenCalledTimes(1)
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("loads results once when a queued job is rerendered by its parent as completed", async () => {
    const queued: Job = { ...makeJob(), status: "queued", completed_at: null, expires_at: null }
    api.getMarkdown.mockResolvedValue("# Overview")
    api.getReport.mockResolvedValue(report)
    vi.useFakeTimers()
    const view = render(<JobStatus job={queued} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    view.rerender(<JobStatus job={{ ...queued, status: "completed", expires_at: "2026-10-19T13:00:00.000Z" }} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(api.getJob).not.toHaveBeenCalled()
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("does not regress a polled completed job to an older queued prop", async () => {
    const queued: Job = { ...makeJob(), status: "queued", completed_at: null, expires_at: null }
    const completed: Job = { ...queued, status: "completed", expires_at: "2026-10-19T13:00:00.000Z" }
    api.getJob.mockResolvedValue(completed)
    api.getMarkdown.mockResolvedValue("# Overview")
    api.getReport.mockResolvedValue(report)
    vi.useFakeTimers()
    const view = render(<JobStatus job={queued} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(api.getJob).toHaveBeenCalledTimes(1)
    view.rerender(<JobStatus job={{ ...queued }} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(20000) })
    expect(api.getJob).toHaveBeenCalledTimes(1)
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy()
  })

  it("keeps loaded results when a stale failed prop follows a polled completed job", async () => {
    const queued: Job = { ...makeJob(), status: "queued", completed_at: null, expires_at: null }
    const completed: Job = { ...queued, status: "completed", expires_at: "2026-10-19T13:00:00.000Z" }
    api.getJob.mockResolvedValue(completed)
    api.getMarkdown.mockResolvedValue("# Overview")
    api.getReport.mockResolvedValue(report)
    vi.useFakeTimers()
    const view = render(<JobStatus job={queued} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy()

    view.rerender(<JobStatus job={{ ...queued, status: "failed" }} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy()
    expect(screen.queryByText("Document could not be processed")).toBeNull()
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("makes no result reads when a stale completed prop follows a polled failed job", async () => {
    const queued: Job = { ...makeJob(), status: "queued", completed_at: null, expires_at: null }
    api.getJob.mockResolvedValue({ ...queued, status: "failed", error: { code: "processing_failed", message: "" } })
    vi.useFakeTimers()
    const view = render(<JobStatus job={queued} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText("Document could not be processed")).toBeTruthy()

    view.rerender(<JobStatus job={{ ...queued, status: "completed", expires_at: "2026-10-19T13:00:00.000Z" }} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText("Document could not be processed")).toBeTruthy()
    expect(api.getMarkdown).not.toHaveBeenCalled()
    expect(api.getReport).not.toHaveBeenCalled()
  })

  it("shows a rejected job as terminal with no Retry and no result reads", async () => {
    const queued: Job = { ...makeJob(), status: "queued", completed_at: null, expires_at: null }
    api.getJob.mockResolvedValue({ ...queued, status: "rejected", error: { code: "unsupported_type", message: "" } })
    vi.useFakeTimers()
    render(<JobStatus job={queued} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText("Document was not accepted")).toBeTruthy()
    expect(screen.getByText("File type is not supported")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
    expect(api.getMarkdown).not.toHaveBeenCalled()
    expect(api.getReport).not.toHaveBeenCalled()
  })
})

describe("JobStatus read-once result caches", () => {
  it("keeps a successful Markdown read when the report read fails, and never rereads on remount", async () => {
    const partialJob = job
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockRejectedValue(new ApiError(500, "server_error", ""))

    const first = render(<JobStatus job={partialJob} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByText("Result could not be displayed")).toBeTruthy())
    expect(screen.getByLabelText("Markdown source").textContent).toContain("# Overview")
    expect(screen.getByRole("button", { name: "Download working copy" })).toBeTruthy()
    first.unmount()

    render(<JobStatus job={partialJob} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText("Markdown source")).toBeTruthy())
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("keeps the report read cached when the Markdown read fails, and never rereads on remount", async () => {
    const partialJob = job
    api.getMarkdown.mockRejectedValue(new ApiError(500, "server_error", ""))
    api.getReport.mockResolvedValue(report)

    const first = render(<JobStatus job={partialJob} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByText("Result could not be displayed")).toBeTruthy())
    first.unmount()

    render(<JobStatus job={partialJob} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByText("Result could not be displayed")).toBeTruthy())
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("calls each result endpoint once under StrictMode double effects", async () => {
    const strictJob = job
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockResolvedValue(report)

    render(<StrictMode><JobStatus job={strictJob} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} /></StrictMode>)
    await waitFor(() => expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy())
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("JobStatus independent artifacts and eviction", () => {
  it("renders Markdown while the report read is still pending", async () => {
    const pendingReport = deferred<Report>()
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockReturnValue(pendingReport.promise)
    render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText("Markdown source").textContent).toContain("# Overview"))
    expect(screen.getByRole("button", { name: "Download working copy" })).toBeTruthy()
    pendingReport.resolve(report)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())
  })

  it("renders the report while the Markdown read rejects", async () => {
    api.getMarkdown.mockRejectedValue(new ApiError(500, "server_error", ""))
    api.getReport.mockResolvedValue(report)
    render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())
    expect(screen.getByText("Result could not be displayed")).toBeTruthy()
  })

  it("renders the report while the Markdown read is still pending", async () => {
    api.getMarkdown.mockReturnValue(deferred<string>().promise)
    api.getReport.mockResolvedValue(report)
    render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())
    expect(screen.getByText("Redacted placeholder text.")).toBeTruthy()
  })

  it("after successful Delete output, remount reveals nothing and reads nothing", async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockResolvedValue(report)
    api.deleteJob.mockResolvedValue(undefined)
    const first = render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={onDone} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    await user.click(screen.getByRole("button", { name: "Delete output" }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete output" }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    first.unmount()

    render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    expect(screen.queryByLabelText("Markdown source")).toBeNull()
    expect(screen.queryByText("Redacted placeholder text.")).toBeNull()
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("a delete that settles after the prop switches to another job leaves that job's output and skips onDone", async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const next = makeJob()
    let settleDelete!: () => void
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockResolvedValue(report)
    api.deleteJob.mockReturnValue(new Promise<void>((resolve) => { settleDelete = resolve }))
    const view = render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={onDone} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    await user.click(screen.getByRole("button", { name: "Delete output" }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete output" }))
    view.rerender(<JobStatus job={next} onCancel={vi.fn()} onRetry={vi.fn()} onDone={onDone} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    await act(async () => { settleDelete() })
    expect(api.deleteJob).toHaveBeenCalledWith(job.job_id)
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText("Redacted placeholder text.")).toBeTruthy()
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("after observing purged status, remount reveals nothing and reads nothing", async () => {
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockResolvedValue(report)
    const first = render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())
    first.unmount()

    const purged: Job = { ...job, status: "purged" }
    render(<JobStatus job={purged} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    expect(screen.queryByLabelText("Markdown source")).toBeNull()
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("does not read the next job's results when the prop switches from completed to queued", async () => {
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockResolvedValue(report)
    const view = render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    const next: Job = { ...makeJob(), status: "queued" }
    view.rerender(<JobStatus job={next} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    expect(screen.getByText("Waiting to start…")).toBeTruthy()
    expect(api.getMarkdown.mock.calls.map(([id]) => id)).toEqual([job.job_id])
    expect(api.getReport.mock.calls.map(([id]) => id)).toEqual([job.job_id])
  })

  it("does not read the next job's results when the prop switches from completed to purged", async () => {
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockResolvedValue(report)
    const view = render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    const next: Job = { ...makeJob(), status: "purged" }
    view.rerender(<JobStatus job={next} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    expect(screen.queryByLabelText("Markdown source")).toBeNull()
    expect(screen.queryByText("Redacted placeholder text.")).toBeNull()
    expect(api.getMarkdown.mock.calls.map(([id]) => id)).toEqual([job.job_id])
    expect(api.getReport.mock.calls.map(([id]) => id)).toEqual([job.job_id])
  })

  it("evicts results when the same job is rerendered in place as purged", async () => {
    api.getMarkdown.mockResolvedValue("# Overview\n\nRedacted placeholder text.\n")
    api.getReport.mockResolvedValue(report)
    const view = render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    view.rerender(<JobStatus job={{ ...job, status: "purged" }} onCancel={vi.fn()} onRetry={vi.fn()} onDone={vi.fn()} onJobUpdate={vi.fn()} />)

    expect(screen.queryByLabelText("Markdown source")).toBeNull()
    expect(screen.queryByText("Redacted placeholder text.")).toBeNull()
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("never repopulates deleted output when pending result reads settle after delete", async () => {
    const user = userEvent.setup()
    const onDone = vi.fn()
    const pendingMarkdown = deferred<string>()
    api.getMarkdown.mockReturnValue(pendingMarkdown.promise)
    api.getReport.mockResolvedValue(report)
    api.deleteJob.mockResolvedValue(undefined)
    render(<JobStatus job={job} onCancel={vi.fn()} onRetry={vi.fn()} onDone={onDone} onJobUpdate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole("tab", { name: "Redaction report" })).toBeTruthy())

    await user.click(screen.getByRole("button", { name: "Delete output" }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete output" }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())

    await act(async () => {
      pendingMarkdown.resolve("# Overview\n\nRedacted placeholder text.\n")
      await Promise.resolve()
    })
    expect(screen.queryByLabelText("Markdown source")).toBeNull()
    expect(screen.queryByText("Redacted placeholder text.")).toBeNull()
    expect(screen.queryByRole("tab", { name: "Redaction report" })).toBeNull()
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })
})
