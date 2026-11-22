// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"
import { TierProvider, useTier } from "@/lib/useTier"
import { resetWorkflowCapabilitiesForTests } from "@/lib/useWorkflowCapabilities"

// Real TierProvider; only the network boundary is stubbed. Logout flips the session the same way the server does.
const session = vi.hoisted(() => ({ authenticated: true }))
const spies = vi.hoisted(() => ({ getJob: vi.fn(), upload: vi.fn() }))
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, getJob: spies.getJob, upload: spies.upload }
})

const fetchMock = vi.fn()
const workflows = ["docalias", "contract-review", "agreement-review"].map((id) => ({
  id,
  identity_requirement: id === "docalias" ? "public" : "protected",
  intake_modes: ["file", "sample"],
  accepted_file_types: [".pdf"],
  pii_profile: "p",
  handling: { capability: "none", choices: [], default: null },
  results: { markdown: true, report: true, artifact: id === "contract-review" },
}))
beforeEach(() => {
  resetWorkflowCapabilitiesForTests()
  session.authenticated = true
  spies.getJob.mockReset()
  spies.upload.mockReset()
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    if (url.endsWith("/api/auth/logout")) session.authenticated = false
    const body = url.endsWith("/v1/workflows") ? { workflows } : url.endsWith("/api/auth/session") ? { authenticated: session.authenticated } : { authenticated: false, tier: "anonymous", quota: { limit: 5, used: 0, remaining: 5, resets_at: "2026-10-23T00:00:00.000Z" }, retention: { results_ttl_seconds: 900, source_file_removed_after_processing: true, results_purged_after_all_parts_fetched: true } }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderAt(url: string) {
  return render(
    <TierProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/playground/" element={<Playground />} /></Routes>
      </MemoryRouter>
    </TierProvider>,
  )
}

describe("playground signed-out gate (real provider)", () => {
  it("focuses signed-out heading after auth-pending gate resolves", async () => {
    session.authenticated = false
    renderAt("/playground/?workflow=contract-review")
    expect(screen.getByText("Checking your session…")).toBeTruthy()
    const heading = await screen.findByRole("heading", { name: "Sign in to use this workflow" })
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(heading)
  })

  it("does not steal focus when the first Playground render is already signed out", async () => {
    session.authenticated = false
    // Mount Playground only once auth has settled, so its first commit is the signed-out gate.
    function AfterAuth() {
      return useTier().ready ? <Playground /> : null
    }
    render(
      <TierProvider>
        <MemoryRouter initialEntries={["/playground/?workflow=contract-review"]}>
          <Routes><Route path="/playground/" element={<AfterAuth />} /></Routes>
        </MemoryRouter>
      </TierProvider>,
    )
    const heading = await screen.findByRole("heading", { name: "Sign in to use this workflow" })
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).not.toBe(heading)
  })

  it("keeps guest Alias usable without sign-in", async () => {
    session.authenticated = false
    renderAt("/playground/?workflow=alias-doc")
    expect(await screen.findByRole("tab", { name: "Try a sample" })).toBeTruthy()
    expect(screen.queryByText("Sign in to use this workflow")).toBeNull()
  })

  it("does not claim every workflow needs sign-in", async () => {
    session.authenticated = false
    renderAt("/playground/?workflow=alias-doc")
    const nav = await screen.findByRole("navigation", { name: "Workflow navigation" })
    expect(within(nav).getByText("Some workspace workflows require sign in.")).toBeTruthy()
    expect(document.body.textContent).not.toContain("All workflows require sign-in")
  })

})
