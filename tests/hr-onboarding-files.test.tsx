// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"

vi.hoisted(() => { vi.stubEnv("VITE_SURFACE", "human-resources") })
vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: true, identity: null, ready: true, login: vi.fn(), logout: vi.fn() }) }))
vi.mock("@/lib/useWorkflowCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useWorkflowCapabilities")>()
  const { TEST_WORKFLOW_CAPABILITIES } = await import("./fixtures/workflow-capabilities")
  return { ...actual, useWorkflowCatalog: () => TEST_WORKFLOW_CAPABILITIES, refreshWorkflowCapabilities: async () => TEST_WORKFLOW_CAPABILITIES }
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const txt = (name: string) => new File(["synthetic"], name, { type: "text/plain" })
const created = {
  session_id: "onb_files_1234567890", expires_at: "2026-10-25T12:00:00Z", status: "awaiting_classification_confirmation",
  workflow_settings: { handling: "redact" },
  sources: [{ source_id: "src_1", filename: "only.txt", media_type: "text/plain" }],
  classification_review: { classifications: [{ source_id: "src_1", document_type: "unclassified", confidence: "low", alternatives: [] }], job_description_source_ids: [] },
}

function mount() {
  return render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
}

describe("HR onboarding multi-file intake", () => {
  it("posts only the most recent file selection, not files from an earlier pick", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(created), { status: 201 }))
    mount()
    const input = screen.getByLabelText("Upload source documents")
    fireEvent.change(input, { target: { files: [txt("a.txt"), txt("b.txt")] } })
    fireEvent.change(input, { target: { files: [txt("only.txt")] } })
    await waitFor(() => expect((screen.getByRole("button", { name: "Prepare" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
    await screen.findByLabelText("Document type for only.txt")
    const body = fetch.mock.calls.find(([url]) => url !== "/v1/workflows")![1]!.body as FormData
    expect(body.getAll("files").map((f) => (f as File).name)).toEqual(["only.txt"])
  })
})

it("shows selected files, permits removing one, and rejects more than five", async () => {
  mount()
  const input = screen.getByLabelText("Upload source documents")
  fireEvent.change(input, { target: { files: [txt("a.txt"), txt("b.txt")] } })
  expect(await screen.findByText("2 of 5 files selected")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Remove a.txt" }))
  expect(screen.queryByText("a.txt")).toBeNull()
  expect(screen.getByText("1 of 5 files selected")).toBeTruthy()
  fireEvent.change(input, { target: { files: Array.from({ length: 6 }, (_, i) => txt(`${i}.txt`)) } })
  expect(await screen.findByText("Choose no more than 5 files.")).toBeTruthy()
  expect((screen.getByRole("button", { name: "Prepare" }) as HTMLButtonElement).disabled).toBe(true)
})

it("allows keyboard removal and announces the selected count", async () => {
  const userEvent = (await import("@testing-library/user-event")).default
  const user = userEvent.setup()
  mount()
  const input = screen.getByLabelText("Upload source documents")
  await user.upload(input, [txt("a.txt"), txt("b.txt")])
  expect(screen.getByText("2 of 5 files selected").getAttribute("aria-live")).toBe("polite")
  const remove = screen.getByRole("button", { name: "Remove a.txt" })
  remove.focus()
  await user.keyboard("{Enter}")
  expect(screen.getByText("1 of 5 files selected")).toBeTruthy()
  expect(screen.queryByText("a.txt")).toBeNull()
})
