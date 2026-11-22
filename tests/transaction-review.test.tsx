// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { Playground } from "@/pages/Playground"

const session = vi.hoisted(() => {
  vi.stubEnv("VITE_SURFACE", "signal-lawyers")
  return { signedIn: true, ready: true }
})
vi.mock("@/lib/useTier", () => ({ useTier: () => ({ me: null, signedIn: session.signedIn, identity: null, ready: session.ready, login: vi.fn(), logout: vi.fn() }) }))
vi.mock("@/lib/useWorkflowCapabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useWorkflowCapabilities")>()
  const { TEST_WORKFLOW_CAPABILITIES } = await import("./fixtures/workflow-capabilities")
  return { ...actual, useWorkflowCatalog: () => TEST_WORKFLOW_CAPABILITIES, refreshWorkflowCapabilities: async () => TEST_WORKFLOW_CAPABILITIES, useResolvedWorkflow: (workflow: unknown) => workflow }
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const created = {
  session_id: "tx-session-1234567890",
  status: "ready",
  source: { kind: "pasted_text" },
  matched_template: { id: "ontario-orea-form-100-aps", name: "Ontario OREA Form 100", version: "0.1.0" },
  fields: {
    buyer: { value: "Jane Example", page: 1, status: "found", locators: [{ page: 1, anchor: "PURCHASED BY" }] },
    seller: { value: null, page: null, status: "ambiguous", locators: [] },
    property_address: { value: null, page: null, status: "not_found", locators: [] },
    purchase_price: { value: "100,000", page: 2, status: "found", locators: [{ page: 2, anchor: "PURCHASE PRICE" }] },
    deposit: { value: null, page: null, status: "not_found", locators: [] },
    irrevocability: { value: null, page: null, status: "not_found", locators: [] },
    completion_date: { value: null, page: null, status: "not_found", locators: [] },
  },
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/playground/*" element={<Playground />} /></Routes></MemoryRouter>)
}

describe("transaction-review page", () => {
  it("mounts the dedicated page, not RedactionFlow", () => {
    renderAt("/playground/?workflow=transaction-review")
    expect(screen.getByText("Professional review required — this is a draft.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Prepare review" })).toBeTruthy()
    expect(screen.queryByText(/Upload a document/)).toBeNull()
    expect(screen.queryByRole("button", { name: /Transaction Review/ })).toBeNull()
  })

  it("template_unmatched shows the template select beside the error and retries only on explicit click", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code: "template_unmatched", message: "x" } }), { status: 422 }))
      .mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText(/does not match the selected template/)
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus())
    expect(fetch).toHaveBeenCalledTimes(1)
    await new Promise((r) => setTimeout(r, 20))
    expect(fetch).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole("combobox", { name: /Template/ }), { target: { value: "ontario-orea-form-100-aps" } })
    fireEvent.click(screen.getByRole("button", { name: "Retry with selected template" }))
    await screen.findByText("Extracted fields")
    await waitFor(() => expect(screen.getByRole("heading", { name: "Review ready. Check the extracted fields below." })).toHaveFocus())
    expect(fetch).toHaveBeenCalledTimes(2)
    expect((fetch.mock.calls[1][1] as RequestInit).body).toContain('"template":"ontario-orea-form-100-aps"')
  })

  it("rejects non-PDF files without calling the Tx API", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.change(screen.getByLabelText("Upload PDF"), { target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } })
    await screen.findByText(/Only PDF files can be uploaded here/)
    expect((screen.getByRole("button", { name: "Prepare review" }) as HTMLButtonElement).disabled).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("Correct opens editing only; status becomes Corrected after a non-empty save", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields")
    const buyer = screen.getByRole("group", { name: "Buyer" })
    fireEvent.click(screen.getByRole("button", { name: "Correct Buyer" }))
    expect(within(buyer).getByText("Review: Not reviewed")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Correction for Buyer"), { target: { value: "   " } })
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(buyer).getByText("Review: Not reviewed")).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Correction for Buyer"), { target: { value: "Jane Corrected" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(within(buyer).getByText("Review: Corrected")).toBeTruthy()
  })

  it.each([
    ["invalid_source", "This source cannot be processed"],
    ["too_large", "This source cannot be processed"],
    ["extraction_failed", "Text extraction failed"],
  ])("maps %s to fixed copy without server text", async (code, copy) => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => new Response(JSON.stringify({ error: { code, message: "SECRET server text" } }), { status: 422 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText(new RegExp(copy))
    expect(screen.queryByText(/SECRET/)).toBeNull()
  })

  it("announces the completed review through a status region", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields")
    expect(screen.getByText("Review ready. Check the extracted fields below.").getAttribute("role")).toBe("status")
  })

  it("renders the completed review in ReviewWorkspace with the pasted source beside the fields", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields", { selector: "h3" })
    expect(within(screen.getByRole("region", { name: "Source document" })).getByText("Some APS text")).toBeTruthy()
    expect(within(screen.getByRole("region", { name: "Extracted fields" })).getByRole("button", { name: "Confirm Buyer" })).toBeTruthy()
    expect(document.querySelector(".review-workspace-root")).toBeTruthy()
  })

  it("requires confirmation before replacing a transaction review and restores focus on cancel", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
      .mockImplementation(async () => new Response(null, { status: 204 }))
    const user = userEvent.setup()
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text"))
    fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields")

    const replace = screen.getByRole("button", { name: "Replace source" })
    await user.click(replace)
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Keep review" }))
    expect(screen.getByText("Extracted fields")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Replace source" })).toHaveFocus()
    expect(fetch).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Replace source" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard review and replace source" }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/tx/v1/sessions/tx-session-1234567890", { method: "DELETE" }))
    expect(screen.getByRole("heading", { name: "Source" })).toHaveFocus()
    expect(screen.getByRole("button", { name: "Prepare review" })).toBeTruthy()
  })

  it("copies current transaction values, decisions, corrections, and unresolved fields", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields")
    fireEvent.click(screen.getByRole("button", { name: "Correct Buyer" }))
    fireEvent.change(screen.getByLabelText("Correction for Buyer"), { target: { value: "Jane Corrected" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm Seller" }))
    fireEvent.click(screen.getByRole("button", { name: "Copy transaction review" }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain("Buyer: Jane Corrected [Found; Page 1; Source: PURCHASED BY; Review: Corrected]")
    expect(writeText.mock.calls[0][0]).toContain("Seller: Ambiguous — no value shown [Ambiguous; Review: Confirmed]")
    expect(writeText.mock.calls[0][0]).toContain("Property address: Not located in source [Not found; Review: Not reviewed]")
  })

  it("review_status never appears in the POST body", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
      .mockImplementation(async () => new Response(null, { status: 204 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields")
    fireEvent.click(screen.getByRole("button", { name: "Correct Buyer" }))
    fireEvent.change(screen.getByLabelText("Correction for Buyer"), { target: { value: "Jane Corrected" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm Seller" }))
    expect(screen.getByText("Review: Corrected")).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(1)
    const body = String((fetch.mock.calls[0][1] as RequestInit).body)
    expect(body).not.toMatch(/review|status|correction|confirmed|corrected|rejected/)
  })

  it("unmount fires DELETE for the active session", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => new Response(JSON.stringify(created), { status: 201 }))
      .mockImplementation(async () => new Response(null, { status: 204 }))
    const view = renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields")
    view.unmount()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/tx/v1/sessions/tx-session-1234567890", { method: "DELETE" }))
  })
  it("Cancel during a pending create returns to source entry and deletes the late-created session", async () => {
    let release!: (r: Response) => void
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve }))
      .mockImplementation(async () => new Response(null, { status: 204 }))
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text")); fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Some APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("button", { name: "Prepare review" })).toBeTruthy()
    release(new Response(JSON.stringify(created), { status: 201 }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/tx/v1/sessions/tx-session-1234567890", { method: "DELETE" }))
    expect(screen.queryByText("Extracted fields")).toBeNull()
  })
  it("shows template version and per-locator pages, and clears the source on replace", async () => {
    const multi = { ...created, fields: { ...created.fields, seller: { value: null, page: null, status: "ambiguous", locators: [{ page: 1, anchor: "SELLER A" }, { page: 3, anchor: "SELLER B" }] } } }
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => new Response(JSON.stringify(multi), { status: 201 }))
      .mockImplementation(async () => new Response(null, { status: 204 }))
    const user = userEvent.setup()
    renderAt("/playground/?workflow=transaction-review")
    fireEvent.click(screen.getByLabelText("Paste text"))
    fireEvent.change(screen.getByLabelText("Paste source text"), { target: { value: "Confidential APS text" } })
    fireEvent.click(screen.getByRole("button", { name: "Prepare review" }))
    await screen.findByText("Extracted fields")
    expect(screen.getByText("Template: Ontario OREA Form 100 v0.1.0")).toBeTruthy()
    expect(screen.getByText(/p\.1 SELLER A; p\.3 SELLER B/)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Replace source" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard review and replace source" }))
    await screen.findByRole("heading", { name: "Source" })
    fireEvent.click(screen.getByLabelText("Paste text"))
    expect((screen.getByLabelText("Paste source text") as HTMLTextAreaElement).value).toBe("")
  })
})
