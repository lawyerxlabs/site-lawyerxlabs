// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"

const session = vi.hoisted(() => {
  vi.stubEnv("VITE_SURFACE", "human-resources")
  return { signedIn: true }
})
vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: session.signedIn, identity: null, ready: true, login: vi.fn(), logout: vi.fn() }) }))
vi.mock("@/lib/useWorkflowCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useWorkflowCapabilities")>()
  const { TEST_WORKFLOW_CAPABILITIES } = await import("./fixtures/workflow-capabilities")
  return { ...actual, useWorkflowCatalog: () => TEST_WORKFLOW_CAPABILITIES, refreshWorkflowCapabilities: async () => TEST_WORKFLOW_CAPABILITIES, useResolvedWorkflow: (workflow: unknown) => workflow }
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); session.signedIn = true })

const prepared = {
  session_id: "session-cleanup-123456", status: "source_ready", source: { kind: "pdf", sha256: "b".repeat(64), page_count: 1 }, workflow_settings: { handling: "redact" },
  preview: { status: "safe", text: "Redacted preview" }, criteria: [], gaps: [], limitations: [], outcomes: [], limits: {},
}

function mount() {
  return render(<MemoryRouter initialEntries={["/playground/?workflow=hr-hiring"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
}

describe("HR Hiring session cleanup", () => {
  it("sends the PDF as multipart and shows the prepared session", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(prepared), { status: 201 }))
    mount()
    fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [new File(["%PDF-1.4 synthetic"], "role.pdf", { type: "application/pdf" })] } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Prepare source" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
    await screen.findByText("Redacted preview")
    const upload = fetch.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.body instanceof FormData)
    expect(upload).toBeTruthy()
    const init = upload![1] as RequestInit
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get("file")).toBeInstanceOf(File)
    expect(fetch.mock.calls.filter(([url]) => url !== "/v1/workflows")).toHaveLength(1)
  })

  it("unmounting a prepared session sends exactly one DELETE", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
      .mockImplementation(async () => new Response(null, { status: 204 }))
    const { unmount } = mount()
    fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [new File(["%PDF-1.4 synthetic"], "role.pdf", { type: "application/pdf" })] } })
    await waitFor(() => expect(screen.getByRole("button", { name: "Prepare source" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
    await screen.findByText("Redacted preview")
    unmount()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/hr/v1/sessions/${prepared.session_id}`, { method: "DELETE" }))
    expect(fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toHaveLength(1)
  })
})
