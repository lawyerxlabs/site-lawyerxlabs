// @vitest-environment jsdom
// Fail-closed intake: a workflow resolving to no input modes renders no file input and no upload.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { DocaliasPanel } from "@/components/DocaliasPanel"
import App from "@/App"
import { Landing } from "@/pages/Landing"
import { CATALOG, getRoutableWorkflow, getWorkflow, type Workflow } from "@/lib/workflows"

vi.mock("@/lib/workflows", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflows")>()
  return { ...actual, getAliasWorkflow: () => ({ ...actual.getAliasWorkflow()!, inputModes: [] }) }
})

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: false, ready: true, refreshMe: vi.fn(), login: vi.fn(), logout: vi.fn() }),
}))

afterEach(() => cleanup())

function renderPanel(workflow: Workflow) {
  return render(<MemoryRouter><DocaliasPanel workflow={workflow} /></MemoryRouter>)
}

function expectUnavailableIntake() {
  expect(screen.getByText("This workflow needs an update before documents can be submitted.")).toBeTruthy()
  expect(document.querySelector('input[type="file"]')).toBeNull()
  expect(screen.queryByRole("button", { name: "Alias Document" })).toBeNull()
}

describe("DocaliasPanel fail-closed intake", () => {
  it("renders the unavailable Alert with no file input when inputModes is empty", () => {
    const docalias = CATALOG.find((w) => w.id === "docalias")!
    renderPanel({ ...docalias, inputModes: [] })

    expectUnavailableIntake()
  })

  it("MVP App forwards empty inputModes and fails closed", () => {
    render(<MemoryRouter><App /></MemoryRouter>)

    expectUnavailableIntake()
  })

  it("Landing forwards empty inputModes and fails closed", () => {
    render(<MemoryRouter><Landing /></MemoryRouter>)

    expectUnavailableIntake()
  })

  it("renders the file input when file mode is enabled", () => {
    renderPanel(CATALOG.find((w) => w.id === "docalias")!)
    expect(document.querySelector('input[type="file"]')).not.toBeNull()
  })
})

describe("workflow lookups", () => {
  it("getWorkflow keeps disabled workflows for launching-soon display", () => {
    expect(getWorkflow("case-analysis")?.disabled).toBe(true)
  })

  it("getRoutableWorkflow never resolves disabled workflows", () => {
    expect(getRoutableWorkflow("case-analysis")).toBeUndefined()
    expect(getRoutableWorkflow("docalias")?.id).toBe("docalias")
  })

  it("getRoutableWorkflow still maps legacy docalias aliases", () => {
    expect(getRoutableWorkflow("prepare-doc")?.id).toBe("docalias")
    expect(getRoutableWorkflow("alias-doc")?.id).toBe("docalias")
  })
})
