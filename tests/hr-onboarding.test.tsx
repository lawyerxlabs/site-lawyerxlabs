// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"
import { OnboardingResult, escapeMd } from "@/components/OnboardingResult"
import { confirmOnboardClassifications, createOnboardSession, deleteOnboardSession, type OnboardArtifact, type OnboardSourceMeta } from "@/lib/api"
import { getWorkflow } from "@/lib/workflows"
import { applyPreparedSession, HrOnboardingPanel } from "@/pages/HrOnboarding"
import { HandlingContext } from "@/lib/handlingContext"

vi.hoisted(() => { vi.stubEnv("VITE_SURFACE", "human-resources") })
vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: true, identity: null, ready: true, login: vi.fn(), logout: vi.fn() }) }))
vi.mock("@/lib/useWorkflowCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useWorkflowCapabilities")>()
  const { TEST_WORKFLOW_CAPABILITIES } = await import("./fixtures/workflow-capabilities")
  return { ...actual, useWorkflowCatalog: () => TEST_WORKFLOW_CAPABILITIES, refreshWorkflowCapabilities: async () => TEST_WORKFLOW_CAPABILITIES, useResolvedWorkflow: (workflow: unknown) => workflow }
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, "clipboard") })

const created = {
  session_id: "onb_1234567890123456", expires_at: "2026-10-25T12:00:00Z", status: "awaiting_classification_confirmation",
  workflow_settings: { handling: "redact" },
  sources: [{ source_id: "src_1", filename: "jd.txt", media_type: "text/plain" }, { source_id: "src_2", filename: "policy.txt", media_type: "text/plain" }],
  classification_review: {
    classifications: [
      { source_id: "src_1", document_type: "unclassified", confidence: "low", alternatives: [] },
      { source_id: "src_2", document_type: "unclassified", confidence: "low", alternatives: [] },
    ],
    job_description_source_ids: [],
  },
}
const confirmed = { session_id: created.session_id, status: "ready_for_generation", confirmed_classifications: [], expires_at: created.expires_at }
const txt = (name: string) => new File(["synthetic"], name, { type: "text/plain" })

it("has a catalog entry that does not use /v1/jobs", () => {
  const w = getWorkflow("hr-onboarding")
  expect(w?.uploadId).toBeUndefined()
  expect(w?.disabled).toBe(false)
  expect(w?.handling).toEqual({ capability: "fixed", choices: ["redact"], default: "redact" })
  const notes = JSON.stringify(w?.notes)
  expect(notes).not.toContain("Generation pending")
  expect(notes).toContain("generate an onboarding sequence")
})

it("sends repeated `files` multipart, JSON classifications, and DELETE to /onboard/v1", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(confirmed), { status: 200 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  await createOnboardSession([txt("a.txt"), txt("b.txt")], "redact")
  expect(fetch.mock.calls[0][0]).toBe("/onboard/v1/sessions")
  const form = fetch.mock.calls[0][1]!.body as FormData
  expect(form.getAll("files")).toHaveLength(2)
  expect([...new Set([...form.keys()])]).toEqual(["files", "workflow_settings"])
  expect(form.get("workflow_settings")).toBe('{"handling":"redact"}')
  await confirmOnboardClassifications("s1", [{ source_id: "src_1", document_type: "job_description" }])
  expect(fetch.mock.calls[1][0]).toBe("/onboard/v1/sessions/s1/classifications")
  expect(JSON.parse(String(fetch.mock.calls[1][1]!.body))).toEqual({ classifications: [{ source_id: "src_1", document_type: "job_description" }] })
  await deleteOnboardSession("s1")
  expect(fetch.mock.calls[2][1]).toMatchObject({ method: "DELETE" })
})

it("shows the frontend's Redact request and never exposes a handling selector", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  expect(await screen.findByText("Personal information handling: Redact (this workflow requests Redact and verifies the server response)." )).toBeTruthy()
  expect(screen.getByText(/At intake, screening checks each source's extracted text for personal information/)).toBeTruthy()
  expect(screen.getByText(/screening can miss sensitive values/)).toBeTruthy()
  expect(screen.getByText(/employers must confirm each task/)).toBeTruthy()
  expect(screen.getByText(/This frontend requests Redact and displays a prepared source only after the server confirms Redact/)).toBeTruthy()
  expect(screen.queryByText(/backend confirms personal information handling is fixed/i)).toBeNull()
  expect(screen.queryByRole("tab", { name: "Options" })).toBeNull()
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url === "/onboard/v1/sessions")).toBe(true))
  const call = fetch.mock.calls.find(([url]) => url === "/onboard/v1/sessions")!
  const form = call[1]!.body as FormData
  expect([...form.keys()]).toEqual(["files", "workflow_settings"])
  expect(form.get("workflow_settings")).toBe('{"handling":"redact"}')
})

it.each([
  ["missing", undefined],
  ["mismatched", { handling: "off" }],
] as const)("does not show a prepared source when Redact confirmation is %s and waits for session deletion", async (_label, returnedSettings) => {
  const response: Record<string, unknown> = { ...created }
  if (returnedSettings) response.workflow_settings = returnedSettings
  else delete response.workflow_settings
  let resolveDelete!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => init?.method === "DELETE"
    ? new Promise<Response>((resolve) => { resolveDelete = resolve })
    : new Response(JSON.stringify(response), { status: 201 }))
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/onboard/v1/sessions/${created.session_id}`, { method: "DELETE" }))
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.queryByRole("heading", { name: "Confirm document types" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Generate checklist" })).toBeNull()
  await act(async () => { resolveDelete(new Response(null, { status: 204 })) })
  expect(await screen.findByRole("alert")).toHaveTextContent("These documents were submitted and may have been processed. Redact was not confirmed; the prepared session was deleted and will not be shown.")
})

it("reports when cleanup of a source with unconfirmed Redact cannot be confirmed", async () => {
  const response = { ...created }
  delete (response as Partial<typeof created>).workflow_settings
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => init?.method === "DELETE"
    ? new Response(JSON.stringify({ error: { code: "internal_error" } }), { status: 500 })
    : new Response(JSON.stringify(response), { status: 201 }))
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("These documents were submitted and may have been processed. Redact was not confirmed; removal of the prepared session could not be confirmed. The session was not shown.")
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/onboard/v1/sessions/${created.session_id}`, { method: "DELETE" }))
  expect(screen.queryByRole("heading", { name: "Confirm document types" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Generate checklist" })).toBeNull()
})

it("requires a job description before confirming, offers generation, and cleans up on unmount", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (init?.method === "DELETE") return new Response(null, { status: 204 })
    return new Response(JSON.stringify(String(input).endsWith("/classifications") ? confirmed : created), { status: String(input).endsWith("/classifications") ? 200 : 201 })
  })
  const { unmount } = render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt"), txt("policy.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  const confirm = await screen.findByRole("button", { name: "Confirm" })
  await waitFor(() => expect(screen.getByRole("heading", { name: "Confirm document types" })).toHaveFocus())
  expect((confirm as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText("Document type for jd.txt"), { target: { value: "job_description" } })
  expect((confirm as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(confirm)
  expect(await screen.findByRole("button", { name: "Generate checklist" })).toBeTruthy()
  unmount()
  await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true))
})

it("clears selected files after successful preparation", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt"), txt("policy.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  expect(await screen.findByRole("heading", { name: "Confirm document types" })).toBeTruthy()
  expect(screen.queryByLabelText("Upload source documents")).toBeNull()
  expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull()
})

it("successful preparation applies setters: clears files, stores the session, and maps types", () => {
  const next = { ...created, classification_review: { ...created.classification_review, classifications: [{ ...created.classification_review.classifications[0], document_type: "policy" }] } }
  const setFiles = vi.fn()
  const setSession = vi.fn()
  const setTypes = vi.fn()
  applyPreparedSession(next as any, { setFiles, setSession, setTypes })
  expect(setFiles).toHaveBeenCalledWith([])
  expect(setSession).toHaveBeenCalledWith(next)
  expect(setTypes).toHaveBeenCalledWith({ src_1: "policy" })
})

it("keeps selected files and Prepare enabled after a failed session POST", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: "boom" }), { status: 500 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }))
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt"), txt("policy.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus())
  const prepare = screen.getByRole("button", { name: "Prepare" }) as HTMLButtonElement
  expect(prepare.disabled).toBe(false)
  fireEvent.click(prepare)
  expect(await screen.findByRole("button", { name: "Confirm" })).toBeTruthy()
  expect((fetch.mock.calls[1][1]!.body as FormData).getAll("files")).toHaveLength(2)
})

it("explains rejected personal data during document preparation", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "pii_detected", message: "personal data detected" } }), { status: 422 }))
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  expect(await screen.findByText("Personal data was detected. Review the source documents before trying again.")).toBeTruthy()
})

// ── Generation and result panel (synthetic fixtures only) ──────────────────────

const sources: OnboardSourceMeta[] = [
  { source_id: "src_1", filename: "jd.txt", media_type: "text/plain" },
  { source_id: "src_2", filename: "policy.txt", media_type: "text/plain" },
]
// Shuffled on purpose: position order must win over array order.
const artifact: OnboardArtifact = {
  schema_version: "onboard.v1",
  title: "Onboarding sequence",
  items: [
    { id: "item_2", position: 2, task: "Confirm which forms the employee must complete.", timing: null, owner: "Owner: Confirm", dependencies: [], confirmation_required: true, confirmation_label: "Confirm with employer", provenance: [] },
    { id: "item_1", position: 1, task: "Review the workplace safety policy with <PERSON>.", timing: null, owner: "Owner: Confirm", dependencies: [], confirmation_required: false,
      provenance: [{ source_id: "src_2", location: { char_start: 120, char_end: 171 }, quote: "Employees must review the workplace safety policy." }] },
    { id: "item_3", position: 3, task: "Note <img src=x onerror=alert(1)> for the file.", timing: "Week 1", owner: "Owner: Confirm", dependencies: ["Policy acknowledgement"], confirmation_required: false,
      provenance: [{ source_id: "src_9", location: { char_start: 0, char_end: 9 }, quote: "Badge <EMAIL_ADDRESS> issued." }] },
  ],
  missing_information: [{ item_id: "item_2", detail: "The uploaded sources do not identify required employee forms.", confirmation_label: "Confirm with employer" }],
  limitations: ["Review and confirm this sequence with the employer before use."],
  notice: "AI-assisted draft. This checklist was generated using AI and the materials provided. This material may contain errors or omissions. Review with your professional advisors before use.",
}
const generated = { session_id: created.session_id, status: "generated", artifact }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const noContent = () => new Response(null, { status: 204 })
const blobText = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(b) })

function renderResult(onStartOver = vi.fn()) {
  return render(<OnboardingResult artifact={artifact} sources={sources} onStartOver={onStartOver} />)
}

it("renders the notice first, items in position order, and keeps model text literal", () => {
  const { container } = renderResult()
  expect(container.querySelector("section.onboarding-result")!.firstElementChild!.textContent).toBe(artifact.notice)
  expect([...container.querySelectorAll("ol.onboarding-items > li")].map((li) => li.id)).toEqual(["onboard-item-item_1", "onboard-item-item_2", "onboard-item-item_3"])
  expect(container.querySelector(".redaction-placeholder")!.textContent).toBe("<PERSON>")
  expect(container.querySelector("img")).toBeNull()
  expect(container.textContent).toContain("Note <img src=x onerror=alert(1)> for the file.")
})

it("chips show text for sourced and unsourced items and link missing info to the item", () => {
  const { container } = renderResult()
  const li1 = container.querySelector("#onboard-item-item_1") as HTMLElement
  const li2 = container.querySelector("#onboard-item-item_2") as HTMLElement
  expect(within(li1).getByText("Source-backed")).toBeTruthy()
  expect(within(li2).getByText("Needs confirmation")).toBeTruthy()
  expect(within(li2).getByText("Confirm with employer")).toBeTruthy()
  expect(container.querySelector('a[href="#onboard-item-item_2"]')!.textContent).toBe("Confirm with employer")
})

it("provenance is collapsed, names the source file, and falls back for unknown source ids", () => {
  const { container } = renderResult()
  expect(container.querySelector("#onboard-item-item_1 details")!.hasAttribute("open")).toBe(false)
  expect(screen.getByText("View source: policy.txt")).toBeTruthy()
  expect(screen.getByText("Source file: policy.txt")).toBeTruthy()
  expect(container.querySelector("blockquote")!.textContent).toBe("“Employees must review the workplace safety policy.”")
  expect(screen.getByText("View source: Source file unavailable")).toBeTruthy()
  expect(screen.getByText("Source file: Source file unavailable")).toBeTruthy()
  expect(document.body.textContent).not.toContain("src_9")
})

it("omits information and limitations sections when empty", () => {
  render(<OnboardingResult artifact={{ ...artifact, missing_information: [], limitations: [] }} sources={sources} onStartOver={vi.fn()} />)
  expect(screen.queryByText("Information to confirm")).toBeNull()
  expect(screen.queryByText("Limitations")).toBeNull()
})

it("renders a single page h1 (the workflow label) with the intro text", async () => {
  const { unmount } = render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Onboarding")
  expect(screen.getByText("Prepare a source-grounded onboarding sequence from a job description and employer policy documents.")).toBeTruthy()
  unmount()
})

it("moves focus to the result heading on mount", () => {
  renderResult()
  expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2, name: "Onboarding sequence" }))
})

it("copy and download serialize one in-memory checklist and use a safe filename", async () => {
  const blobs: Blob[] = []
  const names: string[] = []
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return "blob:test" })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  renderResult()
  fireEvent.click(screen.getByRole("button", { name: "Download checklist" }))
  fireEvent.click(screen.getByRole("button", { name: "Copy onboarding checklist" }))
  expect(await screen.findByRole("status")).toHaveTextContent("Onboarding checklist copied.")
  expect(names).toEqual(["onboarding-sequence.md"])
  const downloaded = await blobText(blobs[0])
  expect(writeText.mock.calls[0][0]).toBe(downloaded)
  for (const part of ["# Onboarding sequence", "policy.txt", "Confirm with employer", "## Information to confirm", "## Limitations"]) expect(downloaded).toContain(part)
})

it("download filename is slugged from untrusted titles", () => {
  const names: string[] = []
  URL.createObjectURL = vi.fn(() => "blob:test")
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download) })
  for (const title of ["../../<img src=x> Evil", "!!!", "", "a".repeat(100)]) {
    render(<OnboardingResult artifact={{ ...artifact, title }} sources={sources} onStartOver={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Download checklist" }))
    cleanup()
  }
  expect(names).toEqual(["img-src-x-evil.md", "onboarding-sequence.md", "onboarding-sequence.md", "a".repeat(60) + ".md"])
})

it("shows copy failure text when the clipboard is blocked", async () => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) }, configurable: true })
  renderResult()
  fireEvent.click(screen.getByRole("button", { name: "Copy onboarding checklist" }))
  expect(await screen.findByText("Copy failed. Use Download checklist instead.")).toBeTruthy()
})

it("start over asks for confirmation before calling the handler", async () => {
  const onStartOver = vi.fn()
  renderResult(onStartOver)
  fireEvent.click(screen.getByRole("button", { name: "Start over" }))
  fireEvent.click(await screen.findByRole("button", { name: "Keep checklist" }))
  expect(onStartOver).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("button", { name: "Start over" }))
  fireEvent.click(await screen.findByRole("button", { name: "Delete and start over" }))
  expect(onStartOver).toHaveBeenCalledTimes(1)
})

function flowFetch(generation: () => Response | Promise<Response>, deleted: () => Response = noContent) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input)
    if (init?.method === "DELETE") return deleted()
    if (url.endsWith("/generation")) return generation()
    if (url.endsWith("/classifications")) return json(confirmed)
    return json(created, 201)
  })
}

async function toGenerate(generation: () => Response | Promise<Response>, deleted?: () => Response) {
  const fetch = flowFetch(generation, deleted)
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt"), txt("policy.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  await screen.findByRole("button", { name: "Confirm" })
  fireEvent.change(screen.getByLabelText("Document type for jd.txt"), { target: { value: "job_description" } })
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
  await screen.findByRole("button", { name: "Generate checklist" })
  return fetch
}
const generationCalls = (fetch: ReturnType<typeof vi.spyOn>) => fetch.mock.calls.filter(([u]) => String(u).endsWith("/generation"))

it("posts generation once with body {} and shows the result", async () => {
  const fetch = await toGenerate(() => json(generated))
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  expect(await screen.findByRole("heading", { level: 2, name: "Onboarding sequence" })).toBeTruthy()
  expect(generationCalls(fetch)).toHaveLength(1)
  expect(generationCalls(fetch)[0][1]).toMatchObject({ method: "POST", body: "{}" })
})

it("renders the generated checklist in ReviewWorkspace with an honest source pane", async () => {
  await toGenerate(() => json(generated))
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  await screen.findByRole("heading", { level: 2, name: "Onboarding sequence" })
  const source = screen.getByRole("region", { name: "Source document" })
  expect(within(source).getByText(/visual preview is unavailable/)).toBeTruthy()
  expect(within(source).getByText("jd.txt")).toBeTruthy()
  expect(within(screen.getByRole("region", { name: "Onboarding checklist" })).getByRole("heading", { level: 2, name: "Onboarding sequence" })).toBeTruthy()
  expect(document.querySelector(".review-workspace-root")).toBeTruthy()
})

const errorCases: Array<[string, number, string, string[]]> = [
  ["pii_detected", 422, "Personal data was detected before generation. Nothing was sent to the AI service. Review the source documents before trying again.", ["Try again", "Replace documents"]],
  ["processing_failed", 502, "The checklist could not be generated. No partial result was saved.", ["Try again"]],
  ["processing_unavailable", 503, "Checklist generation is temporarily unavailable. Try again later.", ["Try again"]],
  ["llm_not_configured", 503, "Checklist generation is not configured yet.", ["Try again", "Start over"]],
  ["already_generated", 409, "This checklist was already generated and cannot be fetched again. Start over to create a new one.", ["Start over"]],
  ["session_state_conflict", 409, "Another session action is still in progress. Wait a moment, then try again.", ["Try again"]],
  ["session_not_found", 404, "This session was deleted or expired. Start over with your documents.", ["Start over"]],
]
it.each(errorCases)("maps %s to its copy and actions, keeping confirmed classifications", async (code, status, copy, actions) => {
  await toGenerate(() => json({ error: { code, message: "x" } }, status))
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  expect(await screen.findByText(copy)).toBeTruthy()
  const alert = screen.getByRole("alert")
  expect(within(alert).getAllByRole("button").map((b) => b.textContent)).toEqual(actions)
  expect((screen.getByLabelText("Document type for jd.txt") as HTMLSelectElement).value).toBe("job_description")
})

it("Try again re-calls generation only on an explicit click", async () => {
  let calls = 0
  const fetch = await toGenerate(() => (++calls === 1 ? json({ error: { code: "processing_failed", message: "x" } }, 502) : json(generated)))
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  await screen.findByText(/could not be generated/)
  expect(generationCalls(fetch)).toHaveLength(1)
  fireEvent.click(screen.getByRole("button", { name: "Try again" }))
  expect(await screen.findByRole("heading", { level: 2, name: "Onboarding sequence" })).toBeTruthy()
  expect(generationCalls(fetch)).toHaveLength(2)
})

it("Start over from a failure deletes the session and returns to intake", async () => {
  const fetch = await toGenerate(() => json({ error: { code: "llm_not_configured", message: "x" } }, 503))
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  fireEvent.click(await screen.findByRole("button", { name: "Start over" }))
  fireEvent.click(await screen.findByRole("button", { name: "Delete session and replace documents" }))
  expect(await screen.findByLabelText("Upload source documents")).toBeTruthy()
  expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
})

it("ignores a second Generate click while the first POST is in flight", async () => {
  let release: (r: Response) => void = () => {}
  const gate = new Promise<Response>((res) => { release = res })
  const fetch = await toGenerate(() => gate)
  const button = screen.getByRole("button", { name: "Generate checklist" })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(generationCalls(fetch)).toHaveLength(1)
  await act(async () => { release(json(generated)) })
  expect(await screen.findByRole("heading", { level: 2, name: "Onboarding sequence" })).toBeTruthy()
  expect(generationCalls(fetch)).toHaveLength(1)
})

it("shows generating status instead of stale 'Types confirmed.' while in flight", async () => {
  let release: (r: Response) => void = () => {}
  const gate = new Promise<Response>((res) => { release = res })
  await toGenerate(() => gate)
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  expect(screen.getByRole("status").textContent).toBe("Generating checklist…")
  expect(screen.getByRole("progressbar", { name: "Generating checklist…" })).toBeTruthy()
  expect(screen.queryByText("Types confirmed.")).toBeNull()
  await act(async () => { release(json(generated)) })
  expect(await screen.findByRole("heading", { level: 2, name: "Onboarding sequence" })).toBeTruthy()
  expect(screen.queryByRole("heading", { name: "Confirm document types" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Replace documents" })).toBeNull()
  expect(screen.getByText("Ready to review").className).toContain("ll-badge")
})

it("ignores a generation response that resolves after Replace documents", async () => {
  let release: (r: Response) => void = () => {}
  const gate = new Promise<Response>((res) => { release = res })
  const fetch = await toGenerate(() => gate)
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  fireEvent.click(screen.getByRole("button", { name: "Replace documents" }))
  fireEvent.click(await screen.findByRole("button", { name: "Delete session and replace documents" }))
  expect(await screen.findByLabelText("Upload source documents")).toBeTruthy()
  await act(async () => { release(json(generated)) })
  expect(screen.queryByRole("heading", { level: 2, name: "Onboarding sequence" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Generate checklist" })).toBeNull()
  expect(screen.queryByRole("alert")).toBeNull()
  expect(screen.queryByRole("status")).toBeNull()
  expect((screen.getByRole("button", { name: "Prepare" }) as HTMLButtonElement).disabled).toBe(true)
  expect(generationCalls(fetch)).toHaveLength(1)
})

it("escapeMd neutralises Markdown, HTML, URLs and line breaks in untrusted text", () => {
  const hostile = [
    "<script>alert(1)</script>",
    "# heading",
    "[x](javascript:alert(1))",
    "![i](http://evil.com)",
    "line one\n## injected\r\n- item\u2028more",
    "see https://evil.example/x and www.evil.example",
  ]
  for (const raw of hostile) {
    const out = escapeMd(raw)
    expect(out).not.toMatch(/(^|[^\\])[<>]/)
    expect(out).not.toMatch(/https?:\/\/|www\.evil/)
    expect(out).not.toMatch(/(^|[^\\])\]\(|(^|[^\\])!\[/)
    expect(out).not.toMatch(/[\r\n\u2028\u2029]/)
    expect(out).not.toMatch(/^#/)
  }
  expect(escapeMd("Review the policy.")).toBe("Review the policy.")
})

it("sends repeated files and fixed Redact workflow_settings in the session multipart", async () => {
  const fetch = flowFetch(() => json(generated))
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt"), txt("policy.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  await screen.findByRole("button", { name: "Confirm" })
  const form = fetch.mock.calls[0][1]!.body as FormData
  expect(form.getAll("files")).toHaveLength(2)
  expect(form.get("workflow_settings")).toBe('{"handling":"redact"}')
  expect(form.getAll("files")).toHaveLength(2)
})

it("requires confirmation before replacing onboarding work and restores focus on cancel", async () => {
  const fetch = await toGenerate(() => json(generated))
  const user = userEvent.setup()
  const replace = screen.getByRole("button", { name: "Replace documents" })
  await user.click(replace)
  const dialog = await screen.findByRole("alertdialog")
  await user.click(within(dialog).getByRole("button", { name: "Keep onboarding work" }))
  expect(screen.getByRole("heading", { name: "Confirm document types" })).toBeTruthy()
  expect(replace).toHaveFocus()
  expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false)

  await user.click(replace)
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete session and replace documents" }))
  await screen.findByLabelText("Upload source documents")
  expect(screen.getByRole("heading", { name: "Source documents" })).toHaveFocus()
  expect(fetch.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
  expect((screen.getByRole("button", { name: "Prepare" }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByLabelText("Upload source documents") as HTMLInputElement).value).toBe("")
})

it("retries the cleanup delete on unmount after a failed Start over", async () => {
  let deletes = 0
  const fetch = await toGenerate(() => json(generated), () => (++deletes === 1 ? json({ error: { code: "internal", message: "x" } }, 500) : noContent()))
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  await screen.findByRole("heading", { level: 2, name: "Onboarding sequence" })
  fireEvent.click(screen.getByRole("button", { name: "Start over" }))
  fireEvent.click(await screen.findByRole("button", { name: "Delete and start over" }))
  await screen.findByRole("alert")
  const deleteCalls = () => fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")
  expect(deleteCalls()).toHaveLength(1)
  cleanup()
  await waitFor(() => expect(deleteCalls()).toHaveLength(2))
})

it("escapes untrusted fields in the Markdown export so they cannot inject markup or lines", async () => {
  const blobs: Blob[] = []
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return "blob:test" })
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
  const evil: OnboardArtifact = {
    ...artifact,
    title: "<script>alert(1)</script>\n# heading",
    notice: "Notice\n# injected",
    items: [{ id: "item_1", position: 1, task: "[x](javascript:alert(1)) 2. fake", timing: "Week 1\n# Injected", owner: "![i](http://example.com/a.png)", dependencies: ["dep\n## dep"], confirmation_required: true, confirmation_label: "<b>Confirm</b>", provenance: [{ source_id: "src_x", location: { char_start: 0, char_end: 1 }, quote: "quote\n# quoted" }] }],
    missing_information: [{ item_id: "item_1", detail: "detail\n- detail", confirmation_label: "Label*" }],
    limitations: ["limit\n# lim"],
  }
  render(<OnboardingResult artifact={evil} sources={[{ source_id: "src_x", filename: "evil\n# name.txt", media_type: "text/plain" }]} onStartOver={vi.fn()} />)
  fireEvent.click(screen.getByRole("button", { name: "Download checklist" }))
  const md = await blobText(blobs[0])
  expect(md).not.toMatch(/<script>|<b>|\]\(javascript|!\[i\]\(http/)
  expect(md.split("\n").filter((l) => l.startsWith("#"))).toEqual([
    "# \\<script\\>alert\\(1\\)\\</script\\> \\# heading",
    "## Information to confirm",
    "## Limitations",
  ])
  expect(md).toContain("1. \\[x\\]\\(javascript:alert\\(1\\)\\) 2. fake")
  expect(md).toContain("   - Timing: Week 1 \\# Injected")
  expect(md).toContain("   - \\!\\[i\\]\\(http\\://example.com/a.png\\)")
  expect(md).toContain("   - Dependencies: dep \\#\\# dep")
  expect(md).toContain("   - Source: evil \\# name.txt — “quote \\# quoted”")
  expect(md).toContain("- Label\\*: detail - detail")
  expect(md).toContain("- limit \\# lim")
})

it("Start over from the result treats a repeat-delete 404 as success", async () => {
  const fetch = await toGenerate(() => json(generated), () => json({ error: { code: "session_not_found", message: "x" } }, 404))
  fireEvent.click(screen.getByRole("button", { name: "Generate checklist" }))
  fireEvent.click(await screen.findByRole("button", { name: "Start over" }))
  fireEvent.click(await screen.findByRole("button", { name: "Delete and start over" }))
  expect(await screen.findByLabelText("Upload source documents")).toBeTruthy()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1)
})


it("shows confirmation progress and keeps classifications stable until the request settles", async () => {
  let release!: (response: Response) => void
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (init?.method === "DELETE") return new Response(null, { status: 204 })
    if (String(input).endsWith("/classifications")) return new Promise<Response>((resolve) => { release = resolve })
    return new Response(JSON.stringify(created), { status: 201 })
  })
  render(<MemoryRouter initialEntries={["/playground/?workflow=hr-onboarding"]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  const select = await screen.findByLabelText("Document type for jd.txt")
  fireEvent.change(select, { target: { value: "job_description" } })
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
  expect(screen.getByRole("progressbar", { name: "Confirming document types…" })).toBeTruthy()
  expect(select).toBeDisabled()
  expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled()
  await act(async () => release(new Response(JSON.stringify(confirmed), { status: 200 })))
  expect(await screen.findByRole("button", { name: "Generate checklist" })).toBeTruthy()
})

it("deletes a session whose creation finishes after leaving the page", async () => {
  let release!: (response: Response) => void
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }))
    return new Promise<Response>((resolve) => { release = resolve })
  })
  const { unmount } = render(<HandlingContext.Provider value={{ selected: "redact", submitted: undefined, runPrepared: false, submissionPending: false, setSelected: vi.fn(), freezeRun: vi.fn(), beginSubmission: vi.fn(), cancelSubmission: vi.fn(), clearRun: vi.fn(), validateIntake: async () => ({ valid: true }) }}><HrOnboardingPanel workflow={getWorkflow("hr-onboarding")!} /></HandlingContext.Provider>)
  fireEvent.change(screen.getByLabelText("Upload source documents"), { target: { files: [txt("jd.txt")] } })
  fireEvent.click(screen.getByRole("button", { name: "Prepare" }))
  await waitFor(() => expect(fetch).toHaveBeenCalledWith("/onboard/v1/sessions", expect.anything()))
  unmount()
  act(() => { release(new Response(JSON.stringify(created), { status: 201 })) })
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(`/onboard/v1/sessions/${created.session_id}`, expect.objectContaining({ method: "DELETE" })))
})
