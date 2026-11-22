// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { WorkflowPage } from "@/components/WorkflowPage"
import { useHandlingContext } from "@/lib/handlingContext"
import { CATALOG } from "@/lib/workflows"

const session = vi.hoisted(() => ({ signedIn: false, identity: { name: "Member", email: "one@example.test" } as { name: string; email: string } | null }))
const capabilities = vi.hoisted(() => ({ catalog: undefined as unknown }))
const refresh = vi.hoisted(() => vi.fn(async () => capabilities.catalog as never))
vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: session.signedIn, identity: session.identity, ready: true, login: vi.fn(), logout: vi.fn() }),
}))
vi.mock("@/lib/useWorkflowCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useWorkflowCapabilities")>()
  return { ...actual, useWorkflowCatalog: () => capabilities.catalog, refreshWorkflowCapabilities: refresh }
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); delete document.body.dataset.sourceSubmitted; delete document.body.dataset.validationFinished; capabilities.catalog = undefined; session.signedIn = false; session.identity = { name: "Member", email: "one@example.test" }; refresh.mockReset().mockImplementation(async () => capabilities.catalog as never) })

function gateOf(id: string) {
  const workflow = CATALOG.find((w) => w.id === id)!
  render(<WorkflowPage workflow={workflow} uploadLabel="Test"><button>Inside</button></WorkflowPage>)
  return screen.getByRole("button", { name: "Inside" }).closest("fieldset")!
}

function FreezeRun() {
  const { freezeRun } = useHandlingContext()
  return <button onClick={() => freezeRun("redact")}>Prepared source</button>
}

function ValidateIntake() {
  const { validateIntake } = useHandlingContext()
  return <button onClick={async () => { document.body.dataset.intakeValid = String((await validateIntake()).valid) }}>Validate intake</button>
}

function PendingSubmit({ finish }: { finish: Promise<void> }) {
  const { validateIntake, beginSubmission, freezeRun } = useHandlingContext()
  return <button onClick={async () => { const check = await validateIntake(); if (!check.valid) return; beginSubmission(check.submitted); await finish; freezeRun(check.submitted) }}>Submit pending</button>
}

function ValidateThenSubmit({ submit }: { submit: () => void }) {
  const { validateIntake } = useHandlingContext()
  return <button onClick={async () => { const check = await validateIntake(); document.body.dataset.validationFinished = "true"; if (check.valid) submit() }}>Validate then submit</button>
}

function FreezeSelectedRun() {
  const { selected, freezeRun } = useHandlingContext()
  return <button onClick={() => freezeRun(selected ?? undefined)}>Prepared source</button>
}

describe("WorkflowPage signed-out fieldset gate", () => {
  it("disables hr-hiring controls when signed out, like other protected workflows", () => {
    session.signedIn = false
    expect(gateOf("hr-hiring").disabled).toBe(true)
  })

  it("keeps controls disabled until the backend confirms a public requirement", () => {
    session.signedIn = false
    expect(gateOf("docalias").disabled).toBe(true)
  })

  it("keeps protected workflows disabled when signed out", () => {
    session.signedIn = false
    expect(gateOf("case-analysis").disabled).toBe(true)
  })

  it("never disables a signed-in workflow", () => {
    session.signedIn = true
    expect(gateOf("case-analysis").disabled).toBe(false)
  })

  it("shows the selected handling near intake and focuses Options from Change", () => {
    session.signedIn = true
    capabilities.catalog = [{
      id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document",
      handling: { capability: "selectable", choices: ["reject", "redact"], default: "redact" }, results: { markdown: false, report: false, artifact: true },
    }]
    render(<WorkflowPage workflow={CATALOG.find((w) => w.id === "hr-hiring")!} uploadLabel="Test"><button>Inside</button></WorkflowPage>)
    const change = screen.getByRole("button", { name: "Change" })
    expect(screen.getByText(/Personal information handling: Redact/)).toBeTruthy()
    fireEvent.click(change)
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Personal information handling" }))
    const reject = screen.getByRole("radio", { name: /Reject/ })
    fireEvent.click(reject)
    expect(screen.getByText(/Personal information handling: Reject/)).toBeTruthy()
  })

  it("does not replace a withdrawn selection with the new default", () => {
    session.signedIn = true
    const workflow = CATALOG.find((w) => w.id === "hr-hiring")!
    capabilities.catalog = [{
      id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document",
      handling: { capability: "selectable", choices: ["reject", "redact"], default: "redact" }, results: { markdown: false, report: false, artifact: true },
    }]
    const { rerender } = render(<WorkflowPage workflow={workflow} uploadLabel="Test"><button>Inside</button></WorkflowPage>)
    fireEvent.click(screen.getByRole("button", { name: "Change" }))
    fireEvent.click(screen.getByRole("radio", { name: /Reject/ }))
    capabilities.catalog = [{
      id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document",
      handling: { capability: "selectable", choices: ["redact"], default: "redact" }, results: { markdown: false, report: false, artifact: true },
    }]
    rerender(<WorkflowPage workflow={workflow} uploadLabel="Test"><button>Inside</button></WorkflowPage>)
    expect(screen.getByRole("alert").textContent).toContain("Handling options changed")
    expect(screen.getByRole("button", { name: "Inside" }).closest("fieldset")?.disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Review options" }))
    fireEvent.click(screen.getByRole("radio", { name: /Redact/ }))
    expect(screen.getByText(/Personal information handling: Redact/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Inside" }).closest("fieldset")?.disabled).toBe(false)
  })

  it("blocks source controls when capability discovery fails", () => {
    session.signedIn = true
    capabilities.catalog = null
    render(<WorkflowPage workflow={CATALOG.find((w) => w.id === "hr-hiring")!} uploadLabel="Test"><button>Inside</button></WorkflowPage>)
    expect(screen.getByRole("alert").textContent).toContain("Handling options are unavailable. Reload before submitting another source.")
    expect(screen.getByRole("button", { name: "Inside" }).closest("fieldset")?.disabled).toBe(true)
  })

  it("keeps existing review usable and its handling identified after capabilities fail", () => {
    session.signedIn = true
    const workflow = CATALOG.find((w) => w.id === "hr-hiring")!
    capabilities.catalog = [{
      id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document",
      handling: { capability: "selectable", choices: ["reject", "redact"], default: "redact" }, results: { markdown: false, report: false, artifact: true },
    }]
    const { rerender } = render(<WorkflowPage workflow={workflow} uploadLabel="Test"><FreezeRun /><button>Review decision</button></WorkflowPage>)
    fireEvent.click(screen.getByRole("button", { name: "Prepared source" }))
    capabilities.catalog = null
    rerender(<WorkflowPage workflow={workflow} uploadLabel="Test"><FreezeRun /><button>Review decision</button></WorkflowPage>)
    expect(screen.getByText(/handling for this prepared source: Redact/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Review decision" }).closest("fieldset")?.disabled).toBe(false)
  })

  it("revalidates capabilities at intake and rejects a changed Redact default", async () => {
    session.signedIn = true
    capabilities.catalog = [{
      id: "hr-onboarding", identity_requirement: "protected", intake_modes: ["file"], accepted_file_types: [".pdf"], pii_profile: "protected-document",
      handling: { capability: "selectable", choices: ["redact", "reject"], default: "redact" }, results: { markdown: true, report: false, artifact: false },
    }]
    refresh.mockResolvedValueOnce([{ ...capabilities.catalog[0], handling: { capability: "selectable", choices: ["redact", "reject"], default: "reject" } }] as never)
    const submit = vi.fn()
    render(<WorkflowPage workflow={CATALOG.find((w) => w.id === "hr-onboarding")!} uploadLabel="Test"><ValidateThenSubmit submit={submit} /></WorkflowPage>)
    fireEvent.click(screen.getByRole("button", { name: "Validate then submit" }))
    await vi.waitFor(() => expect(document.body.dataset.validationFinished).toBe("true"))
    expect(submit).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
  })

  it.each(["sign-out", "identity switch"])("does not submit source after %s during asynchronous capability validation", async (change) => {
    session.signedIn = true
    session.identity = { name: "Member", email: "one@example.test" }
    capabilities.catalog = [{ id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document", handling: { capability: "selectable", choices: ["redact"], default: "redact" }, results: { markdown: false, report: false, artifact: true } }]
    let resolveCatalog!: (catalog: unknown[]) => void
    refresh.mockReturnValueOnce(new Promise<unknown[]>((resolve) => { resolveCatalog = resolve }) as never)
    const submit = vi.fn()
    const workflow = CATALOG.find((w) => w.id === "hr-hiring")!
    const { rerender } = render(<WorkflowPage workflow={workflow} uploadLabel="Test"><ValidateThenSubmit submit={submit} /></WorkflowPage>)
    fireEvent.click(screen.getByRole("button", { name: "Validate then submit" }))
    if (change === "sign-out") { session.signedIn = false; session.identity = null }
    else session.identity = { name: "Other member", email: "two@example.test" }
    rerender(<WorkflowPage workflow={workflow} uploadLabel="Test"><ValidateThenSubmit submit={submit} /></WorkflowPage>)
    resolveCatalog(capabilities.catalog as unknown[])
    await vi.waitFor(() => expect(document.body.dataset.validationFinished).toBe("true"))
    expect(submit).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(screen.queryAllByText("Checking available handling options…")).toHaveLength(0))
    if (change === "identity switch") expect(document.querySelector(".workflow-gate")?.hasAttribute("disabled")).toBe(false)
  })

  it("freezes the submitted choice while a deferred intake request is pending", async () => {
    session.signedIn = true
    capabilities.catalog = [{ id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document", handling: { capability: "selectable", choices: ["redact", "off"], default: "redact" }, results: { markdown: false, report: false, artifact: true } }]
    let finish!: () => void
    const request = new Promise<void>((resolve) => { finish = resolve })
    render(<WorkflowPage workflow={CATALOG.find((w) => w.id === "hr-hiring")!} uploadLabel="Test"><PendingSubmit finish={request} /></WorkflowPage>)
    fireEvent.click(screen.getByRole("tab", { name: "Options" }))
    fireEvent.click(screen.getByRole("button", { name: "Submit pending" }))
    expect(await screen.findByText(/Submitting source with personal information handling: Redact/)).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Redact" })).toBeDisabled()
    expect(screen.getByRole("radio", { name: "Off" })).toBeDisabled()
    finish()
    await vi.waitFor(() => expect(screen.getByText(/handling for this prepared source: Redact/i)).toBeTruthy())
  })

  it("keeps the Off warning visible after source preparation", () => {
    session.signedIn = true
    capabilities.catalog = [{ id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document", handling: { capability: "selectable", choices: ["redact", "off"], default: "off" }, results: { markdown: false, report: false, artifact: true } }]
    render(<WorkflowPage workflow={CATALOG.find((w) => w.id === "hr-hiring")!} uploadLabel="Test"><FreezeSelectedRun /></WorkflowPage>)
    fireEvent.click(screen.getByRole("button", { name: "Prepared source" }))
    expect(screen.getAllByText(/Personal information may remain in the material processed by this tool/).length).toBeGreaterThan(0)
  })
})
