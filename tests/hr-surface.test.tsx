// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { Shell } from "@/components/Shell"
import { CATALOG, WORKFLOWS, getWorkflow } from "@/lib/workflows"
import { SURFACES } from "@/surface"

vi.hoisted(() => { vi.stubEnv("VITE_SURFACE", "human-resources") })
vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: true, identity: null, ready: true, login: vi.fn(), logout: vi.fn() }),
}))

afterEach(cleanup)

describe("human-resources surface", () => {
  it("serves docalias first and hr-hiring from the catalog, defaulting to docalias", () => {
    expect(SURFACES["human-resources"].workflows).toEqual(["docalias", "hr-hiring", "hiring-package", "hr-onboarding"])
    expect(SURFACES["human-resources"].home).toBe("/playground/?workflow=docalias")
    expect(WORKFLOWS.map((w) => w.id)).toEqual(["docalias", "hr-hiring", "hiring-package", "hr-onboarding"])
    expect(getWorkflow("hr-hiring")?.label).toBe("Structured Job Description Review")
    expect(getWorkflow("docalias")?.label).toBe("Alias")
    expect(CATALOG.map((w) => w.id)).toContain("hr-hiring")
  })

  it("renders the Alias document action pointing at docalias on the HR surface", () => {
    render(<MemoryRouter initialEntries={["/playground/?workflow=hr-hiring"]}><Shell workflowId="hr-hiring"><p>body</p></Shell></MemoryRouter>)
    expect(screen.getByRole("link", { name: "Alias document" }).getAttribute("href")).toBe("/playground/?workflow=docalias")
    expect(screen.getByRole("link", { name: "Review job description" }).getAttribute("href")).toBe("/playground/?workflow=hr-hiring")
  })
})
