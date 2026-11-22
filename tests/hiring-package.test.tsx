// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ReactNode } from "react"
import { HiringPackage, HiringPackagePanel } from "@/pages/HiringPackage"
import { getWorkflow } from "@/lib/workflows"
import { AppRoutes } from "@/routes"
import { resetWorkflowCapabilitiesForTests } from "@/lib/useWorkflowCapabilities"

const auth = vi.hoisted(() => ({ ready: true, signedIn: true, identity: { sub: "user-a", name: "Synthetic Member", email: "member-a@example.test" } as { sub: string | null; name: string | null; email: string | null } | null, login: vi.fn() }))
vi.mock("@/lib/useTier", () => ({ TierProvider: ({ children }: { children: ReactNode }) => children, useTier: () => ({ ready: auth.ready, signedIn: auth.signedIn, identity: auth.identity, login: auth.login }) }))
const resume = (sub: string, text = "Synthetic final") => JSON.stringify({ sub, id: "package-1", versionId: "v1", text })

const workflow = getWorkflow("hiring-package")!
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
function mock(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`
    const route = Object.entries(routes).find(([path]) => key === path)
    if (!route) throw new Error(`unexpected ${key}`)
    return route[1]()
  })
}
function packageRoutes(id = "package-1") {
  return {
    "POST /v1/hiring/sessions": () => json({ id, kind: "package", expires_at: "2099-01-01T00:00:00Z" }, 201),
    [`POST /v1/hiring/sessions/${id}/generate`]: () => json({ id, status: "draft", text: "Synthetic draft", changed: false }),
  }
}
async function draft() {
  fireEvent.change(screen.getByLabelText(/paste source text/i), { target: { value: "Synthetic source text" } })
  fireEvent.click(screen.getByRole("button", { name: workflow.action }))
  await screen.findByRole("button", { name: "Approve description" })
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); resetWorkflowCapabilitiesForTests(); auth.ready = true; auth.signedIn = true; auth.identity = { sub: "user-a", name: "Synthetic Member", email: "member-a@example.test" }; auth.login.mockReset() })

describe("hiring package", () => {
  it("keeps hiring-package content hidden at its routed URL while auth is pending", async () => {
    auth.ready = false
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ workflows: [{
      id: "hiring-package", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "p",
      handling: { capability: "none", choices: [], default: null }, results: { markdown: false, report: false, artifact: false },
    }] }))
    render(<MemoryRouter initialEntries={["/playground/?workflow=hiring-package"]}><AppRoutes /></MemoryRouter>)
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith("/v1/workflows"))
    expect(screen.getByRole("status")).toHaveTextContent("Checking your session…")
    expect(screen.queryByLabelText(/paste source text/i)).toBeNull()
    expect(screen.queryByText(/sign in to prepare/i)).toBeNull()
  })

  it("gates guests behind sign in", () => {
    auth.signedIn = false
    render(<HiringPackagePanel workflow={workflow} />)
    expect(screen.getByRole("heading", { name: /sign in to prepare/i })).toBeTruthy()
    expect(screen.queryByLabelText(/paste source text/i)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
    expect(auth.login).toHaveBeenCalledOnce()
  })

  it("creates then generates an accessible draft review", async () => {
    mock(packageRoutes())
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    expect(screen.getByRole("heading", { name: "Review job description draft" })).toBeTruthy()
    expect(screen.getByLabelText("Draft description")).toHaveValue("Synthetic draft")
  })

  it("states the honest live review copy and clears the source on discard", async () => {
    const deleted = vi.fn(() => json({}))
    mock({
      ...packageRoutes(),
      "POST /v1/hiring/sessions/package-1/approve": () => json({ error: { code: "server_error" } }, 500),
      "DELETE /v1/hiring/sessions/package-1": deleted,
    })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    expect(screen.getByRole("note").textContent).toBe("Review the generated draft. This read-only text is submitted for server-side safety re-screening; approved text may differ. To change it, discard and start again.")
    expect(screen.getByLabelText("Draft description")).toHaveAttribute("readonly")
    fireEvent.click(screen.getByRole("button", { name: "Approve description" }))
    await screen.findByText("We could not prepare this job description. Try again.")
    fireEvent.click(screen.getByRole("button", { name: "Discard and start again" }))
    const input = await screen.findByLabelText(/paste source text/i)
    expect(input).toHaveValue("")
    expect(screen.queryByText("We could not prepare this job description. Try again.")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(deleted).toHaveBeenCalledOnce()
  })

  it("clears the selected PDF source on discard", async () => {
    mock({ ...packageRoutes(), "DELETE /v1/hiring/sessions/package-1": () => json({}) })
    render(<HiringPackagePanel workflow={workflow} />)
    fireEvent.click(screen.getByRole("radio", { name: /file/i }))
    fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [new File(["%PDF-synthetic"], "source.pdf", { type: "application/pdf" })] } })
    await screen.findByText("source.pdf")
    fireEvent.click(screen.getByRole("button", { name: workflow.action }))
    await screen.findByRole("button", { name: "Approve description" })
    fireEvent.click(screen.getByRole("button", { name: "Discard and start again" }))
    await screen.findByLabelText("Upload PDF")
    expect(screen.queryByText("source.pdf")).toBeNull()
    expect(screen.getByRole("button", { name: workflow.action })).toBeDisabled()
  })

  it("shows approved text and version", async () => {
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": () => json({ id: "version-1", version_id: "v1", text: "Synthetic final", changed: false }) })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    fireEvent.click(screen.getByRole("button", { name: "Approve description" }))
    expect(await screen.findByRole("heading", { name: "Approved job description" })).toBeTruthy()
    expect(screen.getByText("Synthetic final")).toBeTruthy()
    expect(screen.getByText(/Version v1/)).toBeTruthy()
  })

  it("restores an approved package owned by the current identity without fetching", async () => {
    sessionStorage.setItem("hiring-package-approved", resume("user-a"))
    const fetch = vi.spyOn(globalThis, "fetch")
    render(<HiringPackagePanel workflow={workflow} />)
    expect(await screen.findByRole("heading", { name: "Approved job description" })).toBeTruthy()
    expect(screen.getByText("Synthetic final")).toBeTruthy()
    expect(screen.getByText(/Version v1/)).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("does not restore or expose a resume owned by another identity", async () => {
    sessionStorage.setItem("hiring-package-approved", resume("user-b"))
    render(<HiringPackagePanel workflow={workflow} />)
    await waitFor(() => expect(sessionStorage.getItem("hiring-package-approved")).toBeNull())
    expect(screen.queryByRole("heading", { name: "Approved job description" })).toBeNull()
    expect(screen.getByLabelText(/paste source text/i)).toBeTruthy()
  })

  it("clears and does not restore an approved resume while signed out", async () => {
    sessionStorage.setItem("hiring-package-approved", resume("user-a"))
    auth.signedIn = false
    auth.identity = null
    render(<HiringPackagePanel workflow={workflow} />)
    expect(screen.getByRole("heading", { name: /sign in to prepare/i })).toBeTruthy()
    await waitFor(() => expect(sessionStorage.getItem("hiring-package-approved")).toBeNull())
  })

  it("drops an approved view and its stored resume when the account switches in the same tab", async () => {
    sessionStorage.setItem("hiring-package-approved", resume("user-a"))
    const { rerender } = render(<HiringPackagePanel workflow={workflow} />)
    expect(await screen.findByRole("heading", { name: "Approved job description" })).toBeTruthy()
    auth.identity = { sub: "user-b", name: "Synthetic Other", email: "member-b@example.test" }
    rerender(<HiringPackagePanel workflow={workflow} />)
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Approved job description" })).toBeNull())
    expect(sessionStorage.getItem("hiring-package-approved")).toBeNull()
  })

  it("never shows the previous account's approved text during an identity transition", async () => {
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": () => json({ id: "package-1", version_id: "v1", text: "Synthetic final", changed: false }) })
    const { rerender, container } = render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    fireEvent.click(screen.getByRole("button", { name: "Approve description" }))
    await screen.findByRole("heading", { name: "Approved job description" })
    auth.identity = { sub: "user-b", name: "Synthetic Other", email: "member-b@example.test" }
    rerender(<HiringPackagePanel workflow={workflow} />)
    expect(container.textContent).not.toContain("Synthetic final")
    await waitFor(() => expect(sessionStorage.getItem("hiring-package-approved")).toBeNull())
    expect(screen.queryByRole("heading", { name: "Approved job description" })).toBeNull()
  })

  it("gates the workflow and clears approved text when account switches to identity without a subject", async () => {
    sessionStorage.setItem("hiring-package-approved", resume("user-a"))
    const { rerender, container } = render(<HiringPackagePanel workflow={workflow} />)
    expect(await screen.findByRole("heading", { name: "Approved job description" })).toBeTruthy()
    auth.identity = { sub: null, name: "Synthetic Member", email: "member-a@example.test" }
    rerender(<HiringPackagePanel workflow={workflow} />)
    expect(container.textContent).not.toContain("Synthetic final")
    expect(screen.getByRole("heading", { name: "Unable to verify your account" })).toBeTruthy()
    await waitFor(() => expect(sessionStorage.getItem("hiring-package-approved")).toBeNull())
  })

  it.each([
    "not-json",
    JSON.stringify({ sub: "user-a", id: "package-1", versionId: "v1", text: 12 }),
    JSON.stringify({ sub: "user-a", id: "package-1", versionId: "v1", text: "Synthetic final", source: "sensitive" }),
    JSON.stringify({ id: "package-1", versionId: "v1", text: "Synthetic final" }),
    JSON.stringify({ owner: "x", id: "package-1", versionId: "v1", text: "Synthetic final" }),
  ])("removes malformed approved resume %s without showing it", async (stored) => {
    sessionStorage.setItem("hiring-package-approved", stored)
    render(<HiringPackagePanel workflow={workflow} />)
    expect(screen.queryByRole("heading", { name: "Approved job description" })).toBeNull()
    expect(screen.getByLabelText(/paste source text/i)).toBeTruthy()
    await waitFor(() => expect(sessionStorage.getItem("hiring-package-approved")).toBeNull())
  })

  it("clears the approved resume when starting new", async () => {
    sessionStorage.setItem("hiring-package-approved", resume("user-a"))
    render(<HiringPackagePanel workflow={workflow} />)
    fireEvent.click(await screen.findByRole("button", { name: "Start new" }))
    expect(sessionStorage.getItem("hiring-package-approved")).toBeNull()
    expect(screen.getByLabelText(/paste source text/i)).toBeTruthy()
  })

  it("stores only the subject and screened approved fields", async () => {
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": () => json({ id: "package-1", version_id: "v1", text: "Synthetic final", changed: false, source: "sensitive" }) })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    fireEvent.click(screen.getByRole("button", { name: "Approve description" }))
    await screen.findByRole("heading", { name: "Approved job description" })
    const raw = sessionStorage.getItem("hiring-package-approved")!
    expect(JSON.parse(raw)).toEqual({ sub: "user-a", id: "package-1", versionId: "v1", text: "Synthetic final" })
    expect(raw).not.toContain("member-a@example.test")
    expect(raw).not.toContain("Synthetic Member")
  })

  it("recovers original text when generation expires", async () => {
    mock({ "POST /v1/hiring/sessions": packageRoutes()["POST /v1/hiring/sessions"], "POST /v1/hiring/sessions/package-1/generate": () => json({ error: { code: "result_unavailable" } }, 410) })
    render(<HiringPackagePanel workflow={workflow} />)
    fireEvent.change(screen.getByLabelText(/paste source text/i), { target: { value: "Synthetic source text" } })
    fireEvent.click(screen.getByRole("button", { name: workflow.action }))
    fireEvent.click(await screen.findByRole("button", { name: /re-submit original source/i }))
    expect(screen.getByLabelText(/paste source text/i)).toHaveValue("Synthetic source text")
  })

  it("preserves a PDF source after generation expires and reposts it as multipart", async () => {
    let sessionPosts = 0
    const bodies: BodyInit[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const key = `${init?.method ?? "GET"} ${String(input)}`
      if (key === "POST /v1/hiring/sessions") {
        sessionPosts++
        bodies.push(init!.body!)
        return json({ id: `package-${sessionPosts}`, kind: "package", expires_at: "2099-01-01T00:00:00Z" }, 201)
      }
      if (key === "POST /v1/hiring/sessions/package-1/generate") return json({ error: { code: "result_unavailable" } }, 410)
      if (key === "POST /v1/hiring/sessions/package-2/generate") return json({ id: "package-2", status: "draft", text: "Synthetic draft", changed: false })
      throw new Error(`unexpected ${key}`)
    })
    render(<HiringPackagePanel workflow={workflow} />)
    const file = new File(["%PDF-synthetic"], "source.pdf", { type: "application/pdf" })
    fireEvent.click(screen.getByRole("radio", { name: /file/i }))
    fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [file] } })
    await screen.findByText("source.pdf")
    fireEvent.click(screen.getByRole("button", { name: workflow.action }))
    fireEvent.click(await screen.findByRole("button", { name: /re-submit original source/i }))
    expect(screen.getByText("source.pdf")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: workflow.action }))
    await screen.findByRole("button", { name: "Approve description" })
    expect(sessionPosts).toBe(2)
    expect(bodies.every((body) => body instanceof FormData && body.get("file") === file)).toBe(true)
  })

  it("preserves a PDF source after approval expires and reposts it as multipart", async () => {
    let sessionPosts = 0
    const bodies: BodyInit[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const key = `${init?.method ?? "GET"} ${String(input)}`
      if (key === "POST /v1/hiring/sessions") {
        sessionPosts++
        bodies.push(init!.body!)
        return json({ id: `package-${sessionPosts}`, kind: "package", expires_at: "2099-01-01T00:00:00Z" }, 201)
      }
      if (key === "POST /v1/hiring/sessions/package-1/generate" || key === "POST /v1/hiring/sessions/package-2/generate") return json({ id: "package", status: "draft", text: "Synthetic draft", changed: false })
      if (key === "POST /v1/hiring/sessions/package-1/approve") return json({ error: { code: "result_unavailable" } }, 410)
      throw new Error(`unexpected ${key}`)
    })
    render(<HiringPackagePanel workflow={workflow} />)
    const file = new File(["%PDF-synthetic"], "source.pdf", { type: "application/pdf" })
    fireEvent.click(screen.getByRole("radio", { name: /file/i }))
    fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [file] } })
    await screen.findByText("source.pdf")
    fireEvent.click(screen.getByRole("button", { name: workflow.action }))
    fireEvent.click(await screen.findByRole("button", { name: "Approve description" }))
    fireEvent.click(await screen.findByRole("button", { name: /re-submit original source/i }))
    fireEvent.click(screen.getByRole("button", { name: workflow.action }))
    await screen.findByRole("button", { name: "Approve description" })
    expect(sessionPosts).toBe(2)
    expect(bodies.every((body) => body instanceof FormData && body.get("file") === file)).toBe(true)
  })

  it("requires confirmation before approving a changed draft without prior text", async () => {
    const approve = vi.fn(() => json({ id: "version-1", version_id: "v1", text: "Synthetic final", changed: false }))
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/generate": () => json({ id: "package-1", status: "draft", text: "Screened draft", changed: true }), "POST /v1/hiring/sessions/package-1/approve": approve })
    render(<HiringPackagePanel workflow={workflow} />)
    fireEvent.change(screen.getByLabelText(/paste source text/i), { target: { value: "Synthetic source text" } })
    fireEvent.click(screen.getByRole("button", { name: workflow.action }))
    await screen.findByRole("button", { name: "Confirm screened draft" })
    expect(screen.getByRole("alert")).toHaveTextContent(/safety screening changed this draft/i)
    expect(screen.queryByRole("button", { name: "Approve confirmed description" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Confirm screened draft" }))
    fireEvent.click(screen.getByRole("button", { name: "Approve confirmed description" }))
    await screen.findByRole("heading", { name: "Approved job description" })
    expect(approve).toHaveBeenCalledOnce()
  })

  it("disables approval controls while approval is pending", async () => {
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    const approve = vi.fn(() => pending)
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": approve })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    const button = screen.getByRole("button", { name: "Approve description" })
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    expect(screen.getByRole("button", { name: "Discard and start again" })).toBeDisabled()
    fireEvent.click(button)
    expect(approve).toHaveBeenCalledOnce()
    resolve(json({ id: "version-1", version_id: "v1", text: "Synthetic final", changed: false }))
    await screen.findByRole("heading", { name: "Approved job description" })
  })

  it("posts approval once for immediate double clicks", async () => {
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    const approve = vi.fn(() => pending)
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": approve })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    const button = screen.getByRole("button", { name: "Approve description" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(approve).toHaveBeenCalledOnce()
    resolve(json({ id: "version-1", version_id: "v1", text: "Synthetic final", changed: false }))
    await screen.findByRole("heading", { name: "Approved job description" })
  })

  it("does not late-transition after a deferred approval is discarded", async () => {
    let resolve!: (response: Response) => void
    const pending = new Promise<Response>((done) => { resolve = done })
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": () => pending, "DELETE /v1/hiring/sessions/package-1": () => json({}) })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    const approve = screen.getByRole("button", { name: "Approve description" })
    const discard = screen.getByRole("button", { name: "Discard and start again" })
    act(() => { approve.click(); discard.click() })
    expect(screen.getByLabelText(/paste source text/i)).toBeTruthy()
    resolve(json({ id: "version-1", version_id: "v1", text: "Synthetic final", changed: false }))
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Approved job description" })).toBeNull())
  })

  it("allows a new approval after discarding a deferred approval", async () => {
    let resolveStale!: (response: Response) => void
    const stale = new Promise<Response>((done) => { resolveStale = done })
    let sessions = 0
    const approve = vi.fn(() => approve.mock.calls.length === 1
      ? stale
      : json({ id: "version-2", version_id: "v2", text: "Current final", changed: false }))
    mock({
      "POST /v1/hiring/sessions": () => json({ id: `package-${++sessions}`, kind: "package", expires_at: "2099-01-01T00:00:00Z" }, 201),
      "POST /v1/hiring/sessions/package-1/generate": () => json({ id: "package-1", status: "draft", text: "First draft", changed: false }),
      "POST /v1/hiring/sessions/package-2/generate": () => json({ id: "package-2", status: "draft", text: "Second draft", changed: false }),
      "POST /v1/hiring/sessions/package-1/approve": approve,
      "POST /v1/hiring/sessions/package-2/approve": approve,
      "DELETE /v1/hiring/sessions/package-1": () => json({}),
    })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    act(() => {
      screen.getByRole("button", { name: "Approve description" }).click()
      screen.getByRole("button", { name: "Discard and start again" }).click()
    })
    await draft()
    fireEvent.click(screen.getByRole("button", { name: "Approve description" }))
    expect(await screen.findByRole("heading", { name: "Approved job description" })).toBeTruthy()
    expect(approve).toHaveBeenCalledTimes(2)
    expect(screen.getByText("Current final")).toBeTruthy()

    resolveStale(json({ id: "version-1", version_id: "v1", text: "Stale final", changed: false }))
    await waitFor(() => expect(screen.getByText("Current final")).toBeTruthy())
    expect(screen.queryByText("Stale final")).toBeNull()
  })

  it("adds beforeunload for a live package and removes it after approval", async () => {
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": () => json({ id: "version-1", version_id: "v1", text: "Synthetic final", changed: false }) })
    const add = vi.spyOn(window, "addEventListener")
    const remove = vi.spyOn(window, "removeEventListener")
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    expect(add).toHaveBeenCalledWith("beforeunload", expect.any(Function))
    fireEvent.click(screen.getByRole("button", { name: "Approve description" }))
    await screen.findByRole("heading", { name: "Approved job description" })
    await waitFor(() => expect(remove).toHaveBeenCalledWith("beforeunload", expect.any(Function)))
  })

  it("deletes a live package on unmount", async () => {
    const fetch = mock({ ...packageRoutes(), "DELETE /v1/hiring/sessions/package-1": () => new Response(null, { status: 204 }) })
    const view = render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    view.unmount()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/v1/hiring/sessions/package-1", { method: "DELETE" }))
  })

  it("shows accurate live review copy with a read-only draft", async () => {
    mock(packageRoutes())
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    const notes = screen.getAllByRole("note").map((node) => node.textContent ?? "")
    expect(notes.join(" ")).not.toMatch(/prototype|not connected|synthetic data only/i)
    expect(screen.getByRole("textbox", { name: "Draft description" })).toHaveProperty("readOnly", true)
    expect(screen.queryByRole("button", { name: "Screen edited draft" })).toBeNull()
  })

  it("approves the generated draft and shows approved text without offer-draft UI", async () => {
    const approve = vi.fn(() => json({ id: "package-1", version_id: "v1", text: "Synthetic draft", changed: false }))
    mock({ ...packageRoutes(), "POST /v1/hiring/sessions/package-1/approve": approve })
    render(<HiringPackagePanel workflow={workflow} />)
    await draft()
    fireEvent.click(screen.getByRole("button", { name: "Approve description" }))
    await screen.findByRole("heading", { name: "Approved job description" })
    expect(approve).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith("/v1/hiring/sessions/package-1/approve", expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "Synthetic draft" }) }))
    expect(screen.queryByText(/offer draft/i)).toBeNull()
    expect(screen.queryByRole("textbox", { name: /candidate|start date|terms|wording/i })).toBeNull()
  })
})
