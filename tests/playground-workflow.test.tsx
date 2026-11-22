// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Link, MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"
import { resetWorkflowCapabilitiesForTests } from "@/lib/useWorkflowCapabilities"

const api = vi.hoisted(() => ({ upload: vi.fn(), getMe: vi.fn(), signedIn: { value: true } }))

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: api.signedIn.value, ready: true, login: vi.fn(), logout: vi.fn() }),
}))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, upload: api.upload, getMe: api.getMe }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Workflow switches in the app are query-only navigations to /playground/?workflow=…
// These links stand in for the sidebar so the test drives the same router path.
function renderPlayground() {
  return render(
    <MemoryRouter initialEntries={["/playground/?workflow=alias-doc"]}>
      <nav>
        <Link to="/playground/?workflow=alias-doc">to prepare</Link>
        <Link to="/playground/?workflow=case-analysis">to disabled</Link>
      </nav>
      <Routes>
        <Route path="/playground/" element={<Playground />} />
      </Routes>
    </MemoryRouter>,
  )
}

function pickFile(name: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error("file input missing")
  const file = new File(["%PDF-1.4 synthetic"], name, { type: "application/pdf" })
  fireEvent.change(input, { target: { files: [file] } })
}

describe("playground workflow switching", () => {
  it("lists term isolation on LawyerLab", () => {
    api.getMe.mockResolvedValue({ tier: "member" })
    render(
      <MemoryRouter initialEntries={["/playground/?workflow=term-isolation"]}>
        <Routes><Route path="/playground/" element={<Playground />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole("button", { name: "Isolate Terms" })).toBeTruthy()
  })

  it("rejects unknown workflows without mounting upload", async () => {
    api.getMe.mockResolvedValue({ tier: "member" })
    render(
      <MemoryRouter initialEntries={["/playground/?workflow=not-real"]}>
        <Routes><Route path="/playground/" element={<Playground />} /></Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByText("Workflow unavailable").textContent).toBe("Workflow unavailable")
    expect(screen.getByText("This workflow does not exist.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Submit test upload" })).toBeNull()
    expect(api.upload).not.toHaveBeenCalled()
  })

  it("does not upload when visiting a disabled workflow and returning", () => {
    api.getMe.mockResolvedValue({ tier: "member" })
    renderPlayground()

    fireEvent.click(screen.getByRole("link", { name: "to disabled" }))
    expect(screen.queryByRole("status")).toBeNull()
    expect(screen.getByText("Launching soon")).toBeTruthy()

    fireEvent.click(screen.getByRole("link", { name: "to prepare" }))
    expect(screen.getByRole("heading", { level: 1, name: "Alias" })).toBeTruthy()
    expect(api.upload).not.toHaveBeenCalled()
  })

  it("places the description between the title and intake, with the notice in the handling panel", () => {
    api.getMe.mockResolvedValue({ tier: "member" })
    renderPlayground()
    const heading = screen.getByRole("heading", { level: 1, name: "Alias" })
    const disclaimer = document.querySelector(".surface-disclaimer")!
    const description = screen.getByText("Replace personal information in one PDF or DOCX with placeholders, and get a report of what was found.")
    const intake = screen.getByRole("region", { name: "Upload a document" })
    const aside = screen.getByRole("complementary", { name: "How this tool works" })
    expect(heading.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(description.compareDocumentPosition(intake) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(aside.contains(disclaimer)).toBe(true)
    expect(screen.queryByRole("status")).toBeNull()
  })
})
