// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FileIntake } from "@/components/FileIntake"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const samples = [{ label: "Synthetic intake", url: "/tests/fixtures/synthetic-intake.docx", filename: "synthetic-intake.docx" }]

describe("FileIntake sample document", () => {
  it("loads the first-party synthetic DOCX through existing file selection", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    let turnstileOptions: { callback?: (token: string) => void } | undefined
    const widget = { render: vi.fn((_element, options) => { turnstileOptions = options; return "widget-1" }), remove: vi.fn() } as unknown as Window["turnstile"]
    Object.defineProperty(window, "turnstile", { configurable: true, value: widget })
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04])))
    render(<FileIntake busy={false} onSubmit={onSubmit} samples={[{ label: "Synthetic intake", url: "/tests/fixtures/synthetic-intake.docx", filename: "synthetic-intake.docx" }]} />)
    turnstileOptions?.callback?.("test-token")

    expect(screen.queryByText(/coming soon/i)).toBeNull()
    await openSample(user)

    expect(fetchSpy).toHaveBeenCalledWith("/tests/fixtures/synthetic-intake.docx", expect.anything())
    expect(await screen.findByText("synthetic-intake.docx")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Alias Document" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "synthetic-intake.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "test-token")
  })

  it("compact mode shows the sample tab", () => {
    render(<FileIntake busy={false} onSubmit={vi.fn()} samples={samples} compact />)

    expect(screen.getByRole("tab", { name: "Try a sample" })).toBeTruthy()
  })
})

describe("FileIntake verification callbacks", () => {
  it("reports a failure when the widget errors", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    let options: { onerror?: (message: unknown) => void } | undefined
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: vi.fn((_element, nextOptions) => { options = nextOptions; return "widget-1" }), remove: vi.fn() },
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([80, 75, 3, 4])))
    render(<FileIntake busy={false} onSubmit={onSubmit} />)

    options?.onerror?.("verification failed")

    expect(await screen.findByText(/Human verification failed/)).toBeTruthy()
  })

  it("clears the token when the widget expires", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    let options: { "expired-callback"?: () => void } | undefined
    Object.defineProperty(window, "turnstile", {
      configurable: true,
      value: { render: vi.fn((_element, nextOptions) => { options = nextOptions; return "widget-1" }), remove: vi.fn() },
    })
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([80, 75, 3, 4])))
    render(<FileIntake busy={false} onSubmit={onSubmit} />)

    options?.["expired-callback"]?.()

    expect(await screen.findByText(/Verification expired/)).toBeTruthy()
  })
})

describe("FileIntake compact presentation", () => {
  it("shows one-line empty prompt with a small upload icon and no in-form review note when compact", () => {
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} compact />)
    expect(screen.getByText("Drop PDF or DOCX here, or choose a file")).toBeTruthy()
    expect(container.querySelector(".upload-icon")).toBeTruthy()
    expect(container.querySelector(".intake-form.is-compact")).toBeTruthy()
    expect(container.querySelector(".review-note")).toBeNull()
  })

  it("keeps the default prompt and icon when not compact", () => {
    const { container } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    expect(screen.getByText("Drop your document here")).toBeTruthy()
    expect(container.querySelector(".upload-icon")).toBeTruthy()
    expect(container.querySelector(".intake-form.is-compact")).toBeNull()
  })
})

type TurnstileStub = { render: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> }
function stubTurnstile() {
  const options: { callback?: (token: string) => void } = {}
  const widget: TurnstileStub = {
    render: vi.fn((_element, next) => { Object.assign(options, next); return "widget-1" }),
    remove: vi.fn(),
    reset: vi.fn(),
  }
  Object.defineProperty(window, "turnstile", { configurable: true, value: widget })
  return { widget, options }
}
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const pdf = () => new File(["%PDF-1.4\n"], "contract.pdf", { type: "application/pdf" })
const docx = () => new File(["PK\u0003\u0004rest"], "memo.docx", { type: DOCX_TYPE })
const pick = (container: HTMLElement, file: File) => fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } })

// Sample documents live behind the "Try a sample" tab; open it, then pick the sample by label.
async function openSample(user: ReturnType<typeof userEvent.setup>, label = "Synthetic intake") {
  await user.click(screen.getByRole("tab", { name: "Try a sample" }))
  await user.click(screen.getByRole("button", { name: label }))
}

describe("FileIntake validation and busy handling", () => {
  it("rejects a file picked while busy and disables the file input", async () => {
    const { container, rerender } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    pick(container, pdf())
    expect(await screen.findByText("contract.pdf")).toBeTruthy()
    rerender(<FileIntake busy onSubmit={vi.fn()} />)
    expect((container.querySelector("input[type=file]") as HTMLInputElement).disabled).toBe(true)
    pick(container, docx())
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText("memo.docx")).toBeNull()
    expect(screen.getByText("contract.pdf")).toBeTruthy()
  })

  it("ignores a drop while busy", () => {
    const { container } = render(<FileIntake busy onSubmit={vi.fn()} />)
    fireEvent.drop(container.querySelector(".dropzone")!, { dataTransfer: { files: [pdf()] } })
    expect(screen.queryByText("contract.pdf")).toBeNull()
  })

  it("requires a fresh Turnstile token after each submit", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { widget, options } = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} />)
    options.callback?.("tok-1")
    pick(container, pdf())
    await user.click(screen.getByRole("button", { name: "Alias Document" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "contract.pdf" }), "tok-1")
    expect(widget.reset).toHaveBeenCalledWith("widget-1")
    expect(screen.getByRole("button", { name: "Alias Document" }).hasAttribute("disabled")).toBe(true)
    await user.click(screen.getByRole("button", { name: "Alias Document" }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    options.callback?.("tok-2")
    await user.click(screen.getByRole("button", { name: "Alias Document" }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.anything(), "tok-2")
  })
})

describe("FileIntake file validation", () => {
  it("accepts a valid PDF and a valid DOCX picked directly", async () => {
    const onSubmit = vi.fn()
    stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} />)
    pick(container, pdf())
    expect(await screen.findByText("contract.pdf")).toBeTruthy()
    pick(container, docx())
    expect(await screen.findByText("memo.docx")).toBeTruthy()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it.each([
    ["an unsupported extension", new File(["hi"], "notes.txt", { type: "text/plain" }), "Choose a PDF or DOCX file."],
    ["an empty file", new File([], "empty.pdf", { type: "application/pdf" }), "File cannot be empty."],
    ["a PDF name with non-PDF bytes", new File(["plain text"], "fake.pdf", { type: "application/pdf" }), "That file is not a valid PDF."],
    ["a DOCX name with a PDF MIME", new File(["PK\u0003\u0004"], "fake.docx", { type: "application/pdf" }), "That file is not a valid DOCX."],
  ])("rejects %s without forwarding to onSubmit", async (_label, bad, message) => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { options } = stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} />)
    options.callback?.("tok")
    pick(container, pdf())
    expect(await screen.findByText("contract.pdf")).toBeTruthy()
    pick(container, bad)
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText(message)).toBeTruthy()
    expect(screen.queryByText("contract.pdf")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Alias Document" }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("rejects a file over 10 MiB", async () => {
    const onSubmit = vi.fn()
    stubTurnstile()
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" })
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} />)
    pick(container, big)
    expect(await screen.findByText("File is larger than 10 MB. Choose a smaller PDF or DOCX.")).toBeTruthy()
    expect(screen.queryByText("big.pdf")).toBeNull()
  })

  it("accepts a file exactly 10 MiB", async () => {
    stubTurnstile()
    const bytes = new Uint8Array(10 * 1024 * 1024)
    bytes.set([0x25, 0x50, 0x44, 0x46])
    const edge = new File([bytes], "edge.pdf", { type: "application/pdf" })
    const { container } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    pick(container, edge)
    expect(await screen.findByText("edge.pdf")).toBeTruthy()
  })
})

describe("FileIntake sample fetch", () => {
  it("rejects a non-ok sample response with an error", async () => {
    stubTurnstile()
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }))
    const user = userEvent.setup()
    render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    await openSample(user)
    expect(await screen.findByText("Could not load sample document.")).toBeTruthy()
    expect(screen.queryByText("synthetic-intake.docx")).toBeNull()
  })

  it("aborts the in-flight sample request on unmount without showing an error", async () => {
    stubTurnstile()
    let signal: AbortSignal | undefined
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => { signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))) })
    })
    const user = userEvent.setup()
    const { unmount } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    await openSample(user)
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })

  it("aborts the in-flight sample request when a user picks a file instead", async () => {
    const { widget } = stubTurnstile()
    let signal: AbortSignal | undefined
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined
      return new Promise((_resolve, reject) => { signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))) })
    })
    const user = userEvent.setup()
    const { container } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    await openSample(user)
    await user.click(screen.getByRole("tab", { name: "Upload document" }))
    pick(container, pdf())
    expect(signal?.aborted).toBe(true)
    expect(await screen.findByText("contract.pdf")).toBeTruthy()
    expect(screen.queryByText("Could not load sample document.")).toBeNull()
    expect(widget.render).toHaveBeenCalled()
  })
})

describe("FileIntake lifecycle races", () => {
  it("drops a prior ready file synchronously when replacement validation is pending", async () => {
    const { options } = stubTurnstile()
    const onFileChange = vi.fn()
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} onFileChange={onFileChange} />)
    options.callback?.("tok")
    pick(container, pdf())
    expect(await screen.findByText("contract.pdf")).toBeTruthy()
    pick(container, new File(["PK\u0003\u0004"], "bad.pdf", { type: "application/pdf" }))
    expect(onFileChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole("button", { name: "Alias Document" })).toBeDisabled()
    expect(await screen.findByText("That file is not a valid PDF.")).toBeTruthy()
    expect(screen.queryByText("contract.pdf")).toBeNull()
  })

  it.each([
    ["a local pick", (c: HTMLElement) => pick(c, pdf()), "contract.pdf"],
    ["a drop", (c: HTMLElement) => fireEvent.drop(c.querySelector(".dropzone")!, { dataTransfer: { files: [pdf()] } }), "contract.pdf"],
    ["a clear", (c: HTMLElement) => fireEvent.change(c.querySelector("input[type=file]")!, { target: { files: [] } }), null],
  ])("%s aborts the in-flight sample fetch and a late valid sample cannot change state", async (_label, perform, expected) => {
    stubTurnstile()
    let signal: AbortSignal | undefined
    let resolveFetch: (r: Response) => void = () => {}
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined
      return new Promise((r) => { resolveFetch = r })
    })
    const user = userEvent.setup()
    const { container } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    await openSample(user)
    expect(signal?.aborted).toBe(false)
    await user.click(screen.getByRole("tab", { name: "Upload document" }))
    perform(container)
    expect(signal?.aborted).toBe(true)
    resolveFetch(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04])))
    await new Promise((r) => setTimeout(r, 0))
    if (expected) expect(await screen.findByText(expected)).toBeTruthy()
    expect(screen.queryByText("synthetic-intake.docx")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByText("Could not load sample document.")).toBeNull()
  })

  it("rejects pick, drop and sample while busy", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const { container, rerender } = render(<FileIntake samples={samples} busy={false} onSubmit={onSubmit} />)
    stubTurnstile()
    rerender(<FileIntake samples={samples} busy onSubmit={onSubmit} />)
    expect(screen.getByRole("tab", { name: "Try a sample" })).toBeDisabled()
    fireEvent.drop(container.querySelector(".dropzone")!, { dataTransfer: { files: [pdf()] } })
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [pdf()] } })
    await user.click(screen.getByRole("tab", { name: "Try a sample" }))
    expect(screen.queryByRole("button", { name: "Synthetic intake" })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(screen.queryByText("contract.pdf")).toBeNull()
  })

  it("still submits the captured token and file when turnstile reset throws", async () => {
    const { widget, options } = stubTurnstile()
    widget.reset.mockImplementation(() => { throw new Error("widget gone") })
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<FileIntake busy={false} onSubmit={onSubmit} />)
    options.callback?.("tok-x")
    pick(container, pdf())
    await user.click(await screen.findByRole("button", { name: "Alias Document" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "contract.pdf" }), "tok-x")
  })

  it.each([
    ["PK\u0005\u0006 empty zip", new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0]), "application/zip", true],
    ["PK\u0007\u0008 spanned zip", new Uint8Array([0x50, 0x4b, 0x07, 0x08, 0, 0]), "application/x-zip-compressed", true],
    ["zip MIME alias on PK\\x03\\x04", new Uint8Array([0x50, 0x4b, 0x03, 0x04]), "application/zip", true],
    ["non-zip bytes under DOCX name", new Uint8Array([0x50, 0x4b, 0x01, 0x02]), DOCX_TYPE, false],
  ])("DOCX validation: %s", async (_label, bytes, type, ok) => {
    stubTurnstile()
    const { container } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    pick(container, new File([bytes], "memo.docx", { type }))
    if (ok) expect(await screen.findByText("memo.docx")).toBeTruthy()
    else expect(await screen.findByText("That file is not a valid DOCX.")).toBeTruthy()
  })

  it("replaces a Turnstile script tag that failed, then initializes the widget on remount", async () => {
    delete (window as Window & { turnstile?: unknown }).turnstile
    const SRC = 'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    const first = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    const failed = document.querySelector(SRC)!
    failed.dispatchEvent(new Event("error"))
    expect(await screen.findByText("Human verification is not configured. Contact support — uploads are disabled.")).toBeTruthy()
    first.unmount()

    render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    const tags = document.querySelectorAll(SRC)
    expect(tags.length).toBe(1)
    expect(tags[0]).not.toBe(failed)
    expect(failed.isConnected).toBe(false)
    expect(screen.queryByText("Human verification is not configured. Contact support — uploads are disabled.")).toBeNull()

    const { widget } = stubTurnstile()
    tags[0].dispatchEvent(new Event("load"))
    expect(widget.render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ action: "tool_parse_upload" }))
    tags[0].remove()
  })
})


describe("FileIntake deferred validation", () => {
  const deferredSlice = (file: File) => {
    let release: (b: ArrayBuffer) => void = () => {}
    vi.spyOn(file, "slice").mockReturnValue({ arrayBuffer: () => new Promise<ArrayBuffer>((r) => { release = r }) } as unknown as Blob)
    return (bytes: number[]) => release(new Uint8Array(bytes).buffer)
  }

  it("lets only the second file win when a slow first validation resolves after a fast second pick", async () => {
    stubTurnstile()
    const slow = new File(["%PDF-1.4\n"], "slow.pdf", { type: "application/pdf" })
    const releaseSlow = deferredSlice(slow)
    const { container } = render(<FileIntake samples={samples} busy={false} onSubmit={vi.fn()} />)
    pick(container, slow)
    pick(container, pdf())
    expect(await screen.findByText("contract.pdf")).toBeTruthy()
    releaseSlow([0x25, 0x50, 0x44, 0x46])
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByText("contract.pdf")).toBeTruthy()
    expect(screen.queryByText("slow.pdf")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("never forwards a file whose validation resolves after unmount", async () => {
    stubTurnstile()
    const late = new File(["%PDF-1.4\n"], "late.pdf", { type: "application/pdf" })
    const releaseLate = deferredSlice(late)
    const onFileChange = vi.fn()
    const { container, unmount } = render(<FileIntake busy={false} onSubmit={vi.fn()} onFileChange={onFileChange} />)
    pick(container, late)
    unmount()
    releaseLate([0x25, 0x50, 0x44, 0x46])
    await new Promise((r) => setTimeout(r, 0))
    expect(onFileChange.mock.calls.every(([f]) => f === null)).toBe(true)
  })
})
describe("FileIntake source tabs", () => {
  const twoSamples = [
    { label: "Synthetic intake", url: "/tests/fixtures/synthetic-intake.docx", filename: "synthetic-intake.docx" },
    { label: "Synthetic APS", url: "/tests/fixtures/synthetic-aps.docx", filename: "synthetic-aps.docx" },
  ]
  const docxBytes = () => new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))

  it("renders no tabs when there are no samples", () => {
    stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} />)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(container.querySelector(".dropzone")).toBeTruthy()
  })

  it("shows upload and sample tabs with the upload panel active by default", () => {
    stubTurnstile()
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} samples={twoSamples} />)
    expect(screen.getByRole("tab", { name: "Upload document" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tab", { name: "Try a sample" }).getAttribute("aria-selected")).toBe("false")
    expect(container.querySelector("input[type=file]")).toBeTruthy()
  })

  it("lists every configured sample in the sample tab", async () => {
    stubTurnstile()
    const user = userEvent.setup()
    render(<FileIntake busy={false} onSubmit={vi.fn()} samples={twoSamples} />)
    await user.click(screen.getByRole("tab", { name: "Try a sample" }))
    expect(screen.getByRole("button", { name: "Synthetic intake" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Synthetic APS" })).toBeTruthy()
  })

  it("selects a chosen sample without submitting, then submits it with the token", async () => {
    const { options } = stubTurnstile()
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(docxBytes()))
    render(<FileIntake busy={false} onSubmit={onSubmit} samples={twoSamples} />)
    options.callback?.("tok-s")
    await openSample(user, "Synthetic APS")
    expect(fetchSpy).toHaveBeenCalledWith("/tests/fixtures/synthetic-aps.docx", expect.anything())
    expect(await screen.findByText("synthetic-aps.docx")).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Alias Document" }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "synthetic-aps.docx" }), "tok-s")
  })

  it("switching tabs clears the selected file, error, and notifies onFileChange(null)", async () => {
    stubTurnstile()
    const user = userEvent.setup()
    const onFileChange = vi.fn()
    vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(docxBytes()))
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} samples={twoSamples} onFileChange={onFileChange} />)
    pick(container, pdf())
    expect(await screen.findByText("contract.pdf")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "Try a sample" }))
    expect(onFileChange).toHaveBeenLastCalledWith(null)
    expect(screen.queryByText("contract.pdf")).toBeNull()
    expect(screen.getByRole("button", { name: "Alias Document" })).toBeDisabled()
  })

  it("a sample still in flight cannot select after switching back to upload", async () => {
    stubTurnstile()
    const user = userEvent.setup()
    const onFileChange = vi.fn()
    let signal: AbortSignal | undefined
    let resolveFetch: (r: Response) => void = () => {}
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined
      return new Promise((r) => { resolveFetch = r })
    })
    render(<FileIntake busy={false} onSubmit={vi.fn()} samples={twoSamples} onFileChange={onFileChange} />)
    await openSample(user)
    expect(signal?.aborted).toBe(false)
    await user.click(screen.getByRole("tab", { name: "Upload document" }))
    expect(signal?.aborted).toBe(true)
    resolveFetch(docxBytes())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText("synthetic-intake.docx")).toBeNull()
    expect(onFileChange).not.toHaveBeenCalledWith(expect.objectContaining({ name: "synthetic-intake.docx" }))
    expect(screen.getByRole("button", { name: "Alias Document" })).toBeDisabled()
  })

  it("selecting sample B aborts in-flight sample A and a late A response cannot win", async () => {
    stubTurnstile()
    const user = userEvent.setup()
    const signals: AbortSignal[] = []
    const resolvers: ((r: Response) => void)[] = []
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signals.push(init!.signal!)
      return new Promise((r) => { resolvers.push(r) })
    })
    const { container } = render(<FileIntake busy={false} onSubmit={vi.fn()} samples={twoSamples} />)
    await openSample(user, "Synthetic intake")
    await openSample(user, "Synthetic APS")
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    resolvers[1](docxBytes())
    expect(await screen.findByText("synthetic-aps.docx")).toBeTruthy()
    resolvers[0](docxBytes())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByText("synthetic-aps.docx")).toBeTruthy()
    expect(screen.queryByText("synthetic-intake.docx")).toBeNull()
    expect(container.querySelector(".sample-selected")?.textContent).toContain("synthetic-aps.docx")
  })

  it("sends the configured URL, filename and MIME for a PDF sample", async () => {
    stubTurnstile()
    const user = userEvent.setup()
    const onFileChange = vi.fn()
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]))))
    const pdfSample = { label: "Synthetic PDF", url: "/tests/fixtures/synthetic-email.pdf", filename: "synthetic-email.pdf" }
    render(<FileIntake busy={false} onSubmit={vi.fn()} samples={[...twoSamples, pdfSample]} onFileChange={onFileChange} />)
    await openSample(user, "Synthetic PDF")
    expect(fetchSpy).toHaveBeenCalledWith("/tests/fixtures/synthetic-email.pdf", expect.anything())
    expect(await screen.findByText("synthetic-email.pdf")).toBeTruthy()
    expect(onFileChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: "synthetic-email.pdf", type: "application/pdf" }))
  })

  it("disables every sample action while busy", async () => {
    stubTurnstile()
    const user = userEvent.setup()
    const { rerender } = render(<FileIntake busy={false} onSubmit={vi.fn()} samples={twoSamples} />)
    await user.click(screen.getByRole("tab", { name: "Try a sample" }))
    rerender(<FileIntake busy onSubmit={vi.fn()} samples={twoSamples} />)
    expect(screen.getByRole("button", { name: "Synthetic intake" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Synthetic APS" })).toBeDisabled()
  })

  it("renders no sample controls for an empty sample list", () => {
    stubTurnstile()
    render(<FileIntake busy={false} onSubmit={vi.fn()} samples={[]} />)
    expect(screen.queryByRole("tab", { name: "Try a sample" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Synthetic/ })).toBeNull()
  })
})
