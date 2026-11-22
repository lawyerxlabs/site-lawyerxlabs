// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HiringDescriptionReviewPrototype, InterviewGuideGenerationGatePrototype, InterviewGuideReviewPrototype, OfferDraftPrototype } from "@/components/HiringPackagePrototype"
import type { ScreeningRetryResult } from "@/components/HiringPackagePrototype"

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe("fixture-only hiring package review prototypes", () => {
  it("labels prototype as synthetic-only and rejects Category 1 without approval or retry", async () => {
    const approve = vi.fn()
    const retry = vi.fn()
    render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed={false} screeningState="category-1-rejected" onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)

    expect(screen.getByRole("note").textContent).toMatch(/Synthetic data only.*Do not enter real/i)
    expect(screen.getByRole("alert").textContent).toMatch(/Rejected: Category 1 content was detected/)
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /retry screening/i })).toBeNull()
    expect(approve).not.toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })

  it("keeps Category 1 rejection dominant over an expired review", () => {
    const approve = vi.fn()
    const repost = vi.fn()
    const retry = vi.fn()
    render(<HiringDescriptionReviewPrototype draft="Synthetic rejected draft" changed={false} expired screeningState="category-1-rejected" onApprove={approve} onRepost={repost} onRetryScreening={retry} />)

    expect(screen.getByRole("alert").textContent).toMatch(/Rejected: Category 1 content was detected/)
    expect(screen.queryByRole("button", { name: /re-submit current text/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /retry screening/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull()
    expect(approve).not.toHaveBeenCalled()
    expect(repost).not.toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
  })

  it("requires confirmation for screening changes and invalidates readiness after later edits", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    render(<HiringDescriptionReviewPrototype draft="Synthetic description" previousText="Original synthetic description" changed screeningState="ready" onApprove={approve} onRepost={vi.fn()} />)
    expect(screen.getByText(/Screening changed this draft/)).toBeTruthy()
    expect(screen.getByText("Original synthetic description")).toBeTruthy()
    expect(approve).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Confirm this text" }))
    fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Edited synthetic description" } })
    expect(screen.queryByRole("button", { name: "Approve confirmed description" })).toBeNull()
    expect(screen.getByRole("alert").textContent).toMatch(/must be screened again/i)
    expect(approve).not.toHaveBeenCalled()
  })

  it("recovers an expired review only through explicit source re-submission", async () => {
    const user = userEvent.setup()
    const repost = vi.fn()
    render(<HiringDescriptionReviewPrototype draft="Synthetic" changed={false} expired onApprove={vi.fn()} onRepost={repost} />)
    expect(screen.getByRole("alert").textContent).toMatch(/expired/)
    await user.clear(screen.getByLabelText("Draft description"))
    await user.type(screen.getByLabelText("Draft description"), "Edited synthetic")
    await user.click(screen.getByRole("button", { name: "Re-submit current text" }))
    expect(repost).toHaveBeenCalledWith("Edited synthetic")
  })

  it("blocks confirmation and approval when the pre-screening text is unavailable", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed screeningState="ready" onApprove={approve} onRepost={vi.fn()} />)
    expect(screen.getByRole("alert").textContent).toMatch(/pre-screening text is unavailable/)
    expect(screen.queryByRole("button", { name: "Confirm this text" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Approve confirmed description" })).toBeNull()
    await user.click(screen.getByLabelText("Draft description"))
    expect(approve).not.toHaveBeenCalled()
  })

  it("blocks approval if the pre-screening text becomes unavailable after confirmation", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    const props = { draft: "Synthetic draft", previousText: "Prior synthetic text", changed: true, screeningState: "ready" as const, onApprove: approve, onRepost: vi.fn() }
    const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
    await user.click(screen.getByRole("button", { name: "Confirm this text" }))
    expect(screen.getByRole("button", { name: "Approve confirmed description" })).toBeTruthy()
    rerender(<HiringDescriptionReviewPrototype {...props} previousText={undefined} />)
    expect(screen.queryByRole("button", { name: "Approve confirmed description" })).toBeNull()
    expect(screen.getByRole("alert").textContent).toMatch(/pre-screening text is unavailable/)
    expect(approve).not.toHaveBeenCalled()
  })

  it.each(["unavailable", "incomplete"] as const)("stops approval and offers retry when screening is %s", async (screeningState) => {
    const user = userEvent.setup()
    const approve = vi.fn()
    const retry = vi.fn()
    render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed={false} screeningState={screeningState} onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)
    expect(screen.getByRole("alert").textContent).toMatch(/Approval and generation are paused/)
    expect(screen.queryByRole("button", { name: "Approve description" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Retry screening" }))
    expect(retry).toHaveBeenCalledWith("Synthetic draft")
    expect(approve).not.toHaveBeenCalled()
  })

  it("invalidates screening when ready text is edited and approves only the screened retry result", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    const retry = vi.fn(async (text: string) => ({ accepted: true as const, text: `${text} screened`, changed: true }))
    render(<HiringDescriptionReviewPrototype draft="Screened synthetic draft" changed={false} screeningState="ready" onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)

    const draft = screen.getByLabelText("Draft description")
    fireEvent.change(draft, { target: { value: "Edited synthetic draft" } })

    expect(screen.getByRole("alert").textContent).toMatch(/must be screened again/i)
    expect(screen.queryByRole("button", { name: "Approve description" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Screen edited draft" }))
    expect(retry).toHaveBeenCalledWith("Edited synthetic draft")
    expect(screen.getByLabelText("Draft description")).toHaveValue("Edited synthetic draft screened")
    await user.click(screen.getByRole("button", { name: "Confirm this text" }))
    await user.click(screen.getByRole("button", { name: "Approve confirmed description" }))
    expect(approve).toHaveBeenCalledWith("Edited synthetic draft screened")
    expect(approve).not.toHaveBeenCalledWith("Edited synthetic draft")
  })

  it("keeps the focused textarea mounted while an edit invalidates screening", async () => {
    const user = userEvent.setup()
    render(<HiringDescriptionReviewPrototype draft="Screened synthetic draft" changed={false} screeningState="ready" onApprove={vi.fn()} onRepost={vi.fn()} onRetryScreening={vi.fn()} />)
    const input = screen.getByLabelText("Draft description")
    input.focus()

    await user.type(input, " edited")

    expect(screen.getByLabelText("Draft description")).toBe(input)
    expect(input).toHaveFocus()
    expect(input).toHaveValue("Screened synthetic draft edited")
  })

  it("keeps approval blocked and preserves text when re-screening fails", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    const retry = vi.fn(async () => { throw new Error("screening unavailable") })
    render(<HiringDescriptionReviewPrototype draft="Screened synthetic draft" changed={false} screeningState="ready" onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)
    const draft = screen.getByLabelText("Draft description")
    fireEvent.change(draft, { target: { value: "Preserved edited draft" } })
    await user.click(screen.getByRole("button", { name: "Screen edited draft" }))
    expect(await screen.findByText(/Screening retry failed/)).toBeTruthy()
    expect(screen.getByLabelText("Draft description")).toHaveValue("Preserved edited draft")
    expect(screen.queryByRole("button", { name: "Approve description" })).toBeNull()
    expect(approve).not.toHaveBeenCalled()
  })

  it("defaults omitted screening status to unavailable and retries the preserved edited draft", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    const retry = vi.fn(async () => ({ accepted: true as const, text: "Edited synthetic draft", changed: false }))
    render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed={false} onApprove={approve} onRepost={vi.fn()} onRetryScreening={retry} />)
    expect(screen.getByRole("alert").textContent).toMatch(/Screening is unavailable/)
    expect(screen.queryByRole("button", { name: "Approve description" })).toBeNull()
    await user.clear(screen.getByLabelText("Draft description"))
    await user.type(screen.getByLabelText("Draft description"), "Edited synthetic draft")
    expect(screen.getByLabelText("Draft description")).toHaveValue("Edited synthetic draft")
    await user.click(screen.getByRole("button", { name: "Retry screening" }))
    expect(retry).toHaveBeenCalledWith("Edited synthetic draft")
    expect(approve).not.toHaveBeenCalled()
  })

  it("shows and approves the new screened draft after retry completes", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    const props = { draft: "Original synthetic draft", changed: false, screeningState: "unavailable" as const, onApprove: approve, onRepost: vi.fn() }
    const { rerender } = render(<HiringDescriptionReviewPrototype {...props} screeningState="incomplete" />)
    await user.clear(screen.getByLabelText("Draft description"))
    await user.type(screen.getByLabelText("Draft description"), "Edited synthetic draft")

    rerender(<HiringDescriptionReviewPrototype {...props} draft="Screened synthetic draft" screeningState="ready" />)

    expect(screen.getByLabelText("Draft description")).toHaveValue("Screened synthetic draft")
    await user.click(screen.getByRole("button", { name: "Approve description" }))
    expect(approve).toHaveBeenCalledWith("Screened synthetic draft")
  })

  it("accepts an unchanged screened result and prevents edits from racing a pending retry", async () => {
    const user = userEvent.setup()
    const approve = vi.fn()
    let finishRetry!: (result: ScreeningRetryResult) => void
    const retry = vi.fn(() => new Promise<ScreeningRetryResult>((resolve) => { finishRetry = resolve }))
    const props = { draft: "Synthetic draft", changed: false, screeningState: "unavailable" as const, onApprove: approve, onRepost: vi.fn(), onRetryScreening: retry }
    const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
    await user.clear(screen.getByLabelText("Draft description"))
    await user.type(screen.getByLabelText("Draft description"), "Sensitive synthetic phrase")
    await user.click(screen.getByRole("button", { name: "Retry screening" }))

    expect(retry).toHaveBeenCalledWith("Sensitive synthetic phrase")
    expect(screen.getByLabelText("Draft description")).toBeDisabled()
    rerender(<HiringDescriptionReviewPrototype {...props} screeningState="ready" />)
    expect(screen.getByLabelText("Draft description")).toHaveValue("Synthetic draft")
    finishRetry({ accepted: true, text: "Synthetic draft", changed: false })
    await screen.findByRole("button", { name: "Approve description" })
    await user.click(screen.getByRole("button", { name: "Approve description" }))
    expect(approve).toHaveBeenCalledWith("Synthetic draft")
    expect(approve).not.toHaveBeenCalledWith("Sensitive synthetic phrase")
  })

  it("clears retry transformation metadata when a new screened draft arrives", async () => {
    const user = userEvent.setup()
    const props = { draft: "Original synthetic draft", previousText: "Source synthetic draft", changed: false, screeningState: "unavailable" as const, onApprove: vi.fn(), onRepost: vi.fn(), onRetryScreening: vi.fn(async () => ({ accepted: true as const, text: "Original synthetic draft", changed: false })) }
    const { rerender } = render(<HiringDescriptionReviewPrototype {...props} />)
    await user.click(screen.getByRole("button", { name: "Retry screening" }))
    rerender(<HiringDescriptionReviewPrototype {...props} screeningState="ready" />)
    await screen.findByRole("button", { name: "Approve description" })
    expect(screen.getByRole("button", { name: "Approve description" })).toBeTruthy()

    rerender(<HiringDescriptionReviewPrototype {...props} draft="New parent-screened draft" changed screeningState="ready" />)

    expect(screen.getByRole("button", { name: "Confirm this text" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Approve description" })).toBeNull()
  })

  it("explains retry failure and preserves the draft for another attempt", async () => {
    const retry = vi.fn().mockRejectedValue(new Error("synthetic screening failure"))
    render(<HiringDescriptionReviewPrototype draft="Synthetic draft" changed={false} screeningState="unavailable" onApprove={vi.fn()} onRepost={vi.fn()} onRetryScreening={retry} />)
    fireEvent.change(screen.getByLabelText("Draft description"), { target: { value: "Preserved edited draft" } })
    fireEvent.click(screen.getByRole("button", { name: "Retry screening" }))
    expect(await screen.findByText("Screening retry failed. Your draft is still here; try again.")).toBeTruthy()
    expect(screen.getByLabelText("Draft description")).toHaveValue("Preserved edited draft")
    expect(screen.getByRole("button", { name: "Retry screening" })).toBeEnabled()
    expect(retry).toHaveBeenCalledWith("Preserved edited draft")
  })

  it("links each interview question to a requirement and evidence in the approved version", () => {
    render(<InterviewGuideReviewPrototype versionId="synthetic-v1" questions={[{ theme: "Scheduling", question: "How do you coordinate shifts?", requirementId: "req-1", requirement: "Coordinate team schedules", evidence: "Coordinate team schedules." }]} />)
    expect(screen.getByText(/Draft for human review/).textContent).toContain("synthetic-v1")
    expect(screen.getByText(/Evidence from approved description/).textContent).toContain("Coordinate team schedules.")
    expect(screen.getByText("Requirement req-1: Coordinate team schedules")).toBeTruthy()
    expect(screen.getByText(/Fixture content is unverified/)).toBeTruthy()
  })

  it.each(["unavailable", "incomplete"] as const)("blocks interview-guide generation when evidence is %s", async (evidenceState) => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const generate = vi.fn()
    render(<InterviewGuideGenerationGatePrototype evidenceState={evidenceState} onRetryEvidence={retry} onGenerate={generate} />)
    expect(screen.getByRole("alert").textContent).toMatch(/generation is paused/)
    expect(screen.queryByRole("button", { name: "Generate interview guide" })).toBeNull()
    await user.click(screen.getByRole("button", { name: "Retry evidence check" }))
    expect(retry).toHaveBeenCalledOnce()
    expect(generate).not.toHaveBeenCalled()
  })

  it("keeps candidate identity and offer terms client-side, preserving placeholders and selected pay range", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
    expect(screen.getByRole("link", { name: "Go to offer draft preview" }).getAttribute("href")).toBe("#offer-draft-preview")
    expect((screen.getByLabelText("Offer draft wording") as HTMLTextAreaElement).value).toContain("{{candidate}}")
    expect(document.getElementById("offer-draft-preview")?.textContent).toContain("[Candidate name]")
    expect(screen.getByText("Draft placeholder wording. Human review required before use.")).toBeTruthy()
    await user.type(screen.getByLabelText("Candidate name"), "Synthetic Candidate")
    await user.type(screen.getByLabelText("Start date"), "2026-12-01")
    await user.type(screen.getByLabelText("Additional terms (optional)"), "Synthetic start date")
    expect(screen.getByText(/Synthetic Candidate/ , { selector: "pre" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull()
    expect(screen.getByText(/not sent to a server/)).toBeTruthy()
    rerender(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$90,000–$100,000" }} />)
    expect(screen.getByText("Selected pay range: $90,000–$100,000")).toBeTruthy()
    expect(screen.getByText(/Synthetic Candidate.*Synthetic Analyst.*\$90,000–\$100,000/s, { selector: "pre" })).toBeTruthy()
  })

  it("ships generic draft wording with an exact review warning and no legal, acceptance, termination or send content", () => {
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
    expect(screen.getByText("Draft placeholder wording. Human review required before use.")).toBeTruthy()
    const body = (screen.getByLabelText("Offer draft wording") as HTMLTextAreaElement).value
    for (const token of ["{{candidate}}", "{{role}}", "{{pay_range}}", "{{start_date}}", "{{terms}}"]) expect(body).toContain(token)
    expect(body).not.toMatch(/law|statut|jurisdiction|accept|deadline|terminat|enforce|sign|send|legal/i)
    expect(screen.queryByRole("button", { name: /send|publish|share/i })).toBeNull()
  })

  it("edits offer body client-side and renders the substituted preview from the local draft", async () => {
    const user = userEvent.setup()
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
    const body = screen.getByLabelText("Offer draft wording") as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: "Edited {{role}} for {{candidate}}" } })
    await user.type(screen.getByLabelText("Candidate name"), "Synthetic Candidate")
    expect(body.value).toBe("Edited {{role}} for {{candidate}}")
    expect(document.getElementById("offer-draft-preview")?.textContent).toBe("Edited Synthetic Analyst for Synthetic Candidate")
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull()
  })

  it("renders approved role and pay as read-only context, not editable inputs", () => {
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
    expect(screen.getByText("Approved role: Synthetic Analyst")).toBeTruthy()
    expect(screen.getByText("Selected pay range: $82,000–$94,000")).toBeTruthy()
    expect(screen.queryByLabelText("Role")).toBeNull()
    expect(screen.queryByDisplayValue("Synthetic Analyst")).toBeNull()
    expect(document.getElementById("offer-draft-preview")?.textContent).toContain("position of Synthetic Analyst at a pay range of $82,000–$94,000")
  })

  it("inserts offer values literally without interpreting replacement tokens", async () => {
    const user = userEvent.setup()
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
    fireEvent.change(screen.getByLabelText("Offer draft wording"), { target: { value: "{{candidate}} | {{terms}}" } })
    fireEvent.change(screen.getByLabelText("Candidate name"), { target: { value: "$$Candidate $& {{terms}}" } })
    fireEvent.change(screen.getByLabelText("Additional terms (optional)"), { target: { value: "Terms $& {{candidate}}" } })
    expect(document.getElementById("offer-draft-preview")?.textContent).toContain("$$Candidate $& {{terms}} | Terms $& {{candidate}}")
  })

  it("reports a browser-session local draft without a leave-page guard and keeps data out of localStorage", async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
    await user.type(screen.getByLabelText("Candidate name"), "Synthetic Candidate")
    expect(screen.getByRole("status").textContent).toMatch(/saved in this browser session only/i)
    expect(screen.getByRole("status").textContent).not.toMatch(/unsaved|lost/i)

    const unload = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)

    const link = document.createElement("a")
    link.href = "/another-page"
    document.body.append(link)
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
    link.dispatchEvent(click)
    expect(confirm).not.toHaveBeenCalled()
    expect(click.defaultPrevented).toBe(false)
    expect(localStorage.length).toBe(0)
    link.remove()
    confirm.mockRestore()
  })

  it("does not claim the draft is saved when browser storage write fails", async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota") })
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
    await user.type(screen.getByLabelText("Candidate name"), "Synthetic Candidate")
    expect(screen.getByRole("status").textContent).toMatch(/not saved in browser storage|on this page only/i)
    expect(screen.getByRole("status").textContent).not.toMatch(/saved in this browser session only\./)
    expect(screen.getByLabelText("Candidate name")).toHaveValue("Synthetic Candidate")
    setItem.mockRestore()
  })

  it("never shows or writes prior-package fields when packageId changes while mounted", async () => {
    const user = userEvent.setup()
    const { rerender } = render(<OfferDraftPrototype approved={{ packageId: "pkg-a", versionId: "v1", role: "Analyst A", selectedPayRange: "$50,000" }} />)
    fireEvent.change(screen.getByLabelText("Offer draft wording"), { target: { value: "Old wording {{candidate}}" } })
    await user.type(screen.getByLabelText("Candidate name"), "Old Candidate")
    await user.type(screen.getByLabelText("Additional terms (optional)"), "Old terms")
    await user.type(screen.getByLabelText("Start date"), "2026-12-01")
    rerender(<OfferDraftPrototype approved={{ packageId: "pkg-b", versionId: "v1", role: "Analyst B", selectedPayRange: "$70,000" }} />)

    expect(document.body.textContent).not.toMatch(/Old Candidate|Old terms|Old wording/)
    expect(screen.getByLabelText("Candidate name")).toHaveValue("")
    expect(screen.getByLabelText("Additional terms (optional)")).toHaveValue("")
    expect(screen.getByLabelText("Start date")).toHaveValue("")
    expect(screen.queryByRole("alert")).toBeNull()
    expect(sessionStorage.getItem("hiring-package-offer-draft:pkg-b")).toBeNull()
    expect(JSON.parse(sessionStorage.getItem("hiring-package-offer-draft:pkg-a") ?? "null")?.candidate).toBe("Old Candidate")
  })

  it("never shows or writes prior-version fields when versionId changes while mounted, and does not overwrite the stored record", async () => {
    const user = userEvent.setup()
    const key = "hiring-package-offer-draft:pkg-synthetic"
    const { rerender } = render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000" }} />)
    await user.type(screen.getByLabelText("Candidate name"), "Old Candidate")
    await user.type(screen.getByLabelText("Additional terms (optional)"), "Old terms")
    const v1Record = sessionStorage.getItem(key)
    expect(v1Record).not.toBeNull()
    rerender(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v2", role: "Synthetic Analyst", selectedPayRange: "$82,000" }} />)

    expect(document.body.textContent).not.toMatch(/Old Candidate|Old terms/)
    expect(screen.getByLabelText("Candidate name")).toHaveValue("")
    expect(screen.getByLabelText("Additional terms (optional)")).toHaveValue("")
    expect(screen.getByRole("alert").textContent).toMatch(/prior approved version.*not restored/i)
    expect(sessionStorage.getItem(key)).toBe(v1Record)
    expect(JSON.parse(sessionStorage.getItem(key) ?? "null")?.versionId).toBe("v1")
  })

  it("rejects a stored record with extra keys: no restore, no alert, no write on mount", () => {
    const key = "hiring-package-offer-draft:pkg-synthetic"
    const record = { versionId: "v1", wording: "Synthetic {{candidate}}", candidate: "Synthetic Candidate", startDate: "2026-12-01", terms: "", extra: "SENSITIVE-EXTRA" }
    sessionStorage.setItem(key, JSON.stringify(record))
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000" }} />)

    expect(screen.getByLabelText("Candidate name")).toHaveValue("")
    expect(screen.getByLabelText("Start date")).toHaveValue("")
    expect(document.body.textContent).not.toMatch(/Synthetic Candidate|SENSITIVE-EXTRA/)
    expect(screen.queryByRole("alert")).toBeNull()
    expect(setItem).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(key)).toBe(JSON.stringify(record))
    setItem.mockRestore()
  })

  it("keeps the stale warning and shows an accessible error when discard storage removal fails", async () => {
    const user = userEvent.setup()
    const key = "hiring-package-offer-draft:pkg-synthetic"
    sessionStorage.setItem(key, JSON.stringify({ versionId: "v0", wording: "Prior {{candidate}}", candidate: "Prior Candidate", startDate: "2026-11-01", terms: "" }))
    const removeItem = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied") })
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000" }} />)
    await user.click(screen.getByRole("button", { name: "Discard prior-version draft" }))

    expect(screen.getByRole("alert").textContent).toMatch(/prior approved version.*not restored/i)
    expect(screen.getByRole("alert").textContent).toMatch(/Could not discard.*still stored/i)
    expect(screen.getByRole("button", { name: "Discard prior-version draft" })).toBeTruthy()
    expect(sessionStorage.getItem(key)).toContain("Prior Candidate")
    removeItem.mockRestore()
  })

  it("restores the same-version offer draft from sessionStorage after remount, storing only draft fields", async () => {
    const user = userEvent.setup()
    const approved = { packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }
    const { unmount } = render(<OfferDraftPrototype approved={approved} />)
    fireEvent.change(screen.getByLabelText("Offer draft wording"), { target: { value: "Edited {{candidate}}" } })
    await user.type(screen.getByLabelText("Candidate name"), "Synthetic Candidate")
    await user.type(screen.getByLabelText("Additional terms (optional)"), "Synthetic terms")
    await user.type(screen.getByLabelText("Start date"), "2026-12-01")
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-12-01")
    expect(JSON.parse(sessionStorage.getItem("hiring-package-offer-draft:pkg-synthetic") ?? "null")).toEqual({
      versionId: "v1", wording: "Edited {{candidate}}", candidate: "Synthetic Candidate", startDate: "2026-12-01", terms: "Synthetic terms",
    })
    unmount()

    render(<OfferDraftPrototype approved={approved} />)
    expect(screen.getByLabelText("Offer draft wording")).toHaveValue("Edited {{candidate}}")
    expect(screen.getByLabelText("Candidate name")).toHaveValue("Synthetic Candidate")
    expect(screen.getByLabelText("Additional terms (optional)")).toHaveValue("Synthetic terms")
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-12-01")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("never restores a prior-version draft, keeps it stored until explicit discard, and starts clean", async () => {
    const user = userEvent.setup()
    const key = "hiring-package-offer-draft:pkg-synthetic"
    const prior = JSON.stringify({ versionId: "v0", wording: "Prior wording {{candidate}}", candidate: "Prior Candidate", startDate: "2026-11-01", terms: "Prior terms" })
    sessionStorage.setItem(key, prior)
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)

    expect(sessionStorage.getItem(key)).toBe(prior)
    expect(screen.getByLabelText("Candidate name")).toHaveValue("")
    expect(screen.getByLabelText("Additional terms (optional)")).toHaveValue("")
    expect(screen.getByLabelText("Start date")).toHaveValue("")
    expect((screen.getByLabelText("Offer draft wording") as HTMLTextAreaElement).value).toContain("{{candidate}}")
    expect(document.body.textContent).not.toMatch(/Prior Candidate|Prior terms|Prior wording/)
    expect(screen.getByRole("alert").textContent).toMatch(/prior approved version.*not restored/i)

    await user.click(screen.getByRole("button", { name: "Discard prior-version draft" }))
    expect(sessionStorage.getItem(key)).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.getByLabelText("Candidate name")).toHaveValue("")
    await user.type(screen.getByLabelText("Candidate name"), "Synthetic Candidate")
    expect(JSON.parse(sessionStorage.getItem(key) ?? "null")?.versionId).toBe("v1")
  })

  it("does not offer a copy or transfer of the prior-version draft", () => {
    sessionStorage.setItem("hiring-package-offer-draft:pkg-synthetic", JSON.stringify({ versionId: "v0", wording: "w", candidate: "c", startDate: "", terms: "" }))
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst" }} />)
    expect(screen.queryByRole("button", { name: /copy|transfer|restore|use prior/i })).toBeNull()
  })

  it("starts clean without crashing on malformed or wrong-shape sessionStorage records", () => {
    const key = "hiring-package-offer-draft:pkg-synthetic"
    for (const raw of ["{not json", JSON.stringify({ versionId: "v1", candidate: 5 }), "null", "[]"]) {
      sessionStorage.setItem(key, raw)
      const { unmount } = render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst", selectedPayRange: "$82,000–$94,000" }} />)
      expect(screen.getByLabelText("Candidate name")).toHaveValue("")
      expect(screen.queryByRole("alert")).toBeNull()
      unmount()
    }
  })

  it("explains missing pay-range recovery and how optional terms placeholders must be resolved", () => {
    render(<OfferDraftPrototype approved={{ packageId: "pkg-synthetic", versionId: "v1", role: "Synthetic Analyst" }} />)
    expect(screen.getByRole("status").textContent).toMatch(/Incomplete.*select a pay range in the compensation step/)
    expect(screen.getByText(/Additional terms \(optional\)/)).toBeTruthy()
    expect(screen.getByText(/If no additional terms apply, remove the offer-terms placeholder/)).toBeTruthy()
    expect(screen.getByRole("link", { name: "Go to offer draft preview" }).getAttribute("href")).toBe("#offer-draft-preview")
  })
})
