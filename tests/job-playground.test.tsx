// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { JobPlayground } from "@/pages/JobPlayground"
import userEvent from "@testing-library/user-event"
import type { Job, Report } from "@/lib/api"

const api = vi.hoisted(() => ({
  getJob: vi.fn(),
  getMarkdown: vi.fn(),
  getReport: vi.fn(),
  deleteJob: vi.fn(),
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, getJob: api.getJob, getMarkdown: api.getMarkdown, getReport: api.getReport, deleteJob: api.deleteJob }
})

vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: true, ready: true, login: vi.fn(), logout: vi.fn() }) }))

beforeEach(() => {
  window.history.replaceState({}, "", "/")
  api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
  api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
  api.getReport.mockResolvedValue(report)
  api.deleteJob.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const completedJob: Job = {
  job_id: "read-once-job",
  status: "completed",
  created_at: "2026-10-19T12:00:00.000Z",
  started_at: "2026-10-19T12:00:01.000Z",
  completed_at: "2026-10-19T12:00:02.000Z",
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  max_bytes: 10_000_000,
  max_pages: 20,
}

const report: Report = {
  schema_version: "2",
  entity_counts: { PERSON: 1 },
  low_confidence_spans: [],
  unprocessed_pages: [],
  dropped_images: 0,
  blocks: [
    { id: "p1", page: 1, type: "paragraph", text: "Redacted placeholder text.", x: 10, y: 20, width: 100, height: 20, confidence: 1, engine: "synthetic" },
  ],
}

function RouteChanger() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate("/playground/jobs/next-job?workflow=transaction-intake")}>Next job</button>
}

function renderJob(jobId: string) {
  return render(
    <MemoryRouter initialEntries={[`/playground/jobs/${jobId}?workflow=alias-doc`]}>
      <Routes>
        <Route path="/playground/jobs/:jobId" element={<><JobPlayground /><RouteChanger /></>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("JobPlayground read-once result fetching", () => {
  it("does not read result endpoints while a completed base job's workflow is still running", async () => {
    api.getJob.mockResolvedValue({ ...completedJob, job_id: "wf-running", workflow: { id: "alias-doc", version: "1", status: "running" } })
    renderJob("wf-running")
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Running workflow…" })).toBeTruthy())
    expect(api.getMarkdown).not.toHaveBeenCalled()
    expect(api.getReport).not.toHaveBeenCalled()
  })

  it("does not read the next job's results from the previous completed job's state during route transition", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let nextDone = false
      api.getJob.mockImplementation((id: string) => Promise.resolve(id === "next-job"
        ? { ...completedJob, job_id: id, status: nextDone ? "completed" : "processing", workflow: { id: "transaction-intake", version: "1.0.0", status: nextDone ? "completed" : "running" } }
        : { ...completedJob, job_id: id }))

      renderJob("first-job")
      await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledWith("first-job"))
      fireEvent.click(screen.getByRole("button", { name: "Next job" }))
      await waitFor(() => expect(api.getJob).toHaveBeenCalledWith("next-job"))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(api.getMarkdown).not.toHaveBeenCalledWith("next-job")
      expect(api.getReport).not.toHaveBeenCalledWith("next-job")

      nextDone = true
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledWith("next-job"))
      expect(api.getMarkdown.mock.calls.filter(([id]) => id === "next-job")).toHaveLength(1)
      expect(api.getReport.mock.calls.filter(([id]) => id === "next-job")).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("stops polling on workflow failure and never reads result endpoints", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let workflowStatus: "running" | "failed" = "running"
      api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id, workflow: { id: "transaction-intake", version: "1.0.0", status: workflowStatus } }))

      renderJob("wf-failed-job")
      await waitFor(() => expect(api.getJob).toHaveBeenCalledTimes(1))
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(api.getJob).toHaveBeenCalledTimes(2)
      workflowStatus = "failed"
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(api.getJob).toHaveBeenCalledTimes(3)
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(api.getJob).toHaveBeenCalledTimes(3)
      expect(api.getMarkdown).not.toHaveBeenCalled()
      expect(api.getReport).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows a rejected job as not accepted with no loading state and no result reads", async () => {
    api.getJob.mockResolvedValue({ ...completedJob, status: "rejected", error: { code: "unsupported_type", message: "Unsupported file type." } })

    renderJob("rejected-job")
    expect(await screen.findByRole("heading", { name: "Document was not accepted" })).toBeInTheDocument()
    expect(screen.getByText("Unsupported file type.")).toBeInTheDocument()
    expect(screen.queryByText("Loading result…")).not.toBeInTheDocument()
    expect(api.getMarkdown).not.toHaveBeenCalled()
    expect(api.getReport).not.toHaveBeenCalled()
  })

  it("shows truthful workflow states for queued, processing, completed, failed, and purged jobs", async () => {
    for (const [status, expected, current] of [["queued", "Waiting to start…", "Prepare"], ["processing", "Preparing document…", "Prepare"], ["completed", "Ready to review", "Review"], ["failed", "Document could not be processed", null], ["purged", "Output is no longer available", null]] as const) {
      cleanup()
      api.getJob.mockResolvedValueOnce({ ...completedJob, job_id: `state-${status}`, status })
      renderJob(`state-${status}`)
      if (status === "failed") {
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(expected))
      } else {
        await waitFor(() => expect(screen.getByText(expected)).toBeTruthy())
      }
      const steps = screen.getByRole("list", { name: "Document workflow" })
      if (current) expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain(current)
      else expect(steps.querySelector('[aria-current="step"]')).toBeNull()
      // Source-session copy is completed-only; non-completed states render no source pane.
      if (status !== "completed") expect(screen.queryByText(/only in the browser session/)).toBeNull()
    }
  })

  it("focuses an h1 and announces status through a live region", async () => {
    api.getJob.mockResolvedValueOnce({ ...completedJob, job_id: "status-job", status: "processing" })
    renderJob("status-job")
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(document.activeElement).toBe(h1)
    await waitFor(() => expect(screen.getByText("Preparing document…")).toBeTruthy())
    cleanup()
    api.getJob.mockResolvedValueOnce({ ...completedJob, job_id: "status-failed-job", status: "failed" })
    renderJob("status-failed-job")
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Document could not be processed"))
  })

  it("renders working copy links and images inert", async () => {
    window.history.replaceState({}, "", "/playground/jobs/inert-job?tab=markdown")
    api.getMarkdown.mockResolvedValue("A [link](https://example.test) and ![d](https://example.test/i.png).")
    renderJob("inert-job")
    const article = await waitFor(() => {
      const el = document.querySelector(".playground-markdown")
      if (!el) throw new Error("not rendered")
      return el
    })
    expect(article.textContent).toContain("link")
    expect(article.querySelector("a, img")).toBeNull()
  })

  it("selects a block from the keyboard with Enter and Space", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
    api.getReport.mockResolvedValue(report)

    // jsdom lacks scrollIntoView; stub only for this test and restore it.
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    try {
      renderJob("keyboard-block-job")
      const block = await screen.findByRole("button", { name: /paragraph.*p\.1/ })
      expect(block.getAttribute("aria-pressed")).toBe("false")
      block.focus()
      fireEvent.keyDown(block, { key: "Enter" })
      expect(block.getAttribute("aria-pressed")).toBe("true")
      expect(block.classList.contains("block-selected")).toBe(true)
      fireEvent.keyDown(block, { key: " " })
      expect(block.getAttribute("aria-pressed")).toBe("true")
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it("keeps the source pane mounted while switching result tabs", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
    api.getReport.mockResolvedValue(report)

    renderJob("source-pane-job")
    await waitFor(() => expect(screen.getByLabelText("Source document")).toBeTruthy())

    for (const tabName of ["Working copy", "Report", "JSON", "Blocks"]) {
      fireEvent.click(screen.getByRole("tab", { name: tabName }))
      expect(screen.getByLabelText("Source document")).toBeTruthy()
    }
  })

  it("copies the active result tab with workflow-specific content and announces clipboard failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", Object.create(window.navigator, { clipboard: { configurable: true, value: { writeText } } }))
    api.getReport.mockResolvedValue({ ...report, entity_counts: { PERSON: 2, EMAIL_ADDRESS: 1 }, low_confidence_spans: [{}], unprocessed_pages: [3], dropped_images: 1 })
    renderJob("copy-active-tab")
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy document blocks" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Copy document blocks" }))
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("paragraph · p.1\nRedacted placeholder text."))
    await userEvent.click(screen.getByRole("tab", { name: "Report" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy redaction report" }))
    await waitFor(() => {
      const copied = writeText.mock.lastCall?.[0] as string
      for (const detail of ["Review outputs before use in your practice.", "3 items found", "Email addresses: 1", "People: 2", "Low-confidence spans: 1", "Unprocessed pages: 3", "Dropped images: 1"]) expect(copied).toContain(detail)
    })
    await userEvent.click(screen.getByRole("tab", { name: "Working copy" }))
    writeText.mockRejectedValueOnce(new Error("clipboard unavailable"))
    fireEvent.click(screen.getByRole("button", { name: "Copy working copy" }))
    await waitFor(() => expect(screen.getByText(/Copy failed/)).toBeTruthy())
  })

  it("labels the source and output panels with visible headings in the review workspace", async () => {
    renderJob("panel-heading-job")
    await waitFor(() => expect(screen.getByLabelText("Source document")).toBeTruthy())
    expect(screen.getByRole("heading", { name: "Source document" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Review output" })).toBeTruthy()
    expect(document.querySelector(".review-workspace")).toBeTruthy()
  })

  it("shows the upload hint when the uploaded file is unavailable", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
    api.getReport.mockResolvedValue(report)

    renderJob("missing-source-job")
    await waitFor(() => expect(screen.getByText("Source preview is available only in the browser session where this file was uploaded. Derived output remains available until it expires.")).toBeTruthy())
    expect(screen.getByLabelText("Source document")).toBeTruthy()
  })

  it("fetches /result/* exactly once per job across a remount", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
    api.getReport.mockResolvedValue(report)

    renderJob("read-once-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)

    // Simulate back-navigation remount for the same job: the read-once endpoints
    // must not be requested again.
    cleanup()
    renderJob("read-once-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
    expect(api.getJob).toHaveBeenCalledTimes(2)
  })

  it("copy, download, and delete do not trigger additional result reads", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", Object.create(window.navigator, { clipboard: { configurable: true, value: { writeText } } }))
    URL.createObjectURL = vi.fn(() => "blob:test"); URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    renderJob("no-reread-job")
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy document blocks" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Copy document blocks" }))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: /Download working copy/ }))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: /Delete output/ }))
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete output" }))
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalledTimes(1))
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("shows independent loading states while result reads are pending", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockReturnValue(new Promise<string>(() => undefined))
    api.getReport.mockReturnValue(new Promise<Report>(() => undefined))
    window.history.replaceState({}, "", "/playground/jobs/pending-results-job?tab=markdown")

    renderJob("pending-results-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("status").textContent).toBe("Loading result…")

    cleanup()
    window.history.replaceState({}, "", "/playground/jobs/pending-report-job?tab=report")
    renderJob("pending-report-job")
    await waitFor(() => expect(api.getReport).toHaveBeenCalledTimes(2))
    expect(screen.getByRole("status").textContent).toBe("Loading result…")
  })

  it("wraps the redaction count table in a keyboard-focusable labelled scroll region", async () => {
    window.history.replaceState({}, "", "/playground/jobs/table-region-job?tab=report")
    renderJob("table-region-job")
    const region = await screen.findByRole("region", { name: "Redaction counts" })
    expect(region.getAttribute("tabindex")).toBe("0")
    expect(region.querySelector("table.report-table")).toBeTruthy()
    expect(within(region).getByRole("table")).toBeTruthy()
  })

  it("keeps markdown when the report read fails (partial success is preserved)", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
    api.getReport.mockRejectedValueOnce(new Error("report down"))

    renderJob("split-markdown-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    expect(api.getReport).toHaveBeenCalledTimes(1)
    cleanup()
    renderJob("split-markdown-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("keeps the report when the markdown read fails", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockRejectedValueOnce(new Error("markdown down"))
    api.getReport.mockResolvedValue(report)

    renderJob("split-report-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("tab", { name: "Report" }))
    await waitFor(() => expect(api.getReport).toHaveBeenCalledTimes(1))
  })

  it("does not re-read successful endpoints on remount", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
    api.getReport.mockResolvedValue(report)

    renderJob("remount-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("tab", { name: "Working copy" }))
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)

    cleanup()
    renderJob("remount-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("does not fetch results for a purged job, even across remounts", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id, status: "purged" }))
    api.getMarkdown.mockResolvedValue("Redacted placeholder text.")
    api.getReport.mockResolvedValue(report)

    renderJob("purged-job")
    await waitFor(() => expect(screen.getByText("Output is no longer available")).toBeTruthy())
    expect(api.getMarkdown).toHaveBeenCalledTimes(0)
    expect(api.getReport).toHaveBeenCalledTimes(0)

    cleanup()
    renderJob("purged-job")
    await waitFor(() => expect(screen.getByText("Output is no longer available")).toBeTruthy())
    expect(api.getMarkdown).toHaveBeenCalledTimes(0)
    expect(api.getReport).toHaveBeenCalledTimes(0)
  })

  it("does not silently retry failed read-once endpoints on remount", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockRejectedValue(new Error("network down"))
    api.getReport.mockResolvedValue(report)

    renderJob("flaky-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("tab", { name: "Report" }))
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)

    cleanup()
    renderJob("flaky-job")
    await waitFor(() => expect(api.getMarkdown).toHaveBeenCalledTimes(1))
    expect(api.getMarkdown).toHaveBeenCalledTimes(1)
    expect(api.getReport).toHaveBeenCalledTimes(1)
  })

  it("shows already-expired output as purged and clears rendered results", async () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString()
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id, expires_at: expiresAt }))
    api.getMarkdown.mockResolvedValue("Prepared output")
    api.getReport.mockResolvedValue(report)

    renderJob("expiring-job")
    await waitFor(() => expect(screen.getByText("Output is no longer available")).toBeTruthy())
    expect(screen.queryByText("Prepared output")).toBeNull()
  })

  it("requires confirmation before deleting output and supports cancellation", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Prepared output")
    api.getReport.mockResolvedValue(report)

    renderJob("delete-job")
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete output" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Delete output" }))
    expect(screen.getByText("Delete this output?")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    expect(screen.queryByText("Delete this output?")).toBeNull()
    expect(api.deleteJob).not.toHaveBeenCalled()
  })

  it("deletes output after confirmation from report view", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Prepared output")
    api.getReport.mockResolvedValue(report)

    renderJob("delete-report-job")
    await waitFor(() => expect(screen.getByRole("tab", { name: "Report" })).toBeTruthy())
    fireEvent.click(screen.getByRole("tab", { name: "Report" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete output" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete output" }))
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith("delete-report-job"))
    expect(screen.getByText("Output is no longer available")).toBeTruthy()
  })

  it("keeps delete confirmation open when deletion fails", async () => {
    api.getJob.mockImplementation((id: string) => Promise.resolve({ ...completedJob, job_id: id }))
    api.getMarkdown.mockResolvedValue("Prepared output")
    api.getReport.mockResolvedValue(report)
    api.deleteJob.mockRejectedValue(new Error("delete failed"))

    renderJob("failed-delete-job")
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete output" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Delete output" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete output" }))
    await waitFor(() => expect(screen.getAllByText("Something went wrong — try again").length).toBeGreaterThan(0))
    expect(screen.getByText("Delete this output?")).toBeTruthy()
  })
})
