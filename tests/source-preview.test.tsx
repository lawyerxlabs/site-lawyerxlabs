// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { SourcePreview } from "@/components/SourcePreview"

// jsdom has no canvas, so getContext() returns null and the render path bails
// before setViewport. Stub a context so the overlay can be exercised.
const fakeViewport = {
  width: 600,
  height: 800,
  rotation: 0,
  rawDims: { pageWidth: 600, pageHeight: 800, pageX: 0, pageY: 0 },
  convertToViewportPoint: (x: number, y: number) => [x / 600, y / 800] as const,
  transform: [1, 0, 0, 1, 0, 0],
}
// Default page text reads "Price $500,000" across two exact adjacent text items.
const defaultItems = [
  { str: "Price ", transform: [1, 0, 0, 1, 10, 20], width: 35, height: 10, hasEOL: false },
  { str: "$500,000", transform: [1, 0, 0, 1, 50, 20], width: 60, height: 10, hasEOL: true },
]
function syntheticPdfBytes() {
  const stream = "BT /F1 12 Tf 50 250 Td (Con) Tj ET BT /F1 12 Tf 71 250 Td (tract) Tj ET BT /F1 12 Tf 97 250 Td ( ) Tj ET BT /F1 12 Tf 100 250 Td (Review) Tj ET BT /F1 12 Tf 50 230 Td (Section 1) Tj ET"
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]
  let data = "%PDF-1.4\n"
  const offsets = [0]
  for (const object of objects) {
    offsets.push(data.length)
    data += object
  }
  const xrefOffset = data.length
  data += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new TextEncoder().encode(data)
}
let pageItems = defaultItems
const pdfPage = {
  getViewport: vi.fn(({ scale }: { scale: number }) => ({ ...fakeViewport, width: 600 * scale, height: 800 * scale })),
  render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
  getTextContent: vi.fn(() => Promise.resolve({ items: pageItems })),
}
const pdf = { numPages: 2, getPage: vi.fn(() => Promise.resolve(pdfPage)) }
const pdfThree = { numPages: 3, getPage: vi.fn(() => Promise.resolve(pdfPage)) }
const fakeContext = { fillRect: vi.fn(), setTransform: vi.fn() }
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeContext as never)

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  Util: { transform: (m: number[], t: number[]) => [m[0] * t[0], 0, 0, m[3] * t[3], m[4] + t[4], m[5] + t[5]] },
  // Test files encode their page count as "pages=N" so each PDF can differ.
  getDocument: vi.fn(({ data }: { data: Uint8Array }) => ({
    promise: Promise.resolve(new TextDecoder().decode(data).includes("pages=3") ? pdfThree : pdf),
    destroy: vi.fn(),
  })),
}))

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }))

const originalObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL")
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL")
afterEach(() => {
  cleanup()
  pageItems = defaultItems
  pdfPage.getTextContent.mockImplementation(() => Promise.resolve({ items: pageItems }))
  if (originalObjectUrl) Object.defineProperty(URL, "createObjectURL", originalObjectUrl)
  else Reflect.deleteProperty(URL, "createObjectURL")
  if (originalRevokeObjectUrl) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl)
  else Reflect.deleteProperty(URL, "revokeObjectURL")
})

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    this.callback([{ contentRect: { width: 640 } } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverMock)

describe("SourcePreview", () => {
  it("offers keyboard-accessible page text extracted locally from a text-based PDF", async () => {
    const user = userEvent.setup()
    const file = new File(["%PDF-1.4"], "text.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())

    const disclosure = screen.getByText("Read text on page 1")
    disclosure.focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByText("Price $500,000")).toBeTruthy()
    expect(screen.getByText(/extracts text locally.*may differ in tables or columns/i)).toBeTruthy()
  })

  it("does not insert a space between adjacent PDF.js fragments of one word", async () => {
    const user = userEvent.setup()
    pageItems = [
      { ...defaultItems[0], str: "Con", hasEOL: false },
      { ...defaultItems[1], str: "tract", hasEOL: true },
    ]
    const file = new File(["%PDF-1.4"], "split-word.pdf", { type: "application/pdf" })
    const { container } = render(<SourcePreview file={file} />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
    screen.getByText("Read text on page 1").focus()
    await user.keyboard("{Enter}")

    await waitFor(() => expect(container.querySelector(".source-preview-readable-text p")).toBeTruthy())
    const lines = [...container.querySelectorAll(".source-preview-readable-text p")].map((line) => line.textContent)
    expect(lines).toEqual(["Contract"])
  })

  it("preserves explicit run spacing and PDF.js end-of-line boundaries", async () => {
    const user = userEvent.setup()
    pageItems = [
      { ...defaultItems[0], str: "  Article", hasEOL: false },
      { ...defaultItems[1], str: "  12  ", hasEOL: true },
      { ...defaultItems[0], str: "Next line", hasEOL: true },
    ]
    const file = new File(["%PDF-1.4"], "spacing.pdf", { type: "application/pdf" })
    const { container } = render(<SourcePreview file={file} />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
    screen.getByText("Read text on page 1").focus()
    await user.keyboard("{Enter}")

    await screen.findByText((_, element) => element?.classList.contains("source-preview-readable-text") ?? false)
    const lines = [...container.querySelectorAll(".source-preview-readable-text p")].map((line) => line.textContent)
    expect(lines).toEqual(["  Article  12  ", "Next line"])
  })

  it("preserves text and line breaks extracted by PDF.js from a synthetic PDF", async () => {
    const realPdfjs = await vi.importActual<typeof import("pdfjs-dist")>("pdfjs-dist")
    const task = realPdfjs.getDocument({ data: syntheticPdfBytes() })
    const document = await task.promise
    try {
      pageItems = (await (await document.getPage(1)).getTextContent()).items as typeof pageItems
      const file = new File(["%PDF-1.4"], "real-extraction.pdf", { type: "application/pdf" })
      const { container } = render(<SourcePreview file={file} />)
      await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
      screen.getByText("Read text on page 1").focus()
      await userEvent.setup().keyboard("{Enter}")

      await waitFor(() => expect(container.querySelectorAll(".source-preview-readable-text p")).toHaveLength(2))
      const lines = [...container.querySelectorAll(".source-preview-readable-text p")].map((line) => line.textContent)
      expect(lines).toEqual(["Contract Review", "Section 1"])
    } finally {
      await task.destroy()
    }
  })

  it("offers the original PDF as fallback for pages with no text and does not claim OCR", async () => {
    const user = userEvent.setup()
    pageItems = []
    const createObjectURL = vi.fn(() => "blob:original-pdf")
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const file = new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
    const disclosure = screen.getByText("Read text on page 1")
    disclosure.focus()
    await user.keyboard("{Enter}")

    expect(await screen.findByText(/No selectable text was found.*This app does not perform OCR/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Download original PDF for an accessible reader or OCR tool" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Download original PDF for an accessible reader or OCR tool" }))
    expect(createObjectURL).toHaveBeenCalledWith(file)
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:original-pdf")
  })

  it("does not publish stale page text after navigation supersedes extraction", async () => {
    let resolvePageOne!: (value: { items: typeof defaultItems }) => void
    const pageOne = new Promise<{ items: typeof defaultItems }>((resolve) => { resolvePageOne = resolve })
    pdfPage.getTextContent.mockImplementationOnce(() => pageOne).mockImplementationOnce(() => Promise.resolve({ items: [{ ...defaultItems[0], str: "Current page two", hasEOL: true }] }))
    const file = new File(["%PDF-1.4"], "pages.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} />)
    await waitFor(() => expect(pdfPage.getTextContent).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole("button", { name: "Next" }))
    expect(await screen.findByText("Current page two")).toBeTruthy()
    resolvePageOne({ items: [{ ...defaultItems[0], str: "Stale page one", hasEOL: true }] })
    await waitFor(() => expect(screen.queryByText("Stale page one")).toBeNull())
  })

  it("does not publish text extracted from the previous source after a file switch", async () => {
    let resolveOldFile!: (value: { items: typeof defaultItems }) => void
    const oldText = new Promise<{ items: typeof defaultItems }>((resolve) => { resolveOldFile = resolve })
    pdfPage.getTextContent.mockImplementationOnce(() => oldText).mockImplementationOnce(() => Promise.resolve({ items: [{ ...defaultItems[0], str: "Current source", hasEOL: true }] }))
    const first = new File(["%PDF-1.4"], "first.pdf", { type: "application/pdf" })
    const second = new File(["%PDF-1.4"], "second.pdf", { type: "application/pdf" })
    const { rerender } = render(<SourcePreview file={first} />)
    await waitFor(() => expect(pdfPage.getTextContent).toHaveBeenCalledTimes(1))

    rerender(<SourcePreview file={second} />)
    expect(await screen.findByText("Current source")).toBeTruthy()
    resolveOldFile({ items: [{ ...defaultItems[0], str: "Stale source", hasEOL: true }] })
    await waitFor(() => expect(screen.queryByText("Stale source")).toBeNull())
  })

  it("zooms canvas and overlays together and keeps page navigation available", async () => {
    const file = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const blocks = [{ id: "zoom", page: 1, type: "paragraph" as const, text: "Zoom", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    render(<SourcePreview file={file} blocks={blocks} />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
    const controls = screen.getByRole("group", { name: "Page and zoom controls" })
    const canvas = screen.getByRole("img", { name: "Source page 1" }) as HTMLCanvasElement
    expect(controls.compareDocumentPosition(canvas)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    const originalWidth = canvas.width
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    await waitFor(() => expect(screen.getByText("125%")).toBeTruthy())
    expect(canvas.width).toBeGreaterThan(originalWidth)
    fireEvent.click(screen.getByRole("button", { name: "Fit width" }))
    await waitFor(() => expect(screen.getByText("100%")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy()
  })

  it("navigates to the cited page and highlights an exact native-text match", async () => {
    const file = new File(["%PDF-1.4 pages=3"], "evidence.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} evidence={{ page: 2, quote: "Price $500,000" }} />)
    await waitFor(() => expect(screen.getByText("Page 2 of 3")).toBeTruthy())
    await waitFor(() => expect(document.querySelectorAll(".source-preview-evidence").length).toBe(2))
    expect(screen.queryByText(/could not be mapped exactly/)).toBeNull()
  })

  it("shows unavailable and no highlight when the quote is not an exact item match", async () => {
    pageItems = [{ str: "Price $500,000 plus tax", transform: [1, 0, 0, 1, 10, 20], width: 200, height: 10 }]
    const file = new File(["%PDF-1.4"], "partial.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} evidence={{ page: 1, quote: "Price $500,000" }} />)
    await waitFor(() => expect(screen.getByText(/could not be mapped exactly/)).toBeTruthy())
    expect(document.querySelector(".source-preview-evidence")).toBeNull()
  })

  it("does not navigate for a cited page outside the document", async () => {
    const file = new File(["%PDF-1.4 pages=3"], "range.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} evidence={{ page: 9, quote: "Price $500,000" }} />)
    await waitFor(() => expect(screen.getByText("Page 1 of 3")).toBeTruthy())
    expect(screen.getByText(/cited page 9 is not in this PDF/)).toBeTruthy()
    expect(document.querySelector(".source-preview-evidence")).toBeNull()
  })

  it("supports PDF to DOCX transitions without changing hook order", () => {
    const pdf = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const docx = new File(["docx"], "source.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    })
    const { rerender } = render(<SourcePreview file={pdf} />)

    rerender(<SourcePreview file={docx} />)
    expect(screen.getByText("Source preview unavailable for this document type.")).toBeTruthy()

    rerender(<SourcePreview file={pdf} />)
    expect(screen.queryByText("Source preview unavailable for this document type.")).toBeNull()
  })

  it("handles undefined file gracefully after page refresh or navigation", () => {
    const pdf = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const { rerender } = render(<SourcePreview file={pdf} />)

    // Simulate source store cleared on page refresh or navigation back
    rerender(<SourcePreview file={undefined} />)
    expect(screen.getByText("Upload a PDF or DOCX to preview source.")).toBeTruthy()
  })

  it("explains an encrypted PDF instead of rendering it", async () => {
    const { getDocument } = await import("pdfjs-dist")
    const passwordError = Object.assign(new Error("No password given"), { name: "PasswordException" })
    vi.mocked(getDocument).mockReturnValueOnce({ promise: Promise.reject(passwordError), destroy: vi.fn() } as never)
    const file = new File(["%PDF-1.4 encrypted"], "encrypted.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} />)
    await waitFor(() => expect(screen.getByText("This PDF is password-protected, so a source preview can't be shown.")).toBeTruthy())
    expect(screen.queryByRole("img", { name: "Source page 1" })).toBeNull()
  })

  it("renders a page with no blocks without an overlay group", async () => {
    const file = new File(["%PDF-1.4 blank"], "blank.pdf", { type: "application/pdf" })
    render(<SourcePreview file={file} blocks={[]} />)
    await waitFor(() => expect(screen.getByRole("img", { name: "Source page 1" })).toBeTruthy())
    expect(screen.getByText("Page 1 of 2")).toBeTruthy()
    expect(screen.queryByRole("group", { name: "Document blocks" })).toBeNull()
  })

  it("shows the unavailable message for a DOCX source without loading a PDF", async () => {
    const { getDocument } = await import("pdfjs-dist")
    vi.mocked(getDocument).mockClear()
    const docx = new File(["docx"], "source.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })
    render(<SourcePreview file={docx} />)
    expect(screen.getByText("Source preview unavailable for this document type.")).toBeTruthy()
    expect(getDocument).not.toHaveBeenCalled()
  })

  it("does not render overlays on a rotated page and explains why", async () => {
    const rotated = { ...pdfPage, getViewport: vi.fn(({ scale }: { scale: number }) => ({ ...fakeViewport, rotation: 90, width: 600 * scale, height: 800 * scale })) }
    const rotatedPdf = { numPages: 2, getPage: vi.fn(() => Promise.resolve(rotated)) }
    const { getDocument } = await import("pdfjs-dist")
    vi.mocked(getDocument).mockReturnValueOnce({ promise: Promise.resolve(rotatedPdf as never), destroy: vi.fn() } as never)
    const file = new File(["%PDF-1.4 pages=2"], "rotated.pdf", { type: "application/pdf" })
    const blocks = [{ id: "b1", page: 1, type: "paragraph" as const, text: "x", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    render(<SourcePreview file={file} blocks={blocks} />)
    await waitFor(() => expect(screen.getByText("This page is rotated; document-block overlays aren't available for it.")).toBeTruthy())
    expect(screen.queryByRole("group", { name: "Document blocks" })).toBeNull()
  })

  it("cancels the in-flight render when navigating to another page", async () => {
    const file = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const cancel = vi.fn()
    pdfPage.render.mockImplementationOnce(() => ({ promise: new Promise(() => {}), cancel }))
    render(<SourcePreview file={file} />)
    await waitFor(() => expect(pdfPage.render).toHaveBeenCalled())
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(cancel).toHaveBeenCalled()
  })

  it("does not render block overlays for OCR pages", async () => {
    const file = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const blocks = [{ id: "ocr-block", page: 1, type: "paragraph" as const, text: "OCR", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    render(<SourcePreview file={file} blocks={blocks} pages={[{ page: 1, source: "ocr", ocr_model: "ocr" }]} />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
    expect(screen.queryByText(/OCR was applied|OCR is available/i)).toBeNull()
  })

  it("does not re-jump after manual page navigation", async () => {
    const file = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const blocks = [
      { id: "page-one", page: 1, type: "paragraph", text: "One", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" },
      { id: "page-two", page: 2, type: "paragraph", text: "Two", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" },
    ]
    const { rerender } = render(<SourcePreview file={file} blocks={blocks} selectedBlockId="page-two" />)

    await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeTruthy())
    fireEvent.click(screen.getByRole("button", { name: "Previous" }))
    expect(screen.getByText("Page 1 of 2")).toBeTruthy()

    rerender(<SourcePreview file={file} blocks={blocks} selectedBlockId="page-two" />)
    expect(screen.getByText("Page 1 of 2")).toBeTruthy()
  })

  it.each([0, -1, 3, 1.5])("ignores selected block on invalid page %s without requesting it", async (badPage) => {
    const file = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const blocks = [{ id: "bad", page: badPage, type: "paragraph" as const, text: "Bad", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    pdf.getPage.mockClear()
    render(<SourcePreview file={file} blocks={blocks} selectedBlockId="bad" />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
    await waitFor(() => expect(pdf.getPage).toHaveBeenCalled())
    for (const [n] of pdf.getPage.mock.calls) expect(Number.isInteger(n) && n >= 1 && n <= 2).toBe(true)
  })

  it("keeps manual navigation on page 2 after selecting a page-1 block", async () => {
    const file = new File(["%PDF-1.4"], "source.pdf", { type: "application/pdf" })
    const blocks = [
      { id: "page-one", page: 1, type: "paragraph", text: "One", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" },
      { id: "page-two", page: 2, type: "paragraph", text: "Two", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" },
    ]
    function Harness() {
      const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
      return <SourcePreview file={file} blocks={blocks} selectedBlockId={selectedBlockId} onSelectBlock={setSelectedBlockId} />
    }
    render(<Harness />)

    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())

    // Select a block on page 1.
    const pageOneBlock = await waitFor(() => screen.getByRole("button", { name: /^Block 1 of page 1/ }))
    fireEvent.click(pageOneBlock)
    expect(pageOneBlock.className).toContain("source-preview-block-selected")
    expect(pageOneBlock.getAttribute("aria-pressed")).toBe("true")

    // Navigate manually to page 2.
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeTruthy())

    // The selected-block effect must not re-jump back to page 1 on rerender.
    expect(screen.getByText("Page 2 of 2")).toBeTruthy()

    // Selection remains selected even while its page is not visible.
    expect(pageOneBlock.className).toContain("source-preview-block-selected")
    expect(pageOneBlock.getAttribute("aria-pressed")).toBe("true")
  })

  it("does not request an out-of-range page when swapping to a PDF with fewer pages", async () => {
    const first = new File(["%PDF-1.4 pages=3"], "a.pdf", { type: "application/pdf" })
    const second = new File(["%PDF-1.4 pages=2"], "b.pdf", { type: "application/pdf" })
    const blocks = [{ id: "p3", page: 3, type: "paragraph" as const, text: "Three", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    const { rerender } = render(<SourcePreview file={first} blocks={blocks} selectedBlockId="p3" />)
    await waitFor(() => expect(screen.getByText("Page 3 of 3")).toBeTruthy())

    pdfThree.getPage.mockClear()
    pdf.getPage.mockClear()
    rerender(<SourcePreview file={second} blocks={blocks} selectedBlockId="p3" />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())
    for (const [n] of [...pdf.getPage.mock.calls, ...pdfThree.getPage.mock.calls]) expect(n >= 1 && n <= 2).toBe(true)
  })

  it("re-navigates to the selected block after swapping to a PDF with more pages", async () => {
    const first = new File(["%PDF-1.4 pages=2"], "a.pdf", { type: "application/pdf" })
    const second = new File(["%PDF-1.4 pages=3"], "b.pdf", { type: "application/pdf" })
    const blocks = [{ id: "p3", page: 3, type: "paragraph" as const, text: "Three", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    const { rerender } = render(<SourcePreview file={first} blocks={blocks} selectedBlockId="p3" />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())

    rerender(<SourcePreview file={second} blocks={blocks} selectedBlockId="p3" />)
    await waitFor(() => expect(screen.getByText("Page 3 of 3")).toBeTruthy())
  })

  it("navigates when the selected block arrives after the selection", async () => {
    const file = new File(["%PDF-1.4 pages=2"], "source.pdf", { type: "application/pdf" })
    const blocks = [{ id: "p2", page: 2, type: "paragraph" as const, text: "Two", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    const { rerender } = render(<SourcePreview file={file} blocks={[]} selectedBlockId="p2" />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())

    rerender(<SourcePreview file={file} blocks={blocks} selectedBlockId="p2" />)
    await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeTruthy())
  })

  it("navigates to the selected block once its invalid page is corrected", async () => {
    const file = new File(["%PDF-1.4 pages=2"], "source.pdf", { type: "application/pdf" })
    const bad = [{ id: "x", page: 5, type: "paragraph" as const, text: "X", x: 10, y: 10, width: 10, height: 10, confidence: 1, engine: "test" }]
    const fixed = [{ ...bad[0], page: 2 }]
    pdf.getPage.mockClear()
    const { rerender } = render(<SourcePreview file={file} blocks={bad} selectedBlockId="x" />)
    await waitFor(() => expect(screen.getByText("Page 1 of 2")).toBeTruthy())

    rerender(<SourcePreview file={file} blocks={fixed} selectedBlockId="x" />)
    await waitFor(() => expect(screen.getByText("Page 2 of 2")).toBeTruthy())
    for (const [n] of pdf.getPage.mock.calls) expect(n >= 1 && n <= 2).toBe(true)
  })
})
