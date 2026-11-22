// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import App from "@/App"
import { TierProvider } from "@/lib/useTier"
import type { Job } from "@/lib/api"

const api = vi.hoisted(() => ({ upload: vi.fn() }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, upload: api.upload }
})

vi.mock("@/components/FileIntake", () => ({
  FileIntake: ({ busy, onSubmit }: { busy: boolean; onSubmit: (file: File, token: string) => void }) => (
    <button type="button" disabled={busy} onClick={() => onSubmit(new File(["synthetic"], "sample.pdf", { type: "application/pdf" }), "synthetic-token")}>
      Submit test upload
    </button>
  ),
}))

vi.mock("@/components/JobStatus", () => ({
  JobStatus: ({ job, onJobUpdate }: { job: Job; onJobUpdate: (job: Job) => void }) => (
    <button type="button" onClick={() => onJobUpdate({ ...job, status: "completed", expires_at: "2026-10-20T00:45:00.000Z" })}>
      Simulate completion
    </button>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const queuedJob: Job = {
  job_id: "synthetic-job-id",
  status: "queued",
  created_at: "2026-10-19T12:00:00.000Z",
  started_at: null,
  completed_at: null,
  expires_at: null,
  max_bytes: 10_000_000,
  max_pages: 20,
}

describe("MVP result status", () => {
  it("renders the waitlist form inside the waitlist section", () => {
    render(<TierProvider><MemoryRouter><App /></MemoryRouter></TierProvider>)
    const section = document.querySelector(".waitlist") as HTMLElement
    expect(section.querySelector("form")).toBeTruthy()
    expect(within(section).getByRole("button", { name: "Join Waitlist" })).toBeTruthy()
    expect(screen.getByText(/does not enable access automatically/i)).toBeTruthy()
  })

  it("updates the workspace label and expiry from the polled job without presenting the page limit as page count", async () => {
    const user = userEvent.setup()
    api.upload.mockResolvedValue(queuedJob)
    render(<TierProvider><MemoryRouter><App /></MemoryRouter></TierProvider>)

    await user.click(screen.getByRole("button", { name: "Submit test upload" }))
    await waitFor(() => expect(screen.getByText("Waiting to start…")).toBeTruthy())
    expect(screen.queryByText("Explore how to integrate AI into your practice—before you build around it.")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Simulate completion" }))

    await waitFor(() => expect(screen.getByText("Ready to review")).toBeTruthy())
    expect(screen.getByText(/^expires \d\d:\d\d$/)).toBeTruthy()
    expect(screen.queryByText(/\b20 pages\b/)).toBeNull()
  })
})
