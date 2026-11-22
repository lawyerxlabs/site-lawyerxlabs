// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"
import { HrHiringPanel } from "@/pages/HrHiring"
import { createHrSession, deleteHrSession, generateHrSession } from "@/lib/api"
import { getWorkflow } from "@/lib/workflows"
import { resetWorkflowCapabilitiesForTests } from "@/lib/useWorkflowCapabilities"
import { TEST_WORKFLOW_CAPABILITIES } from "./fixtures/workflow-capabilities"

const session = vi.hoisted(() => {
  vi.stubEnv("VITE_SURFACE", "human-resources")
  return { signedIn: true, ready: true }
})
const dynamicCatalog = vi.hoisted(() => ({ catalog: null as unknown }))
const capabilityRefresh = vi.hoisted(() => ({ deferred: null as Promise<unknown[]> | null }))
vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: session.signedIn, identity: null, ready: session.ready, login: vi.fn(), logout: vi.fn() }) }))
vi.mock("@/lib/useWorkflowCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useWorkflowCapabilities")>()
  const { TEST_WORKFLOW_CAPABILITIES } = await import("./fixtures/workflow-capabilities")
  return { ...actual, useWorkflowCatalog: () => dynamicCatalog.catalog ?? TEST_WORKFLOW_CAPABILITIES, refreshWorkflowCapabilities: async () => capabilityRefresh.deferred ?? dynamicCatalog.catalog ?? TEST_WORKFLOW_CAPABILITIES, useResolvedWorkflow: (workflow: Parameters<typeof actual.overlayCapability>[0]) => actual.overlayCapability(workflow, (dynamicCatalog.catalog ?? TEST_WORKFLOW_CAPABILITIES) as Parameters<typeof actual.overlayCapability>[1]) }
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); session.signedIn = true; dynamicCatalog.catalog = null; capabilityRefresh.deferred = null; delete (window as { turnstile?: unknown }).turnstile })

const prepared = {
  session_id: "session-1234567890123456", status: "source_ready", source: { kind: "pasted_text", sha256: "a".repeat(64), character_count: 120 }, workflow_settings: { handling: "redact" },
  preview: { status: "safe", text: "Redacted preview" }, criteria: [{ criterion_id: "role_title", label: "Role title", extracted_value: "Engineer", decision: "unresolved", provenance: { kind: "source", locator: { page: 1, anchor: "Role title" } } }], gaps: [], limitations: [], outcomes: ["improved_job_description"], limits: {},
}
const generated = { session_id: prepared.session_id, status: "generated", source_sha256: prepared.source.sha256, outcome: "improved_job_description", format: "text/markdown", content: "# Improved job description\n\nEngineer", criteria: [{ criterion_id: "role_title", decision: "confirm", provenance: { kind: "source" } }], disclaimer: "For professional review." }
function mount() { return render(<MemoryRouter initialEntries={["/playground/?workflow=hr-hiring"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>) }
async function uploadSource() { fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [new File(["%PDF"], "role.pdf", { type: "application/pdf" })] } }); await waitFor(() => expect(screen.getByRole("button", { name: "Prepare source" })).toBeEnabled()) }

it("posts pasted text and PDF using the staged session contract", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(prepared), { status: 201 }))
  await createHrSession({ kind: "pasted_text", text: "x".repeat(120) }, "redact")
  expect(fetch.mock.calls[0][0]).toBe("/hr/v1/sessions")
  expect((fetch.mock.calls[0][1] as RequestInit).headers).toEqual({ "Content-Type": "application/json" })
  expect(JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string).workflow_settings).toEqual({ handling: "redact" })
  const pdf = new File(["%PDF"], "role.pdf", { type: "application/pdf" })
  await createHrSession({ kind: "pdf", file: pdf }, "off")
  expect(fetch.mock.calls[1][0]).toBe("/hr/v1/sessions")
  const form = (fetch.mock.calls[1][1] as RequestInit).body as FormData
  expect(form).toBeInstanceOf(FormData)
  expect(form.get("workflow_settings")).toBe('{"handling":"off"}')
})

it("gates signed-out HR like other protected workflows: no source controls, no /hr/v1 request, no Turnstile", () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  const turnstileRender = vi.fn(() => "widget-1")
  ;(window as { turnstile?: unknown }).turnstile = { render: turnstileRender, remove: vi.fn(), reset: vi.fn() }
  session.signedIn = false
  mount()
  expect(screen.getByText("Sign in to use this workflow")).toBeTruthy()
  expect(screen.queryByLabelText("Paste source text")).toBeNull()
  expect(screen.queryByLabelText("Upload PDF")).toBeNull()
  expect(turnstileRender).not.toHaveBeenCalled()
  expect(fetch.mock.calls.some(([url]) => String(url).startsWith("/hr/v1"))).toBe(false)
})

it("does not mount Turnstile for signed-in HR callers", () => {
  const turnstileRender = vi.fn(() => "widget-1")
  ;(window as { turnstile?: unknown }).turnstile = { render: turnstileRender, remove: vi.fn(), reset: vi.fn() }
  session.signedIn = true
  mount()
  expect(turnstileRender).not.toHaveBeenCalled()
})

it("rejects non-PDF uploads and cannot prepare them", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  mount()
  fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [new File(["not a pdf"], "role.txt", { type: "text/plain" })] } })
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PDF file.")
  expect(screen.getByRole("button", { name: "Prepare source" })).toBeDisabled()
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  expect(fetch).not.toHaveBeenCalled()
})

it("offers one PDF upload and pasted text for signed-in callers", () => {
  mount()
  expect(screen.getByLabelText("Upload PDF").getAttribute("accept")).toBe(".pdf")
  fireEvent.click(screen.getByLabelText("Paste text"))
  expect(screen.getByLabelText("Paste source text")).toBeTruthy()
})

it("prepares pasted text as a signed-in JSON request with no verification field", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(prepared), { status: 201 }))
  mount()
  fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "x".repeat(120) } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  await screen.findByText("Redacted preview")
  const init = fetch.mock.calls[0][1] as RequestInit
  expect(fetch.mock.calls[0][0]).toBe("/hr/v1/sessions")
  expect(JSON.parse(init.body as string).source).toEqual({ kind: "pasted_text", text: "x".repeat(120) })
})

it("does not submit source when unmounted during handling validation", async () => {
  let resolveCatalog!: (catalog: unknown[]) => void
  capabilityRefresh.deferred = new Promise((resolve) => { resolveCatalog = resolve })
  const fetch = vi.spyOn(globalThis, "fetch")
  const view = mount()
  fireEvent.click(screen.getByLabelText("Paste text"))
  fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "x".repeat(120) } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  view.unmount()
  resolveCatalog(TEST_WORKFLOW_CAPABILITIES)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(fetch.mock.calls.some(([url]) => String(url) === "/hr/v1/sessions")).toBe(false)
})

it("renders a single page h1 (the workflow label) with the intro text", () => {
  mount()
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(getWorkflow("hr-hiring")?.label)
  expect(screen.getByText("Prepare an improved job description from one PDF or pasted text for professional review.")).toBeTruthy()
})

it("renders source preparation and keeps generation disabled until decisions are valid", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(prepared), { status: 201 }))
  mount()
  await uploadSource()
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  await screen.findByText("Redacted preview")
  expect(screen.getByRole("button", { name: "Generate improved job description" })).toBeEnabled()
  fireEvent.click(screen.getByLabelText("confirm", { selector: "input" }))
  expect(screen.getByRole("button", { name: "Generate improved job description" })).toBeEnabled()
})

it("requires correction text and sends criterion decisions to generation", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(generated), { status: 200 }))
  mount(); await uploadSource(); fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  await screen.findByText("Redacted preview"); fireEvent.click(screen.getByLabelText("correct", { selector: "input" }))
  expect(screen.getByRole("button", { name: "Generate improved job description" })).toBeDisabled()
  fireEvent.change(screen.getByLabelText("Correction for Role title"), { target: { value: "Senior engineer" } }); fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" }))
  await screen.findByText("Engineer")
  const body = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string)
  expect(body.criteria).toEqual([{ criterion_id: "role_title", decision: "correct", value: "Senior engineer" }])
})

it("blocks retries after a post-invocation uncertain result", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "generation_outcome_unknown", message: "uncertain" } }), { status: 503 }))
  mount(); await uploadSource(); fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  await screen.findByText("Redacted preview")
  fireEvent.click(screen.getByLabelText("confirm", { selector: "input" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" }))
  const generate = screen.getByRole("button", { name: "Generate improved job description" })
  await waitFor(() => expect(generate).toBeDisabled())
  expect(screen.getAllByRole("alert").some((alert) => /uncertain/i.test(alert.textContent ?? ""))).toBe(true)
  expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toMatch(/Do not retry or replace this source as a resolution/)
  expect(screen.queryByRole("button", { name: "Replace source" })).toBeNull()
  fireEvent.click(generate)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each([
  ["network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
  ["generation in progress", () => Promise.resolve(new Response(JSON.stringify({ error: { code: "generation_in_progress", message: "in progress" } }), { status: 409 }))],
])("blocks another generation after %s", async (_label, generateResponse) => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
    .mockImplementationOnce(generateResponse as () => Promise<Response>)
  mount(); await uploadSource(); fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  await screen.findByText("Redacted preview")
  fireEvent.click(screen.getByLabelText("confirm", { selector: "input" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" }))
  const generate = screen.getByRole("button", { name: "Generate improved job description" })
  await waitFor(() => expect(generate).toBeDisabled())
  await waitFor(() => expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toMatch(/Generation outcome is uncertain/))
  expect(screen.queryByText(/try again/i)).toBeNull()
  fireEvent.click(screen.getByLabelText("correct", { selector: "input" }))
  fireEvent.change(screen.getByLabelText("Correction for Role title"), { target: { value: "Changed title" } })
  fireEvent.click(generate)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it("blocks over-long corrections and renders hostile Markdown as inert text", async () => {
  const hostile = { ...generated, content: "<img src=x onerror=alert(1)> # Hi" }
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(hostile), { status: 200 }))
  mount(); await uploadSource(); fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  await screen.findByText("Redacted preview"); fireEvent.click(screen.getByLabelText("correct", { selector: "input" }))
  fireEvent.change(screen.getByLabelText("Correction for Role title"), { target: { value: "y".repeat(2001) } })
  expect(screen.getByRole("button", { name: "Generate improved job description" })).toBeDisabled()
  fireEvent.change(screen.getByLabelText("Correction for Role title"), { target: { value: "ok" } })
  fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" }))
  await screen.findByText(/onerror=alert/)
  expect(screen.getByRole("region", { name: "Improved job description" }).querySelector("img")).toBeNull()
})

it("renders and downloads generated Markdown, then deletes session on replace", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(generated), { status: 200 }))
    .mockImplementation(async () => new Response(null, { status: 204 }))
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test")
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  // JSDOM cannot navigate blob: anchors; stub the click so the download path runs without a navigation warning.
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("improved-job-description.md") })
  mount(); await uploadSource(); fireEvent.click(screen.getByRole("button", { name: "Prepare source" })); await screen.findByText("Redacted preview")
  fireEvent.click(screen.getByLabelText("confirm", { selector: "input" })); fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" })); await screen.findByText("For professional review.")
  fireEvent.click(screen.getByRole("button", { name: "Download Markdown" })); expect(create).toHaveBeenCalled(); expect(click).toHaveBeenCalledTimes(1)
  const user = userEvent.setup()
  const replace = screen.getByRole("button", { name: "Replace source" })
  await user.click(replace)
  const dialog = await screen.findByRole("alertdialog")
  await user.click(within(dialog).getByRole("button", { name: "Keep job description" }))
  expect(screen.getByText("For professional review.")).toBeTruthy()
  expect(replace).toHaveFocus()
  expect(fetch).not.toHaveBeenCalledWith(`/hr/v1/sessions/${prepared.session_id}`, { method: "DELETE" })
  await user.click(replace)
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete source and replace" }))
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/hr/v1/sessions/${prepared.session_id}`, { method: "DELETE" }))
  expect(screen.getByRole("heading", { name: "Original source" })).toHaveFocus()
})

it("shows the generated job description in ReviewWorkspace beside the redacted preview", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(generated), { status: 200 }))
  mount(); await uploadSource(); fireEvent.click(screen.getByRole("button", { name: "Prepare source" })); await screen.findByText("Redacted preview")
  fireEvent.click(screen.getByLabelText("confirm", { selector: "input" })); fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" }))
  await screen.findByText("For professional review.")
  expect(within(screen.getByRole("region", { name: "Source document" })).getByText("Redacted preview")).toBeTruthy()
  expect(within(screen.getByRole("region", { name: "Improved job description" })).getByText("For professional review.")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: "Copy improved job description" }))
  expect(writeText).toHaveBeenCalledWith("# Improved job description\n\nEngineer\n\nFor professional review.")
  writeText.mockRejectedValueOnce(new Error("clipboard unavailable"))
  fireEvent.click(screen.getByRole("button", { name: "Copy improved job description" }))
  expect(await screen.findByText("Copy failed. Download Markdown for the job description; the disclaimer remains visible on screen.")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Generate improved job description" })).toBeNull()
  expect(document.querySelector(".review-workspace-root")).toBeTruthy()
})

it("labels Off-mode preview and generated content truthfully and retains the warning", async () => {
  const offPrepared = { ...prepared, workflow_settings: { handling: "off" }, preview: { status: "safe", text: "Synthetic personal detail" } }
  dynamicCatalog.catalog = [{ id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document", handling: { capability: "selectable", choices: ["redact", "off"], default: "redact" }, results: { markdown: true, report: true, artifact: false } }]
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(offPrepared), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(generated), { status: 200 }))
  mount()
  fireEvent.click(screen.getByRole("tab", { name: "Options" }))
  fireEvent.click(screen.getByRole("radio", { name: "Off" }))
  fireEvent.click(screen.getByLabelText("Paste text"))
  fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "x".repeat(120) } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  expect(await screen.findByRole("heading", { name: "Prepared source preview" })).toBeTruthy()
  expect(screen.getByText(/Personal information may remain in this source preview/)).toBeTruthy()
  expect(screen.getAllByText(/Personal information may remain in the material processed by this tool/).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByLabelText("confirm", { selector: "input" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" }))
  expect(await screen.findByText(/This draft was generated with Off handling/)).toBeTruthy()
  expect(within(screen.getByRole("region", { name: "Source document" })).getByText(/Prepared source preview\. Personal information may remain/)).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(2)
})

it.each([
  ["missing Redact", "redact", undefined],
  ["missing Off", "off", undefined],
  ["Off answered with Redact", "off", "redact"],
] as const)("does not expose or generate from a session when %s handling is unconfirmed", async (_label, requested, returned) => {
  dynamicCatalog.catalog = [{ id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document", handling: { capability: "selectable", choices: ["reject", "redact", "off"], default: "redact" }, results: { markdown: true, report: true, artifact: false } }]
  const response: Record<string, unknown> = { ...prepared }
  if (returned) response.workflow_settings = { handling: returned }
  else delete response.workflow_settings
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => init?.method === "DELETE"
    ? new Response(null, { status: 204 })
    : new Response(JSON.stringify(response), { status: 201 }))
  mount()
  if (requested === "off") {
    fireEvent.click(screen.getByRole("tab", { name: "Options" }))
    fireEvent.click(screen.getByRole("radio", { name: "Off" }))
  }
  fireEvent.click(screen.getByLabelText("Paste text"))
  fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "x".repeat(120) } })
  await waitFor(() => expect(screen.getByRole("button", { name: "Prepare source" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))

  expect(await screen.findByRole("alert")).toHaveTextContent("The source was submitted and processed, but the server did not confirm the requested handling mode. The prepared session was deleted without being shown.")
  const create = fetch.mock.calls.find(([url, init]) => url === "/hr/v1/sessions" && init?.method === "POST")!
  expect(JSON.parse((create[1] as RequestInit).body as string).workflow_settings).toEqual({ handling: requested })
  await waitFor(() => expect(fetch.mock.calls.filter(([url, init]) => url === `/hr/v1/sessions/${prepared.session_id}` && init?.method === "DELETE")).toHaveLength(1))
  expect(screen.queryByRole("heading", { name: "Prepared source preview" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Generate improved job description" })).toBeNull()
})

it("does not show an unconfirmed session when its DELETE fails", async () => {
  dynamicCatalog.catalog = [{ id: "hr-hiring", identity_requirement: "protected", intake_modes: ["file", "text"], accepted_file_types: [".pdf"], pii_profile: "protected-document", handling: { capability: "selectable", choices: ["redact", "off"], default: "redact" }, results: { markdown: true, report: true, artifact: false } }]
  const response = { ...prepared, workflow_settings: { handling: "redact" } }
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => init?.method === "DELETE"
    ? new Response(JSON.stringify({ error: { code: "delete_failed" } }), { status: 500 })
    : new Response(JSON.stringify(response), { status: 201 }))
  mount()
  fireEvent.click(screen.getByRole("tab", { name: "Options" }))
  fireEvent.click(screen.getByRole("radio", { name: "Off" }))
  fireEvent.click(screen.getByLabelText("Paste text"))
  fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "x".repeat(120) } })
  await waitFor(() => expect(screen.getByRole("button", { name: "Prepare source" })).toBeEnabled())
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))

  expect(await screen.findByRole("alert")).toHaveTextContent("session removal could not be confirmed")
  expect(fetch.mock.calls.filter(([url, init]) => url === `/hr/v1/sessions/${prepared.session_id}` && init?.method === "DELETE")).toHaveLength(1)
  expect(screen.queryByRole("heading", { name: "Prepared source preview" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Generate improved job description" })).toBeNull()
})

it("disables source preparation while a request is in flight", async () => {
  let resolveFirst!: (value: Response) => void
  vi.spyOn(globalThis, "fetch").mockReturnValueOnce(new Promise<Response>((resolve) => { resolveFirst = resolve }))
  mount(); await uploadSource()
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  expect(screen.getByRole("progressbar", { name: "Preparing job description…" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Prepare source" })).toBeNull()
  resolveFirst(new Response(JSON.stringify(prepared), { status: 201 }))
  await screen.findByText("Redacted preview")
})

it("uses correct generation and delete adapter routes", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(generated), { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  await generateHrSession(prepared.session_id, [{ criterion_id: "role_title", decision: "confirm" }], "stable-adapter-key-0001")
  await deleteHrSession(prepared.session_id)
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([`/hr/v1/sessions/${prepared.session_id}/generation`, `/hr/v1/sessions/${prepared.session_id}`])
})

it("renders HR actions as shared Button primitives with unchanged disabled behavior", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(prepared), { status: 201 }))
  mount()
  const prepare = screen.getByRole("button", { name: "Prepare source" })
  expect(prepare.classList.contains("ll-button")).toBe(true)
  expect(prepare.classList.contains("ll-button-primary")).toBe(true)
  expect(prepare).toBeDisabled()
  await uploadSource()
  fireEvent.click(prepare)
  await screen.findByText("Redacted preview")
  const generate = screen.getByRole("button", { name: "Generate improved job description" })
  expect(generate.classList.contains("ll-button-primary")).toBe(true)
  const replace = screen.getByRole("button", { name: "Replace source" })
  expect(replace.classList.contains("ll-button-secondary")).toBe(true)
})

it("shows the sign-in gate to signed-out users and sends no /hr/v1 request", () => {
  session.signedIn = false
  try {
    const fetch = vi.spyOn(globalThis, "fetch")
    mount()
    expect(screen.getByText("Sign in to use this workflow")).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  } finally { session.signedIn = true }
})

it("replace during an in-flight generation drops the late result and sends exactly one DELETE", async () => {
  let release!: (r: Response) => void
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(prepared), { status: 201 }))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve }))
    .mockImplementation(async () => new Response(null, { status: 204 }))
  mount()
  await uploadSource()
  fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
  await screen.findByText("Redacted preview")
  fireEvent.click(screen.getByLabelText("confirm", { selector: "input" }))
  fireEvent.click(screen.getByRole("button", { name: "Generate improved job description" }))
  expect(screen.getByRole("progressbar", { name: "Generating improved job description…" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Extracted criteria" })).toBeTruthy()
  expect(screen.getByLabelText("confirm", { selector: "input" })).toBeDisabled()
  fireEvent.click(await screen.findByRole("button", { name: "Replace source" }))
  fireEvent.click(await screen.findByRole("button", { name: "Delete source and replace" }))
  release(new Response(JSON.stringify(generated), { status: 200 }))
  await waitFor(() => expect(fetch.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")).toHaveLength(1))
  expect(screen.queryByText("Improved job description")).toBeNull()
})

function catalogModes(intake_modes: string[]) {
  dynamicCatalog.catalog = [{ id: "hr-hiring", identity_requirement: "protected", intake_modes, accepted_file_types: [".pdf"], pii_profile: "protected-document", handling: { capability: "fixed", choices: ["redact"], default: "redact" }, results: { markdown: true, report: true, artifact: false } }]
}

describe("catalog-narrowed intake modes", () => {
  // The catalog is cached module-wide; reset around these tests so their mocked /workflows response does not leak.
  beforeEach(() => resetWorkflowCapabilitiesForTests())
  afterEach(() => resetWorkflowCapabilitiesForTests())

  it("text-only catalog: paste visible, no PDF input", async () => {
    catalogModes(["text"])
    mount()
    await waitFor(() => expect(screen.queryByLabelText("Upload PDF")).toBeNull())
    expect(screen.getByLabelText("Paste source text")).toBeTruthy()
  })

  it("file-only catalog: PDF visible, no paste box", async () => {
    catalogModes(["file"])
    mount()
    await waitFor(() => expect(screen.queryByLabelText("Paste source text")).toBeNull())
    expect(screen.getByLabelText("Upload PDF")).toBeTruthy()
  })
})

describe("preparation focus", () => {
  it.each([true, false])("moves focus to the %s result after preparation", async (success) => {
    let finish!: (response: Response) => void
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve }))
    render(<HrHiringPanel workflow={{ ...getWorkflow("hr-hiring")!, handling: { capability: "fixed", choices: ["redact"], default: "redact" } }} />)
    await uploadSource()
    fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
    expect(screen.getByText("Preparing job description…")).toHaveFocus()
    finish(success ? new Response(JSON.stringify(prepared), { status: 201 }) : new Response(JSON.stringify({ error: { code: "processing_failed" } }), { status: 500 }))
    const target = success ? await screen.findByRole("heading", { name: "Prepared source preview" }) : await screen.findByRole("alert")
    await waitFor(() => expect(target).toHaveFocus())
  })

  it("does not take focus back if the user moved away while preparing", async () => {
    let finish!: (response: Response) => void
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve }))
    render(<><button>Other action</button><HrHiringPanel workflow={{ ...getWorkflow("hr-hiring")!, handling: { capability: "fixed", choices: ["redact"], default: "redact" } }} /></>)
    await uploadSource()
    fireEvent.click(screen.getByRole("button", { name: "Prepare source" }))
    screen.getByRole("button", { name: "Other action" }).focus()
    finish(new Response(JSON.stringify(prepared), { status: 201 }))
    await screen.findByRole("heading", { name: "Prepared source preview" })
    expect(screen.getByRole("button", { name: "Other action" })).toHaveFocus()
  })
})
