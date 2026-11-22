// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { StrictMode } from "react"
import { WorkflowShell } from "@/components/WorkflowShell"
import { clearSource, getSource } from "@/lib/sourceStore"
import { CATALOG } from "@/lib/workflows"
import type { ContractReviewArtifact, Job } from "@/lib/api"

const api = vi.hoisted(() => ({ upload: vi.fn(), getJob: vi.fn(), fetchArtifact: vi.fn(), submittedFile: null as File | null }))
const emptyWorkflowCatalog: typeof CATALOG = []

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, upload: api.upload, getJob: api.getJob, fetchArtifact: api.fetchArtifact }
})

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: true, login: vi.fn(), logout: vi.fn(), refreshMe: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock("@/lib/useWorkflowCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useWorkflowCapabilities")>()
  return { ...actual, useWorkflowCatalog: () => emptyWorkflowCatalog, handlingCapabilityStatus: (workflow: typeof CATALOG[number]) => ({ status: "ready" as const, handling: workflow.handling }) }
})

vi.mock("@/components/FileIntake", () => ({
  FileIntake: ({ busy, inputModes, onSubmit }: { busy: boolean; inputModes?: readonly string[]; onSubmit: (file: File, token: string) => void }) => (
    <>
      <output data-testid="input-modes">{inputModes?.join(",")}</output>
      <button type="button" disabled={busy} onClick={() => { const file = new File(["synthetic"], "sample.pdf", { type: "application/pdf" }); api.submittedFile = file; onSubmit(file, "synthetic-token") }}>
        Submit test upload
      </button>
    </>
  ),
}))

afterEach(() => {
  cleanup()
  clearSource(baseJob.job_id)
  api.submittedFile = null
  vi.clearAllMocks()
})

const workflow = CATALOG.find((w) => w.id === "contract-review")!
const baseJob: Job = {
  job_id: "synthetic-job-id",
  status: "completed",
  created_at: "2026-10-19T12:00:00.000Z",
  started_at: null,
  completed_at: null,
  expires_at: null,
  max_bytes: 10_000_000,
  max_pages: 20,
  workflow: { id: "contract-review", version: "1.0.0", status: "completed" },
}

const artifact: ContractReviewArtifact = {
  artifact: { type: "contract-review-v1", schema_version: "1", summary: "", claims: [] },
}

const accepts = (r: ContractReviewArtifact) => r.artifact.type === "contract-review-v1"

async function submit() {
  const user = userEvent.setup()
  render(
    <StrictMode>
      <WorkflowShell workflow={workflow} accepts={accepts}>{() => <p>panel rendered</p>}</WorkflowShell>
    </StrictMode>,
  )
  await user.click(screen.getByRole("button", { name: "Submit test upload" }))
}

describe("WorkflowShell", () => {
  it("passes workflow input modes into FileIntake", () => {
    render(<WorkflowShell workflow={{ ...workflow, inputModes: ["file", "json"] }} accepts={accepts}>{() => <p>panel rendered</p>}</WorkflowShell>)
    expect(screen.getByTestId("input-modes")).toHaveTextContent("file,json")
  })

  it("uploads with the registry upload id and renders the panel once, under StrictMode", async () => {
    api.upload.mockResolvedValue(baseJob)
    api.fetchArtifact.mockResolvedValue(artifact)
    await submit()
    await waitFor(() => expect(screen.getByText("panel rendered")).toBeTruthy())
    expect(api.upload).toHaveBeenCalledWith(expect.any(File), "synthetic-token", workflow.uploadId, undefined)
    expect(api.fetchArtifact).toHaveBeenCalledTimes(1)
  })

  it("submits the handling chosen in the Options tab", async () => {
    api.upload.mockResolvedValue(baseJob)
    api.fetchArtifact.mockResolvedValue(artifact)
    const user = userEvent.setup()
    const selectable = { capability: "selectable" as const, choices: ["reject", "redact"] as const, default: "redact" as const }
    render(<WorkflowShell workflow={{ ...workflow, handling: selectable }} accepts={accepts}>{() => <p>panel rendered</p>}</WorkflowShell>)
    await user.click(screen.getByRole("button", { name: "Submit test upload" }))
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1))
    expect(api.upload).toHaveBeenLastCalledWith(expect.any(File), "synthetic-token", workflow.uploadId, "redact")
    cleanup()

    render(<WorkflowShell workflow={{ ...workflow, handling: selectable }} accepts={accepts}>{() => <p>panel rendered</p>}</WorkflowShell>)
    await user.click(screen.getByRole("tab", { name: "Options" }))
    await user.click(screen.getByRole("radio", { name: /Reject/ }))
    await user.click(screen.getByRole("button", { name: "Submit test upload" }))
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(2))
    expect(api.upload).toHaveBeenLastCalledWith(expect.any(File), "synthetic-token", workflow.uploadId, "reject")
  })

  it("sends no handling for a fixed workflow", async () => {
    api.upload.mockResolvedValue(baseJob)
    api.fetchArtifact.mockResolvedValue(artifact)
    const user = userEvent.setup()
    render(<WorkflowShell workflow={{ ...workflow, handling: { capability: "fixed", choices: ["redact"], default: "redact" } }} accepts={accepts}>{() => <p>panel rendered</p>}</WorkflowShell>)
    expect(screen.queryByRole("tab", { name: "Options" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Submit test upload" }))
    await waitFor(() => expect(api.upload).toHaveBeenCalledTimes(1))
    expect(api.upload).toHaveBeenLastCalledWith(expect.any(File), "synthetic-token", workflow.uploadId, undefined)
  })

  it("sends the registry upload id as the third upload argument", async () => {
    api.upload.mockResolvedValue(baseJob)
    api.fetchArtifact.mockResolvedValue(artifact)
    await submit()
    await waitFor(() => expect(screen.getByText("panel rendered")).toBeTruthy())
    expect(api.upload.mock.calls[0][2]).toBe("contract-review")
  })

  it("binds the uploaded File to the job only after a successful submit", async () => {
    api.upload.mockResolvedValue(baseJob)
    api.fetchArtifact.mockResolvedValue(artifact)
    clearSource(baseJob.job_id)
    await submit()
    await waitFor(() => expect(screen.getByText("panel rendered")).toBeTruthy())
    await waitFor(() => expect(getSource(baseJob.job_id)).toBeTruthy())
    expect(getSource(baseJob.job_id)).toBe(api.submittedFile)
  })

  it("does not bind a File when the upload fails", async () => {
    api.upload.mockRejectedValue(new Error("boom"))
    clearSource(baseJob.job_id)
    await submit()
    await waitFor(() => expect(api.upload).toHaveBeenCalled())
    expect(getSource(baseJob.job_id)).toBeUndefined()
  })

  it("clears the source when the job is purged", async () => {
    const purgedJob = { ...baseJob, job_id: "purged-source", status: "purged" }
    api.upload.mockResolvedValue(purgedJob)
    clearSource(purgedJob.job_id)
    await submit()
    await waitFor(() => expect(api.upload).toHaveBeenCalled())
    expect(getSource(purgedJob.job_id)).toBeUndefined()
  })

  it("requires confirmation before clearing a contract-review result and restores focus on cancel", async () => {
    api.upload.mockResolvedValue(baseJob)
    api.fetchArtifact.mockResolvedValue(artifact)
    clearSource(baseJob.job_id)
    await submit()
    await waitFor(() => expect(screen.getByText("panel rendered")).toBeTruthy())
    const user = userEvent.setup()
    const reset = screen.getByRole("button", { name: "Process another document" })
    await user.click(reset)
    expect(getSource(baseJob.job_id)).toBeTruthy()
    await user.click(await screen.findByRole("button", { name: "Keep result" }))
    expect(screen.getByText("panel rendered")).toBeTruthy()
    expect(reset).toHaveFocus()
    await user.click(reset)
    await user.click(await screen.findByRole("button", { name: "Discard review and start another document" }))
    expect(getSource(baseJob.job_id)).toBeUndefined()
    expect(screen.getByRole("heading", { name: "Upload a document" })).toHaveFocus()
  })

  it("serves a settled artifact from cache on remount instead of re-fetching", async () => {
    const cacheJob = { ...baseJob, job_id: "cache-job-id" }
    api.upload.mockResolvedValue(cacheJob)
    api.fetchArtifact.mockResolvedValue(artifact)
    const user = userEvent.setup()
    const { unmount } = render(
      <StrictMode>
        <WorkflowShell workflow={workflow} accepts={accepts}>{() => <p>panel rendered</p>}</WorkflowShell>
      </StrictMode>,
    )
    await user.click(screen.getByRole("button", { name: "Submit test upload" }))
    await waitFor(() => expect(screen.getByText("panel rendered")).toBeTruthy())
    unmount()
    render(
      <StrictMode>
        <WorkflowShell workflow={workflow} accepts={accepts}>{() => <p>panel rendered</p>}</WorkflowShell>
      </StrictMode>,
    )
    await user.click(screen.getByRole("button", { name: "Submit test upload" }))
    await waitFor(() => expect(api.fetchArtifact).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getAllByText("panel rendered").length).toBeGreaterThan(0))
    expect(api.fetchArtifact).toHaveBeenCalledTimes(1)
  })

  it("keeps polling until the workflow completes and only then fetches the artifact", async () => {
    const running = { ...baseJob, job_id: "running-job-id", workflow: { id: "contract-review", version: "1.0.0", status: "running" as const } }
    api.upload.mockResolvedValue(running)
    api.getJob.mockResolvedValue({ ...baseJob, job_id: "running-job-id" })
    api.fetchArtifact.mockResolvedValue(artifact)
    await submit()
    expect(api.fetchArtifact).not.toHaveBeenCalled()
    await waitFor(() => expect(api.getJob).toHaveBeenCalled(), { timeout: 3000 })
    await waitFor(() => expect(screen.getByText("panel rendered")).toBeTruthy(), { timeout: 3000 })
    expect(api.fetchArtifact).toHaveBeenCalledTimes(1)
  })

  it("does not fetch the artifact when the workflow itself failed", async () => {
    api.upload.mockResolvedValue({ ...baseJob, workflow: { id: "contract-review", status: "failed" } })
    await submit()
    await waitFor(() => expect(screen.getByText(/could not process this document/)).toBeTruthy())
    expect(api.fetchArtifact).not.toHaveBeenCalled()
  })

  it("does not fetch the artifact when the job ran a different workflow", async () => {
    api.upload.mockResolvedValue({ ...baseJob, job_id: "mismatch-job-id", workflow: { id: "other", version: "1.0.0", status: "completed" } })
    await submit()
    await waitFor(() => expect(screen.getByText(/could not process this document/)).toBeTruthy())
    expect(api.fetchArtifact).not.toHaveBeenCalled()
  })

  it("fails closed when the panel does not accept the artifact", async () => {
    api.upload.mockResolvedValue({ ...baseJob, job_id: "incompatible-job-id" })
    api.fetchArtifact.mockResolvedValue({ ...artifact, artifact: { ...artifact.artifact, type: "other-v9" } })
    await submit()
    await waitFor(() => expect(screen.getByText(/needs an update/)).toBeTruthy())
    expect(screen.queryByText("panel rendered")).toBeNull()
    expect(screen.getByRole("button", { name: "Try another document" })).toBeTruthy()
    expect(screen.queryByText("Loading result…")).toBeNull()
  })

  it.each(["failed", "rejected", "purged"] as const)("offers a new document when the job is %s", async (status) => {
    api.upload.mockResolvedValue({ ...baseJob, job_id: `terminal-${status}`, status })
    await submit()
    expect(await screen.findByRole("button", { name: "Try another document" })).toBeTruthy()
    expect(screen.queryByText("Loading result…")).toBeNull()
  })

  it("offers a new document when the read-once fetch fails", async () => {
    api.upload.mockResolvedValue({ ...baseJob, job_id: "fetch-failed" })
    api.fetchArtifact.mockRejectedValue(new Error("offline"))
    await submit()
    expect(await screen.findByRole("button", { name: "Try another document" })).toBeTruthy()
    expect(screen.queryByText("Loading result…")).toBeNull()
    expect(api.fetchArtifact).toHaveBeenCalledTimes(1)
  })

  it("offers a new document when the workflow fails", async () => {
    api.upload.mockResolvedValue({ ...baseJob, job_id: "workflow-failed", workflow: { id: "contract-review", status: "failed" } })
    await submit()
    expect(await screen.findByRole("button", { name: "Try another document" })).toBeTruthy()
    expect(screen.queryByText("Loading result…")).toBeNull()
  })

  it("expires an open result and clears its source", async () => {
    const expiring = { ...baseJob, job_id: "expiring-result", expires_at: new Date(Date.now() + 500).toISOString() }
    api.upload.mockResolvedValue(expiring)
    api.fetchArtifact.mockResolvedValue(artifact)
    await submit()
    expect(await screen.findByText("panel rendered")).toBeTruthy()
    expect(await screen.findByText("Output is no longer available")).toBeTruthy()
    expect(screen.queryByText("panel rendered")).toBeNull()
    expect(getSource(expiring.job_id)).toBeUndefined()
    expect(api.fetchArtifact).toHaveBeenCalledTimes(1)
  })

  it("does not restore a discarded result on a later mount", async () => {
    const discarded = { ...baseJob, job_id: "discarded-result" }
    api.upload.mockResolvedValue(discarded)
    api.fetchArtifact.mockResolvedValue(artifact)
    await submit()
    expect(await screen.findByText("panel rendered")).toBeTruthy()
    await userEvent.setup().click(screen.getByRole("button", { name: "Process another document" }))
    await userEvent.setup().click(await screen.findByRole("button", { name: "Discard review and start another document" }))
    await userEvent.setup().click(screen.getByRole("button", { name: "Submit test upload" }))
    expect(await screen.findByText("This result is no longer available.")).toBeTruthy()
    expect(api.fetchArtifact).toHaveBeenCalledTimes(1)
  })
})
