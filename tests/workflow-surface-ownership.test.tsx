// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { AppRoutes } from "@/routes"
import { Playground } from "@/pages/Playground"
import { TierProvider } from "@/lib/useTier"
import { resetWorkflowCapabilitiesForTests } from "@/lib/useWorkflowCapabilities"
import { SURFACES } from "@/surface"

// Surface is selected at module load; these tests swap it per case through the mocked getter.
const state = vi.hoisted(() => ({ id: "signal-lawyers" }))
vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return { ...actual, get surface() { return actual.SURFACES[state.id as keyof typeof actual.SURFACES] } }
})

const session = vi.hoisted(() => ({ authenticated: true }))
const fetchMock = vi.fn()

beforeEach(() => {
  state.id = "signal-lawyers"
  session.authenticated = true
  resetWorkflowCapabilitiesForTests()
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    // Gateway advertises only backend-backed workflows. term-isolation is presentation-only and must never appear here.
    if (url.endsWith("/v1/workflows")) return Promise.resolve(new Response(JSON.stringify({ workflows: [] }), { status: 200 }))
    const body = url.endsWith("/api/auth/session")
      ? { authenticated: session.authenticated }
      : { authenticated: session.authenticated, tier: session.authenticated ? "member" : "anonymous", quota: { limit: 5, used: 0, remaining: 5, resets_at: "2026-10-23T00:00:00.000Z" }, retention: { results_ttl_seconds: 900, source_file_removed_after_processing: true, results_purged_after_all_parts_fetched: true } }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
  })
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function Location() {
  const location = useLocation()
  return <output>{location.pathname + location.search}</output>
}

function renderPlaygroundAt(url: string) {
  return render(
    <TierProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/playground/" element={<Playground />} /></Routes>
      </MemoryRouter>
    </TierProvider>,
  )
}

describe("surface workflow eligibility on direct query URLs", () => {
  it.each([
    ["human-resources", "term-isolation"],
    ["signal-lawyers", "hr-hiring"],
    ["signal-lawyers", "hr-onboarding"],
  ])("does not serve %s workflow %s", (id, workflow) => {
    state.id = id
    renderPlaygroundAt(`/playground/?workflow=${workflow}`)
    expect(document.querySelector(".playground-empty")).not.toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it("serves term-isolation on signal-lawyers as a normal workflow", async () => {
    renderPlaygroundAt("/playground/?workflow=term-isolation")
    await waitFor(() => expect(document.querySelector("h1")?.textContent).toBe("Isolate Terms"))
    expect(document.querySelector('input[type="file"]')).not.toBeNull()
  })
})

describe("legacy redirects are surface-aware", () => {
  it.each(["/playground/hr/hiring", "/mvp/hr/hiring"])("sends %s on human-resources to hr-hiring (owned by that surface)", async (path) => {
    state.id = "human-resources"
    window.history.replaceState({}, "", path)
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe("/playground/?workflow=hr-hiring"))
  })

  it.each(["/mvp/transaction-intake", "/playground/transaction-intake"])("sends %s on human-resources to its home", async (path) => {
    state.id = "human-resources"
    window.history.replaceState({}, "", path)
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe(SURFACES["human-resources"].home))
  })

  it("sends legacy hr hiring on signal-lawyers to its home, not hr-hiring", async () => {
    state.id = "signal-lawyers"
    window.history.replaceState({}, "", "/playground/hr/hiring")
    render(<BrowserRouter><AppRoutes /><Location /></BrowserRouter>)
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe(SURFACES["signal-lawyers"].home))
  })
})

describe("identity gate comes from backend identity_requirement for backend-backed entries", () => {
  it("does not gate docalias when the backend declares it public", async () => {
    session.authenticated = false
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/workflows")) return Promise.resolve(new Response(JSON.stringify({ workflows: [{ id: "docalias", identity_requirement: "public", intake_modes: ["file"], accepted_file_types: [".pdf"], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: true, report: true, artifact: false } }] }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ authenticated: false, tier: "anonymous", quota: { limit: 5, used: 0, remaining: 5, resets_at: "2026-10-23T00:00:00.000Z" }, retention: { results_ttl_seconds: 900, source_file_removed_after_processing: true, results_purged_after_all_parts_fetched: true } }), { status: 200 }))
    })
    state.id = "lawyerlab"
    renderPlaygroundAt("/playground/?workflow=docalias")
    await waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull())
    expect(screen.queryByText(/Sign in to use this workflow/)).toBeNull()
  })

  it("gates term-isolation with a static protected requirement (never advertised by the gateway)", async () => {
    session.authenticated = false
    renderPlaygroundAt("/playground/?workflow=term-isolation")
    expect(await screen.findByText(/Sign in to use this workflow/)).toBeTruthy()
  })

  it("gates docalias when the backend declares it protected", async () => {
    session.authenticated = false
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/workflows")) return Promise.resolve(new Response(JSON.stringify({ workflows: [{ id: "docalias", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [".pdf"], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: true, report: true, artifact: false } }] }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ authenticated: false }), { status: 200 }))
    })
    state.id = "lawyerlab"
    renderPlaygroundAt("/playground/?workflow=docalias")
    expect(await screen.findByText("Sign in to use this workflow")).toBeTruthy()
  })
})

describe("job result capability", () => {
  it("does not mount contract-review upload when artifact results are unavailable", async () => {
    state.id = "signal-lawyers"
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/v1/workflows")) return Promise.resolve(new Response(JSON.stringify({ workflows: [{ id: "contract-review", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [".pdf"], pii_profile: "p", handling: { capability: "none", choices: [], default: null }, results: { markdown: true, report: true, artifact: false } }] }), { status: 200 }))
      return Promise.resolve(new Response(JSON.stringify({ authenticated: true }), { status: 200 }))
    })
    renderPlaygroundAt("/playground/?workflow=contract-review")
    expect(await screen.findByRole("heading", { name: "Workflow unavailable" })).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})
