// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"
import { resetWorkflowCapabilitiesForTests } from "@/lib/useWorkflowCapabilities"

// signal-lawyers routes contract-review (job panel); the default LawyerLab surface does not.
const state = vi.hoisted(() => ({ surface: "signal-lawyers" }))
vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return { ...actual, surface: actual.SURFACES[state.surface as keyof typeof actual.SURFACES] }
})

// Only the auth state and the /v1/workflows catalog are driven here; Playground logic is real.
const tier = vi.hoisted(() => ({ ready: true, signedIn: false }))
vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, identity: null, login: vi.fn(), logout: vi.fn(), ...tier }) }))

const capability = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  identity_requirement: "protected",
  intake_modes: ["file"],
  accepted_file_types: [".pdf"],
  pii_profile: "p",
  handling: { capability: "none", choices: [], default: null },
  results: { markdown: true, report: true, artifact: true },
  ...overrides,
})

let workflows: unknown[] = []
beforeEach(() => {
  resetWorkflowCapabilitiesForTests()
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.endsWith("/v1/workflows") ? { workflows } : { authenticated: false }
    return new Response(JSON.stringify(body), { status: 200 })
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  tier.ready = true
  tier.signedIn = false
  state.surface = "signal-lawyers"
})

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/playground/" element={<Playground />} /></Routes>
    </MemoryRouter>,
  )
}

// Let the catalog fetch settle so the resolved (non-pending catalog) state is what the test observes.
async function settle() {
  await new Promise((r) => setTimeout(r, 0))
}

describe("playground permanent state role semantics", () => {
  it("unlisted workflow shows unavailable without role=status", async () => {
    tier.ready = true
    tier.signedIn = true
    state.surface = "signal-lawyers"
    workflows = []
    renderAt("/playground/?workflow=contract-review")
    await settle()
    expect(await screen.findByRole("heading", { name: "Workflow unavailable" })).toBeTruthy()
    expect(document.querySelector('[role="status"]')).toBeNull()
  })

  it("listed workflow without the required result shows unavailable without role=status", async () => {
    tier.ready = true
    tier.signedIn = true
    workflows = [capability("contract-review", { results: { markdown: false, report: false, artifact: false } })]
    renderAt("/playground/?workflow=contract-review")
    await settle()
    expect(await screen.findByRole("heading", { name: "Workflow unavailable" })).toBeTruthy()
    expect(document.querySelector('[role="status"]')).toBeNull()
  })

  it("signed-out protected gate shows sign-in without role=status", async () => {
    tier.ready = true
    tier.signedIn = false
    workflows = [capability("contract-review")]
    renderAt("/playground/?workflow=contract-review")
    await settle()
    expect(await screen.findByRole("heading", { name: "Sign in to use this workflow" })).toBeTruthy()
    expect(document.querySelector('[role="status"]')).toBeNull()
  })

  it("protected workflow while auth is pending shows role=status", async () => {
    tier.ready = false
    tier.signedIn = false
    workflows = [capability("contract-review")]
    renderAt("/playground/?workflow=contract-review")
    const status = await screen.findByRole("status")
    expect(status.textContent).toContain("Checking your session")
  })
})
