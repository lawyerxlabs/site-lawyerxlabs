// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import userEvent from "@testing-library/user-event"
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { Landing } from "@/pages/Landing"
import App from "@/App"
import { getSource } from "@/lib/sourceStore"
import type { Job } from "@/lib/api"
import { CATALOG } from "@/lib/workflows"

const api = vi.hoisted(() => ({ upload: vi.fn(), signedIn: { value: false } }))

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>()
  return { ...actual, upload: api.upload }
})

vi.mock("@/lib/useTier", () => ({
  useTier: () => ({ me: null, signedIn: api.signedIn.value, refreshMe: vi.fn().mockResolvedValue(undefined), login: vi.fn(), logout: vi.fn() }),
}))

const intakeProps = vi.hoisted(() => ({ last: null as null | { compact?: boolean } }))

vi.mock("@/components/FileIntake", () => ({
  FileIntake: (props: { busy: boolean; onSubmit: (file: File, token: string) => void; compact?: boolean; note?: ReactNode }) => {
    intakeProps.last = { compact: props.compact }
    return (<>
      {props.note}
      <button type="button" disabled={props.busy} onClick={() => props.onSubmit(new File(["x"], "doc.docx"), "tok")}>
        Submit test upload
      </button>
    </>)
  },
}))

vi.mock("@/components/JobStatus", () => ({ JobStatus: () => <p>job status</p> }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.signedIn.value = false
})

const queuedJob: Job = {
  job_id: "alias-job-1",
  status: "queued",
  created_at: "2026-10-23T12:00:00.000Z",
  started_at: null,
  completed_at: null,
  expires_at: null,
  max_bytes: 10_000_000,
  max_pages: 20,
}

const WARNING_LINE = "Automated detection can miss things. Removing names doesn't hide a case's facts. Check the copy against your original."
const BANNED = [/nothing goes to an ai/i, /best-effort/i, /structured working copy/i, /prepare a document for ai/i, /whichever comes first/i, /downloaded/i]

function Location() {
  const location = useLocation()
  return <output>{location.pathname + location.search}</output>
}

function renderLanding() {
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/playground/jobs/:jobId" element={<p>job page</p>} />
      </Routes>
      <Location />
    </BrowserRouter>,
  )
}

describe("homepage Alias", () => {
  it("uses the approved hero heading with an Open playground CTA", () => {
    renderLanding()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Explore how to integrate AI into your practice—before you build around it.")
    expect(within(document.querySelector(".landing-hero") as HTMLElement).getByRole("link", { name: "Open playground" }).getAttribute("href")).toBe("/playground/")
  })

  it("keeps Open Playground in the header", () => {
    renderLanding()
    const link = screen.getByRole("link", { name: "Open Playground" })
    expect(link.getAttribute("href")).toBe("/playground/")
    expect(link.className).toContain("ll-button-secondary")
    expect(screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/playground")).length).toBe(4)
  })

  it("describes the tool function in the card", () => {
    renderLanding()
    const box = within(document.getElementById("document-alias") as HTMLElement)
    expect(within(document.querySelector(".landing-top") as HTMLElement).getByRole("region", { name: "Upload a document to alias detected details" })).toBeTruthy()
  })


  it("passes compact to FileIntake on the Alias card", () => {
    renderLanding()
    expect(intakeProps.last?.compact).toBe(true)
  })

  it("places the Alias card beside the hero in a desktop wrapper", () => {
    renderLanding()
    const wrapper = document.querySelector(".landing-top") as HTMLElement
    expect(wrapper.querySelector(".landing-hero h1")).toBeTruthy()
    expect(wrapper.querySelector("#document-alias")).toBeTruthy()
  })

  it("renders the Alias box with privacy, warning, and upload", () => {
    renderLanding()
    const box = within(document.getElementById("document-alias") as HTMLElement)
    expect(box.getByText(WARNING_LINE)).toBeTruthy()
    expect(box.getByRole("button", { name: "Submit test upload" })).toBeTruthy()
  })


  it("uploads, keeps the source for preview, and opens the job page", async () => {
    const user = userEvent.setup()
    api.upload.mockResolvedValue(queuedJob)
    renderLanding()
    await user.click(screen.getByRole("button", { name: "Submit test upload" }))
    await waitFor(() => expect(document.querySelector("output")?.textContent).toBe("/playground/jobs/alias-job-1"))
    expect(api.upload).toHaveBeenCalledWith(expect.any(File), "tok", undefined, undefined)
    expect(getSource("alias-job-1")?.name).toBe("doc.docx")
  })

  it("shows no banned phrasing", () => {
    const { container } = renderLanding()
    for (const pattern of BANNED) expect(container.textContent).not.toMatch(pattern)
  })
})

describe("MVP Alias copy", () => {
  it("uses Alias naming and the approved plain copy", () => {
    render(<MemoryRouter><App /></MemoryRouter>)
    expect(screen.getByRole("region", { name: "Alias" })).toBeTruthy()
    expect(screen.getByText(/We start with Document Alias, which swaps detected personal details for placeholders/)).toBeTruthy()
    expect(screen.getByText(/Alias detects personal information/)).toBeTruthy()
  })

  it("does not expose TTL numbers or banned claims", () => {
    const { container } = render(<MemoryRouter><App /></MemoryRouter>)
    expect(container.textContent).not.toMatch(/\b\d+\s*(hours?|minutes?|days?)\b/i)
    for (const pattern of BANNED) expect(container.textContent).not.toMatch(pattern)
  })

  it("states one retention rule for all users with no fixed TTL or member-only read purge", () => {
    const { container, unmount } = render(<MemoryRouter><App /></MemoryRouter>)
    const anon = container.querySelector(".retention-note")?.textContent ?? ""
    expect(anon).toMatch(/Results are temporary, held on the server, and expire automatically/)
    expect(anon).toMatch(/Anonymous results are purged after both the document and the report have been read/)
    unmount()
    api.signedIn.value = true
    const signed = render(<MemoryRouter><App /></MemoryRouter>)
    expect(signed.container.querySelector(".retention-note")?.textContent).toBe(anon)
  })

  it("names the workflow Alias in the catalog", () => {
    expect(CATALOG.find((w) => w.id === "docalias")?.label).toBe("Alias")
  })
})
