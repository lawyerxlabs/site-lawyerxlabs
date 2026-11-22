// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"
import { parseTermArtifact, takeRawArtifact } from "@/lib/api"
import { WORKFLOWS } from "@/lib/workflows"

vi.mock("@/surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/surface")>()
  return { ...actual, surface: actual.SURFACES["signal-lawyers"] }
})

const session = vi.hoisted(() => ({ signedIn: true }))
const spies = vi.hoisted(() => ({ fetch: vi.fn() }))

// The PDF preview is pdf.js-backed; the tests only prove which File reaches it, so stub it with a marker.
vi.mock("@/components/SourcePreview", () => ({
  SourcePreview: ({ file, evidence }: { file?: File; evidence?: { page: number; quote: string } | null }) => <div className="source-preview" data-file={file?.name} data-evidence={evidence ? `${evidence.page}|${evidence.quote}` : ""} />,
}))

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: session.signedIn, ready: true, identity: null, login: vi.fn(), logout: vi.fn(), refreshMe: vi.fn() }),
}))

const fields = ["buyer", "seller", "property_address", "purchase_price", "deposit", "deposit_holder", "irrevocability", "completion_date", "requisition_date"].map((id) => ({
  id, label: id.replace(/_/g, " "), status: "not_found", value: null, claim: null,
}))
const artifact = {
  type: "term-isolation", version: 1,
  fields: fields.map((f) => f.id === "purchase_price"
    ? { ...f, status: "found", value: "$500,000", claim: { page: 1, anchor_id: "p1-price", quote: "Price $500,000" } }
    : f),
}
const result = { artifact, visual_evidence: [] }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); session.signedIn = true })

function renderAt(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/playground/" element={<Playground />} /></Routes></MemoryRouter>)
}

describe("term isolation playground", () => {
  it("belongs to the Signal Lawyers workflow catalog", () => {
    expect(WORKFLOWS.some((w) => (w.id as string) === "term-isolation")).toBe(true)
  })

  it("renders the Form 100 template requirement", () => {
    renderAt("/playground/?workflow=term-isolation")
    expect(screen.getByRole("heading", { level: 1, name: "Isolate Terms" })).toBeTruthy()
    expect(screen.getByText(/Template required: only OREA Form 100/i)).toBeTruthy()
  })

  it("submits to raw API, takes once, and renders the result", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`)
      if (url === "/v1/raw/term-isolation") return new Response(JSON.stringify({ id: "job123", expires_at: "x" }), { status: 202 })
      if (url === "/v1/jobs/job123/result/raw-artifact/take") return new Response(JSON.stringify(result), { status: 200 })
      return new Response("{}", { status: 404 })
    }))
    renderAt("/playground/?workflow=term-isolation")
    const input = document.querySelector<HTMLInputElement>(".dropzone input[type=file]")!
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4 synthetic"], "c.pdf", { type: "application/pdf" })] } })
    await waitFor(() => expect((screen.getByRole("button", { name: "Isolate Terms" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Isolate Terms" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Extracted terms" })).toBeTruthy())
    expect(screen.getByRole("region", { name: "Extracted terms table" }).textContent).toContain("$500,000")
    expect(document.querySelector(".dropzone")).toBeNull()
    expect(screen.getByRole("button", { name: "Process another document" })).toBeTruthy()
    expect(calls.filter((call) => !call.endsWith("GET /v1/workflows"))).toEqual(["POST /v1/raw/term-isolation", "POST /v1/jobs/job123/result/raw-artifact/take"])
    fireEvent.click(screen.getByRole("button", { name: "Process another document" }))
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Keep result" }))
    expect(screen.getByRole("heading", { name: "Extracted terms" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Process another document" }))
    fireEvent.click(screen.getByRole("button", { name: "Discard result" }))
    expect(screen.queryByRole("heading", { name: "Extracted terms" })).toBeNull()
    expect(document.querySelector(".dropzone")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Isolate Terms" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows dedicated extraction progress while busy and hides it once the result is ready", async () => {
    let finishPost!: (value: Response) => void
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === "/v1/raw/term-isolation") return new Promise<Response>((resolve) => { finishPost = resolve })
      return Promise.resolve(new Response(JSON.stringify(result), { status: 200 }))
    }))
    renderAt("/playground/?workflow=term-isolation")
    const input = document.querySelector<HTMLInputElement>(".dropzone input[type=file]")!
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4 synthetic"], "c.pdf", { type: "application/pdf" })] } })
    await waitFor(() => expect((screen.getByRole("button", { name: "Isolate Terms" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Isolate Terms" }))
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeTruthy())
    expect(screen.getByText(/Extracting terms from the agreement/)).toBeTruthy()
    finishPost(new Response(JSON.stringify({ id: "job123", expires_at: "x" }), { status: 202 }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Extracted terms" })).toBeTruthy())
    await waitFor(() => expect(screen.getByRole("heading", { name: "Extracted terms" })).toHaveFocus())
    expect(screen.queryByRole("progressbar")).toBeNull()
  })

  it("rejects a non-PDF/DOCX drop and never submits it", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 202 }))
    vi.stubGlobal("fetch", fetchSpy)
    renderAt("/playground/?workflow=term-isolation")
    const zone = document.querySelector<HTMLLabelElement>(".dropzone")!
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["hello"], "notes.txt", { type: "text/plain" })] } })
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Choose a PDF or DOCX file."))
    expect((screen.getByRole("button", { name: "Isolate Terms" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Isolate Terms" }))
    expect(fetchSpy.mock.calls.every(([url]) => url === "/v1/workflows")).toBe(true)
  })

  it("does not mount submission controls for signed-out users", () => {
    session.signedIn = false
    renderAt("/playground/?workflow=term-isolation")
    expect(screen.queryByRole("button", { name: "Isolate Terms" })).toBeNull()
    expect(screen.getByText("Sign in to use this workflow")).toBeTruthy()
  })
})

describe("term isolation source workspace", () => {
  function stubRaw() {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/v1/raw/term-isolation") return new Response(JSON.stringify({ id: "job123", expires_at: "x" }), { status: 202 })
      if (url === "/v1/jobs/job123/result/raw-artifact/take") return new Response(JSON.stringify(result), { status: 200 })
      return new Response("{}", { status: 404 })
    }))
  }
  async function submitFile(file: File) {
    renderAt("/playground/?workflow=term-isolation")
    const input = document.querySelector<HTMLInputElement>(".dropzone input[type=file]")!
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect((screen.getByRole("button", { name: "Isolate Terms" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Isolate Terms" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Extracted terms" })).toBeTruthy())
  }

  it("shows the client-selected source as a workspace with an honest DOCX unavailable message and claim evidence", async () => {
    stubRaw()
    await submitFile(new File(["PK\u0003\u0004synthetic"], "c.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))
    expect(document.querySelector(".workspace-source")).toBeTruthy()
    expect(screen.getByText(/Visual source location is unavailable for c\.docx/)).toBeTruthy()
    expect(document.querySelector(".source-preview")).toBeNull()
    const table = screen.getByRole("region", { name: "Extracted terms table" }).textContent ?? ""
    expect(table).toContain("Page 1: “Price $500,000”")
  })

  it("passes a PDF to SourcePreview in the source pane", async () => {
    stubRaw()
    await submitFile(new File(["%PDF-1.4 synthetic"], "c.pdf", { type: "application/pdf" }))
    await waitFor(() => expect(document.querySelector(".workspace-source .source-preview")?.getAttribute("data-file")).toBe("c.pdf"))
    expect(screen.queryByText(/Source preview is unavailable/)).toBeNull()
  })

  it("clicking a claim selects it, passes it to the PDF preview, and clears on reset", async () => {
    stubRaw()
    await submitFile(new File(["%PDF-1.4 synthetic"], "c.pdf", { type: "application/pdf" }))
    const preview = () => document.querySelector(".workspace-source .source-preview")
    expect(preview()?.getAttribute("data-evidence")).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "Page 1: “Price $500,000”" }))
    expect(screen.getByRole("button", { name: "Page 1: “Price $500,000”" }).getAttribute("aria-pressed")).toBe("true")
    expect(preview()?.getAttribute("data-evidence")).toBe("1|Price $500,000")
    fireEvent.click(screen.getByRole("button", { name: "Process another document" }))
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Discard result" }))
    const input = document.querySelector<HTMLInputElement>(".dropzone input[type=file]")!
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4 synthetic"], "c.pdf", { type: "application/pdf" })] } })
    await waitFor(() => expect((screen.getByRole("button", { name: "Isolate Terms" }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole("button", { name: "Isolate Terms" }))
    await waitFor(() => expect(preview()?.getAttribute("data-evidence")).toBe(""))
    expect(preview()?.getAttribute("data-evidence")).toBe("")
  })

  it("offers Extracted terms and JSON tabs, with JSON showing the raw artifact", async () => {
    stubRaw()
    await submitFile(new File(["PK\u0003\u0004synthetic"], "c.docx"))
    expect(screen.getByRole("tab", { name: "Extracted terms" }).getAttribute("aria-selected")).toBe("true")
    fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON" }))
    await waitFor(() => expect(document.querySelector(".playground-json")?.textContent).toContain("\"purchase_price\""))
  })

  it("copies the active terms table or raw JSON tab", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    stubRaw()
    await submitFile(new File(["PK\u0003\u0004synthetic"], "c.docx"))
    fireEvent.click(screen.getByRole("button", { name: "Copy terms table" }))
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("purchase price\tfound\t$500,000"))
    fireEvent.mouseDown(screen.getByRole("tab", { name: "JSON" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy term JSON" })).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Copy term JSON" }))
    expect(writeText).toHaveBeenLastCalledWith(JSON.stringify(result.artifact, null, 2))
  })

  it("reset drops the source file and its workspace", async () => {
    stubRaw()
    await submitFile(new File(["%PDF-1.4 synthetic"], "c.pdf", { type: "application/pdf" }))
    fireEvent.click(screen.getByRole("button", { name: "Process another document" }))
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Discard result" }))
    expect(document.querySelector(".workspace-source")).toBeNull()
    expect(document.querySelector(".workspace-results")).toBeNull()
    expect(screen.queryByText(/c\.pdf/)).toBeNull()
  })
})

describe("parseTermArtifact", () => {
  it("accepts the closed schema", () => {
    expect(parseTermArtifact(artifact).fields).toHaveLength(9)
  })

  it("rejects extra keys, wrong order, and a found value missing from its quote", () => {
    expect(() => parseTermArtifact({ ...artifact, extra: 1 })).toThrow()
    const reordered = { ...artifact, fields: [...artifact.fields].reverse() }
    expect(() => parseTermArtifact(reordered)).toThrow()
    const mismatch = { ...artifact, fields: artifact.fields.map((f) => f.id === "purchase_price" ? { ...f, value: "$1" } : f) }
    expect(() => parseTermArtifact(mismatch)).toThrow()
  })
})

describe("takeRawArtifact", () => {
  it("POSTs exactly once and never retries", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(takeRawArtifact("job1")).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
