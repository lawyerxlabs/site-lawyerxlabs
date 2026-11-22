// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { ContractReviewPanel } from "@/components/ContractReviewPanel"
import { clearSource, setSource } from "@/lib/sourceStore"
import { getWorkflow } from "@/lib/workflows"
import type { ContractReviewArtifact, Job } from "@/lib/api"

const job: Job = {
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

const artifact: ContractReviewArtifact = { artifact: {
  type: "contract-review-v1", schema_version: "1", summary: "Review this clause.",
  claims: [{ documentId: "doc", anchorId: "clause/payment-7", quote: "Protected excerpt" }],
} }

function renderPanel() {
  return render(<ContractReviewPanel workflow={getWorkflow("contract-review")!} job={job} onReset={vi.fn()} artifact={artifact} />)
}

afterEach(() => { cleanup(); clearSource(job.job_id); vi.restoreAllMocks() })

it("copies protected contract findings with the pseudonymisation notice", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  renderPanel()
  fireEvent.click(screen.getByRole("button", { name: "Copy protected contract review" }))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Protected excerpt"))
  expect(writeText.mock.calls[0][0]).not.toContain("clause/payment-7")
  expect(writeText.mock.calls[0][0]).not.toContain("Page ")
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Personal information remains pseudonymised."))
})

it("renders the completed result as a ReviewWorkspace with source and output panels", () => {
  renderPanel()
  // The shared root class is what the stylesheet keys on to drop the handling aside and go full width.
  expect(document.querySelector(".review-workspace-root")).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Protected contract review" })).toBeTruthy()
  expect(screen.getByRole("region", { name: "Source document" })).toBeTruthy()
  expect(screen.getByRole("region", { name: "Review output" })).toBeTruthy()
  expect(screen.getByRole("note")).toHaveTextContent("Personal information remains pseudonymised.")
  expect(screen.getByRole("heading", { name: "Grounded point" })).toBeTruthy()
  expect(screen.getByText("Protected excerpt")).toBeTruthy()
})

it("shows the session source preview when the uploaded file is still in the session", async () => {
  // DOCX avoids pdf.js in jsdom; SourcePreview degrades to a documented message.
  setSource(job.job_id, new File(["synthetic"], "sample.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))
  renderPanel()
  expect(await screen.findByText("Source preview unavailable for this document type.")).toBeTruthy()
})

it("falls back to the session-unavailable note when the source is no longer in this session", () => {
  renderPanel()
  expect(screen.getByText("Source preview is available only in the browser session where this file was uploaded. Derived output remains available until it expires.")).toBeTruthy()
})
