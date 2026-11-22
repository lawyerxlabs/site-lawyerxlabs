import { useEffect, useRef, useState } from "react"
import * as pdfjs from "pdfjs-dist"
import type { PageViewport, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { Block, ReportPage, TermVisualEvidence } from "@/lib/api"
import { blockToViewportRect, hasRedactionPlaceholder, isOverlayEligible } from "@/lib/blockTransform"

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

type Status =
  | { status: "loading" }
  | { status: "ready"; file: File; pdf: PDFDocumentProxy; numPages: number }
  | { status: "error"; file: File; kind: "password" | "corrupt" | "other" }

type PageText = { file: File; pdf: PDFDocumentProxy; page: number; status: "loading" | "ready" | "error"; lines: string[] }

type SourcePreviewProps = {
  file?: File
  /** Document blocks for the whole job; overlays show only those on the current page. */
  blocks?: Block[]
  /** OCR pages have no reliable block geometry and never receive overlays. */
  pages?: ReportPage[]
  /** Block id highlighted from outside (e.g. selected in the block list). */
  selectedBlockId?: string | null
  /** Called when the user selects an overlay region. */
  onSelectBlock?: (blockId: string | null) => void
  /** Exact claim evidence; backend boxes take precedence over PDF.js text matching. */
  evidence?: ({ page: number; quote: string } & Partial<Pick<TermVisualEvidence, "boxes">>) | null
}

type EvidenceRect = { left: number; top: number; width: number; height: number }

// Rects are whole-item boxes in the rendered viewport's CSS space; rotated pages are refused like overlays.
type TextItems = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>["items"]

function exactEvidenceRects(items: TextItems, target: string, viewport: PageViewport): EvidenceRect[] | null {
  if (!target || !isOverlayEligible(viewport)) return null
  const textItems = items.filter((item): item is Extract<TextItems[number], { str: string }> => "str" in item && typeof item.str === "string")
  const matches: EvidenceRect[][] = []
  for (let start = 0; start < textItems.length; start += 1) {
    let joined = ""
    for (let end = start; end < textItems.length; end += 1) {
      joined += textItems[end].str
      if (joined === target) {
        const rects = textItems.slice(start, end + 1).map((item) => {
          const [, , , scaleY, x, y] = pdfjs.Util.transform(viewport.transform, item.transform)
          const scale = viewport.scale ?? 1
          const height = Math.abs(scaleY) || Math.abs(item.height * scale)
          return { left: x, top: y - height, width: Math.abs(item.width) * scale, height }
        })
        if (rects.every((rect) => [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0)) matches.push(rects)
        break
      }
      if (joined.length > target.length) break
    }
  }
  return matches.length === 1 ? matches[0] : null
}

function readableLines(items: TextItems): string[] {
  const lines: string[] = []
  let line = ""
  for (const item of items) {
    if (!("str" in item) || typeof item.str !== "string") continue
    line += item.str
    if ("hasEOL" in item && item.hasEOL) {
      if (line.trim()) lines.push(line)
      line = ""
    }
  }
  if (line.trim()) lines.push(line)
  return lines
}

function evidenceBoxRects(boxes: TermVisualEvidence["boxes"], viewport: PageViewport): EvidenceRect[] | null {
  if (!isOverlayEligible(viewport)) return null
  const rects = boxes.map((box) => {
    const { pageX, pageY } = viewport.rawDims as { pageX: number; pageY: number }
    const [x1, y1] = viewport.convertToViewportPoint(pageX + box.x, pageY + box.y)
    const [x2, y2] = viewport.convertToViewportPoint(pageX + box.x + box.width, pageY + box.y + box.height)
    return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }
  })
  return rects.every((rect) => [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0) ? rects : null
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function errorKind(err: unknown): "password" | "corrupt" | "other" {
  const name = err instanceof Error ? err.name : ""
  if (name === "PasswordException") return "password"
  if (name === "InvalidPDFException") return "corrupt"
  return "other"
}

export function SourcePreview({ file, blocks = [], pages = [], selectedBlockId = null, onSelectBlock, evidence = null }: SourcePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const previousSelectedBlockId = useRef<string | null>(null)
  const [status, setStatus] = useState<Status>({ status: "loading" })
  const [pageText, setPageText] = useState<PageText | null>(null)
  const [viewport, setViewport] = useState<PageViewport | null>(null)
  const [evidenceRects, setEvidenceRects] = useState<EvidenceRect[]>([])
  const [evidenceUnavailable, setEvidenceUnavailable] = useState(false)

  const pdfFile = file ? isPdf(file) : false
  // Ready state only counts when it was loaded for the File currently shown; a prior file's pdf must never drive selection or render.
  const ready = status.status === "ready" && status.file === file ? status : null
  const currentPageText = ready && pageText && pageText.file === file && pageText.pdf === ready.pdf && pageText.page === page ? pageText : null

  // Reset to page 1 and reload whenever a different file is shown.
  useEffect(() => {
    previousSelectedBlockId.current = null
    setPage(1)
    setZoom(1)
    setPageText(null)
    setStatus({ status: "loading" })
    setViewport(null)
  }, [file])

  // Extract only the active page locally. File/page identity and cancellation keep
  // late PDF.js promises from publishing text for a source no longer on screen.
  useEffect(() => {
    if (!ready || !file) return
    let cancelled = false
    setPageText({ file, pdf: ready.pdf, page, status: "loading", lines: [] })
    void (async () => {
      try {
        const content = await (await ready.pdf.getPage(page)).getTextContent()
        if (!cancelled) setPageText({ file, pdf: ready.pdf, page, status: "ready", lines: readableLines(content.items) })
      } catch {
        if (!cancelled) setPageText({ file, pdf: ready.pdf, page, status: "error", lines: [] })
      }
    })()
    return () => { cancelled = true }
  }, [file, ready?.pdf, page])

  // Navigate only after document count is known; invalid claims never redirect elsewhere.
  useEffect(() => {
    if (ready && evidence && Number.isInteger(evidence.page) && evidence.page >= 1 && evidence.page <= ready.numPages) setPage(evidence.page)
  }, [ready, evidence?.page, evidence?.quote])

  // Jump to the selected block's page if it isn't the one currently shown,
  // so selecting a block in the list always reveals its overlay region.
  // Consumed only once the block exists with a valid page, so a later block arrival or page fix still navigates.
  useEffect(() => {
    if (!selectedBlockId) {
      previousSelectedBlockId.current = null
      return
    }
    if (selectedBlockId === previousSelectedBlockId.current) return
    if (!ready) return
    const target = blocks.find((b) => b.id === selectedBlockId)
    if (!target || !Number.isInteger(target.page) || target.page < 1 || target.page > ready.numPages) return
    previousSelectedBlockId.current = selectedBlockId
    if (target.page !== page) setPage(target.page)
  }, [selectedBlockId, blocks, page, ready])

  // Track container width so the page renders at available width and rerenders on resize.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) setWidth(w)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Load the document from the user's own File bytes — no network request.
  // loadTask.destroy() tears down the worker transport on supersede/unmount, whether
  // that happens mid-load or after the document is ready.
  useEffect(() => {
    if (!pdfFile || !file) return
    let cancelled = false
    let activeTask: ReturnType<typeof pdfjs.getDocument> | null = null
    void (async () => {
      try {
        const data = new Uint8Array(await file.arrayBuffer())
        if (cancelled) return
        const task = pdfjs.getDocument({ data })
        activeTask = task
        const pdf = await task.promise
        if (cancelled) {
          void task.destroy()
          return
        }
        setStatus({ status: "ready", file, pdf, numPages: pdf.numPages })
      } catch (err) {
        if (!cancelled) setStatus({ status: "error", file, kind: errorKind(err) })
      }
    })()
    return () => {
      cancelled = true
      if (activeTask) void activeTask.destroy()
    }
  }, [file])

  // Render the selected page to the canvas at container width; cancel on supersede/unmount.
  useEffect(() => {
    if (!file || !pdfFile || !ready || width === 0 || page > ready.numPages) return
    const pdf = ready.pdf
    const canvas = canvasRef.current
    if (!canvas) return
    // Clear the previous page's viewport immediately so overlays never render against
    // stale dimensions while the new page is still loading/rendering.
    setViewport(null)
    canvas.width = 0
    canvas.height = 0
    canvas.style.width = ""
    canvas.style.height = ""
    let cancelled = false
    let renderTask: { cancel: () => void } | null = null
    void (async () => {
      try {
        const p = await pdf.getPage(page)
        if (cancelled) return
        const base = p.getViewport({ scale: 1 })
        const scale = (width / base.width) * zoom
        const pageViewport = p.getViewport({ scale })
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        // Canvas backing store is dpr× the CSS size for sharp rendering; pdf.js's own
        // viewport transform only fills the CSS-size area, so an explicit dpr scale
        // transform is required or the page draws shrunk into the top-left corner.
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.floor(pageViewport.width * dpr)
        canvas.height = Math.floor(pageViewport.height * dpr)
        canvas.style.width = `${pageViewport.width}px`
        canvas.style.height = `${pageViewport.height}px`
        canvas.style.maxWidth = "none"
        const task = p.render({ canvas, viewport: pageViewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
        renderTask = task
        await task.promise
        if (!cancelled) setViewport(pageViewport)
      } catch (err) {
        if (cancelled) return
        if (err instanceof Error && err.name === "RenderingCancelledException") return
        setStatus({ status: "error", file, kind: "other" })
      }
    })()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [ready?.pdf, page, width, zoom, file])

  // Highlight only an exact, unambiguous match made of whole PDF.js text items. Anything else is
  // reported unavailable; a partial-item box would be an estimate.
  useEffect(() => {
    setEvidenceRects([])
    setEvidenceUnavailable(false)
    if (!ready || !viewport || !evidence || evidence.page !== page) return
    let cancelled = false
    void (async () => {
      try {
        const content = await (await ready.pdf.getPage(page)).getTextContent()
        if (cancelled) return
        const rects = evidence.boxes ? evidenceBoxRects(evidence.boxes, viewport) : exactEvidenceRects(content.items, evidence.quote, viewport)
        if (rects) setEvidenceRects(rects)
        else setEvidenceUnavailable(true)
      } catch {
        if (!cancelled) setEvidenceUnavailable(true)
      }
    })()
    return () => { cancelled = true }
  }, [ready?.pdf, viewport, page, evidence?.page, evidence?.quote, file])

  function downloadOriginal() {
    if (!file || !pdfFile) return
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")
    link.href = url
    link.download = file.name
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!file || !pdfFile) {
    return (
      <div className="playground-empty">
        <p>{file ? "Source preview unavailable for this document type." : "Upload a PDF or DOCX to preview source."}</p>
      </div>
    )
  }

  const pageBlocks =
    ready
      ? blocks.filter((b) => b.page === page && pages.find((p) => p.page === page)?.source !== "ocr")
      : []
  const overlayEligible = viewport !== null && isOverlayEligible(viewport)

  return (
    <div className="source-preview">
      {ready && (
        <div className="source-preview-nav" role="group" aria-label="Page and zoom controls">
          <Button type="button" variant="secondary" size="sm" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, Math.round((value - 0.25) * 100) / 100))}>−</Button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="secondary" size="sm" aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, Math.round((value + 0.25) * 100) / 100))}>+</Button>
          <Button type="button" variant="secondary" size="sm" disabled={zoom === 1} onClick={() => setZoom(1)}>Fit width</Button>
          <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</Button>
          <span aria-live="polite">Page {page} of {ready.numPages}</span>
          <Button type="button" variant="secondary" size="sm" disabled={page >= ready.numPages} onClick={() => setPage((n) => n + 1)}>Next</Button>
        </div>
      )}
      <div ref={containerRef} className="source-preview-canvas">
        {ready && (
          <div className="source-preview-page" style={viewport ? { width: viewport.width, height: viewport.height } : undefined}>
            <canvas ref={canvasRef} aria-label={`Source page ${page}`} role="img" />
            {evidenceRects.length > 0 && (
              <div className="source-preview-overlay" role="group" aria-label="Exact claim evidence">
                {evidenceRects.map((rect, index) => <span key={index} className="source-preview-evidence" style={rect} />)}
              </div>
            )}
            {overlayEligible && viewport && pageBlocks.length > 0 && (
              <div className="source-preview-overlay" role="group" aria-label="Document blocks">
                {pageBlocks.map((block, index) => {
                  const rect = blockToViewportRect(block, viewport)
                  if (!rect) return null
                  const flagged = hasRedactionPlaceholder(block)
                  const selected = block.id === selectedBlockId
                  return (
                    <button
                      key={block.id}
                      type="button"
                      className={`source-preview-block${flagged ? " source-preview-block-flagged" : ""}${selected ? " source-preview-block-selected" : ""}`}
                      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
                      title={flagged ? "Document block (approximate) — contains redacted content" : "Document block (approximate)"}
                      aria-label={`Block ${index + 1} of page ${block.page}: ${block.type}${flagged ? ", contains redacted content" : ", approximate region"}`}
                      aria-pressed={selected}
                      onClick={() => onSelectBlock?.(block.id)}
                    />
                  )
                })}
              </div>
            )}
            {!viewport && <p className="source-preview-page-loading" role="status">Loading page {page}…</p>}
          </div>
        )}
      </div>
      <details className="source-preview-text">
        <summary>Read text on page {page}</summary>
        <p className="source-preview-note">PDF.js extracts text locally in this browser. Reading order may differ in tables or columns.</p>
        {status.status === "loading" && <p role="status">Loading the PDF text layer…</p>}
        {status.status === "error" && status.file === file && <p role="status">This PDF could not be opened for text extraction. This app does not perform OCR; download the original PDF to use an accessible reader or OCR tool.</p>}
        {currentPageText?.status === "loading" && <p role="status">Loading text on page {page}…</p>}
        {currentPageText?.status === "error" && <p role="status">Text extraction failed for this page. This app does not perform OCR; download the original PDF to use an accessible reader or OCR tool.</p>}
        {currentPageText?.status === "ready" && currentPageText.lines.length > 0 && <div className="source-preview-readable-text" aria-label={`Text extracted from PDF page ${page}`}>{currentPageText.lines.map((line, index) => <p key={index}>{line}</p>)}</div>}
        {currentPageText?.status === "ready" && currentPageText.lines.length === 0 && <p role="status">No selectable text was found on this page. It may be scanned or image-only. This app does not perform OCR.</p>}
        <Button type="button" variant="secondary" onClick={downloadOriginal}>Download original PDF for an accessible reader or OCR tool</Button>
      </details>
      {viewport && !overlayEligible && pageBlocks.length > 0 && (
        <p className="source-preview-note">This page is rotated; document-block overlays aren't available for it.</p>
      )}
      {evidence && ready && (evidence.page < 1 || evidence.page > ready.numPages) && <p className="source-preview-note">The cited page {evidence.page} is not in this PDF; no page or highlight is shown.</p>}
      {evidence && evidence.page === page && evidenceUnavailable && <p className="source-preview-note">The cited native text could not be mapped exactly in this PDF view; no highlight is shown.</p>}
      {status.status === "loading" && (
        <div className="playground-empty">
          <p>Loading source preview…</p>
        </div>
      )}
      {status.status === "error" && status.file === file && (
        <Alert>
          <p>
            {status.kind === "password" && "This PDF is password-protected, so a source preview can't be shown."}
            {status.kind === "corrupt" && "This PDF couldn't be read, so a source preview can't be shown."}
            {status.kind === "other" && "Source preview couldn't be loaded."}
          </p>
        </Alert>
      )}
    </div>
  )
}
