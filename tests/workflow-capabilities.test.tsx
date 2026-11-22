// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FileIntake } from "@/components/FileIntake"
import type { WorkflowCapability } from "@/lib/api"
import { overlayCapability, isListed, handlingCapabilityStatus, resetWorkflowCapabilitiesForTests, loadWorkflowCapabilities, refreshWorkflowCapabilities } from "@/lib/useWorkflowCapabilities"
import { CATALOG, type Workflow } from "@/lib/workflows"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetWorkflowCapabilitiesForTests()
})

const docalias = CATALOG.find((w) => w.id === "docalias") as Workflow
const hiring = CATALOG.find((w) => w.id === "hr-hiring") as Workflow

const capability = (over: Partial<WorkflowCapability> & { id: string }): WorkflowCapability => ({
  identity_requirement: over.identity_requirement ?? (over.id === "docalias" ? "public" : "protected"),
  intake_modes: ["file"],
  accepted_file_types: [".pdf", ".docx"],
  pii_profile: over.pii_profile ?? (over.id === "docalias" ? "public-redaction" : "protected-document"),
  handling: { capability: "fixed", choices: ["redact"], default: "redact" },
  results: { markdown: true, report: true, artifact: false },
  ...over,
})

describe("overlayCapability", () => {
  it("keeps the static workflow when the catalog is unavailable (null)", () => {
    expect(overlayCapability(docalias, null)).toBe(docalias)
  })

  it("hides samples while the catalog is still loading (undefined)", () => {
    expect(overlayCapability(docalias, undefined).samples).toEqual([])
  })

  it("shows samples only when the backend lists the sample intake mode", () => {
    const withSample = overlayCapability(docalias, [capability({ id: "docalias", intake_modes: ["file", "sample"] })])
    expect(withSample.samples).toEqual(docalias.samples)
    const withoutSample = overlayCapability(docalias, [capability({ id: "docalias", intake_modes: ["file"] })])
    expect(withoutSample.samples).toEqual([])
  })

  it("maps backend file and text modes and never adds sample to inputModes", () => {
    const out = overlayCapability(hiring, [capability({ id: "hr-hiring", intake_modes: ["text", "file", "sample"] })])
    expect(out.inputModes).toEqual(["file", "text"])
  })

  it("keeps local json only when the static workflow already has it", () => {
    const withJson = { ...docalias, inputModes: ["file", "json"] as const }
    expect(overlayCapability(withJson, [capability({ id: "docalias", intake_modes: ["file"] })]).inputModes).toEqual(["file", "json"])
    expect(overlayCapability(docalias, [capability({ id: "docalias", intake_modes: ["file"] })]).inputModes).toEqual(["file"])
  })

  it("threads accepted_file_types onto the workflow", () => {
    const out = overlayCapability(docalias, [capability({ id: "docalias", accepted_file_types: [".pdf", ".docx", ".txt"] })])
    expect(out.acceptedFileTypes).toEqual([".pdf", ".docx", ".txt"])
  })

  it("intersects backend accepted_file_types with a static restriction", () => {
    const contract = CATALOG.find((w) => w.id === "contract-review") as Workflow
    const out = overlayCapability(contract, [capability({ id: "contract-review", accepted_file_types: [".pdf", ".docx", ".txt"] })])
    expect(out.acceptedFileTypes).toEqual([".pdf", ".docx"])
  })

  it("does not let the catalog widen protected contract-review intake or handling", () => {
    const contract = CATALOG.find((w) => w.id === "contract-review") as Workflow
    const out = overlayCapability(contract, [capability({
      id: "contract-review",
      intake_modes: ["file", "text"],
      handling: { capability: "selectable", choices: ["off"], default: "off" },
    })])
    expect(out.inputModes).toEqual(["file"])
    expect(out.handling).toEqual({ capability: "fixed", choices: ["pseudonymise"], default: "pseudonymise" })
  })

  it("empties inputModes for a backend workflow missing from the catalog", () => {
    const out = overlayCapability(docalias, [capability({ id: "other" })])
    expect(out.inputModes).toEqual([])
    expect(out.samples).toEqual([])
  })

  it("leaves presentation-only workflows (backendId null) untouched", () => {
    const soon = CATALOG.find((w) => w.backendId === null) as Workflow
    expect(overlayCapability(soon, [])).toBe(soon)
  })
})

describe("isListed", () => {
  it("keeps a workflow listed while loading or on static fallback", () => {
    expect(isListed(hiring, undefined)).toBe(true)
    expect(isListed(hiring, null)).toBe(true)
  })

  it("unlists only when a successful catalog omits the workflow", () => {
    expect(isListed(hiring, [capability({ id: "other" })])).toBe(false)
    expect(isListed(hiring, [capability({ id: "hr-hiring" })])).toBe(true)
  })
})

describe("handlingCapabilityStatus", () => {
  it("does not treat loading or failed capability discovery as authorization", () => {
    expect(handlingCapabilityStatus(hiring, undefined).status).toBe("checking")
    expect(handlingCapabilityStatus(hiring, null).status).toBe("unavailable")
  })

  it("requires a listed workflow and its validated handling capability", () => {
    expect(handlingCapabilityStatus(hiring, []).status).toBe("unavailable")
    expect(handlingCapabilityStatus(hiring, [capability({ id: "hr-hiring", handling: { capability: "none", choices: [], default: null } })]).status).toBe("unavailable")
    expect(handlingCapabilityStatus(hiring, [capability({ id: "hr-hiring", handling: { capability: "selectable", choices: ["reject", "redact"], default: "redact" } })]).status).toBe("ready")
    expect(handlingCapabilityStatus(hiring, [capability({ id: "hr-hiring", identity_requirement: "public", handling: { capability: "selectable", choices: ["reject", "redact"], default: "redact" } })]).status).toBe("unavailable")
    expect(handlingCapabilityStatus(hiring, [capability({ id: "hr-hiring", pii_profile: "public-redaction", handling: { capability: "selectable", choices: ["reject", "redact"], default: "redact" } })]).status).toBe("unavailable")
  })

  it("rejects backend handling that conflicts with a statically fixed contract", () => {
    const contract = CATALOG.find((w) => w.id === "contract-review") as Workflow
    expect(handlingCapabilityStatus(contract, [capability({ id: "contract-review", handling: { capability: "fixed", choices: ["pseudonymise"], default: "pseudonymise" } })]).status).toBe("ready")
    expect(handlingCapabilityStatus(contract, [capability({ id: "contract-review", handling: { capability: "selectable", choices: ["off"], default: "off" } })]).status).toBe("unavailable")
  })
})

describe("loadWorkflowCapabilities", () => {
  it("falls back to null when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"))
    expect(await loadWorkflowCapabilities()).toBeNull()
  })

  it("falls back to null when the catalog fails validation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ workflows: [{ id: 1 }] }), { status: 200 }))
    expect(await loadWorkflowCapabilities()).toBeNull()
  })

  it("refreshes the catalog at a new intake boundary", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflows: [capability({ id: "docalias" })] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workflows: [capability({ id: "docalias", accepted_file_types: [".pdf"] })] }), { status: 200 }))
    await loadWorkflowCapabilities()
    const refreshed = await refreshWorkflowCapabilities()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(refreshed?.[0].accepted_file_types).toEqual([".pdf"])
  })
})

describe("FileIntake accepted_file_types", () => {
  const txt = () => new File(["hello world"], "notes.txt", { type: "text/plain" })
  const pick = (container: HTMLElement, file: File) => fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } })
  const stubTurnstile = () => {
    const options: { callback?: (token: string) => void } = {}
    Object.defineProperty(window, "turnstile", { configurable: true, value: { render: vi.fn((_e, next) => { Object.assign(options, next); return "w" }), remove: vi.fn(), reset: vi.fn() } })
    return options
  }

  it("accepts .txt and sets the accept attribute from the backend list", () => {
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} acceptedFileTypes={[".pdf", ".docx", ".txt"]} />)
    expect((container.querySelector("input[type=file]") as HTMLInputElement).accept).toBe(".pdf,.docx,.txt")
    expect(screen.getByText("PDF or DOCX or TXT · One document at a time")).toBeTruthy()
  })

  it("accepts a .txt file without a magic-byte check", async () => {
    const options = stubTurnstile()
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} acceptedFileTypes={[".pdf", ".docx", ".txt"]} />)
    options.callback?.("tok")
    pick(container, txt())
    expect(await screen.findByText("notes.txt")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Alias Document" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "notes.txt" }), "tok")
  })

  it("rejects .txt when the backend does not list it", async () => {
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} />)
    pick(container, txt())
    expect(await screen.findByText("Choose a PDF or DOCX file.")).toBeTruthy()
    expect(screen.queryByText("notes.txt")).toBeNull()
  })

  it("keeps the PDF size and magic checks when txt is enabled", async () => {
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} acceptedFileTypes={[".pdf", ".txt"]} />)
    pick(container, new File(["plain text"], "fake.pdf", { type: "application/pdf" }))
    expect(await screen.findByText("That file is not a valid PDF.")).toBeTruthy()
  })
})

describe("workflow sample gate", () => {
  it("does not render the sample tab when the backend omits the sample mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ workflows: [capability({ id: "docalias", intake_modes: ["file"] })] }), { status: 200 }))
    const resolved = overlayCapability(docalias, await loadWorkflowCapabilities())
    render(<FileIntake busy={false} onSubmit={vi.fn()} samples={resolved.samples} inputModes={resolved.inputModes} />)
    await waitFor(() => expect(screen.queryByRole("tab", { name: "Try a sample" })).toBeNull())
  })
})
