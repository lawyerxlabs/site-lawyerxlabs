import type { PageViewport } from "pdfjs-dist"
import type { Block } from "@/lib/api"

export type OverlayRect = { left: number; top: number; width: number; height: number }

// Redaction placeholders look like [ENTITY_TYPE_A1B2C3D4_1] — see tool-parse
// workers/redaction/redact.py (`secrets.token_hex(4).upper()` + running index).
const PLACEHOLDER_RE = /\[[A-Z_]+_[0-9A-F]{8}_\d+\]/

export function hasRedactionPlaceholder(block: Block): boolean {
  return PLACEHOLDER_RE.test(block.text)
}

function isValidGeometry(block: Block): boolean {
  return (
    Number.isFinite(block.x) &&
    Number.isFinite(block.y) &&
    Number.isFinite(block.width) &&
    Number.isFinite(block.height) &&
    block.width > 0 &&
    block.height > 0
  )
}

/**
 * Rotated-page coordinate semantics are out of contract (tool-parse docs/CONTRACT.md
 * "Block coordinate semantics"). pdf.js reports non-zero `rotate` in that case — detect
 * it and suppress overlays for that page rather than render misaligned boxes.
 */
export function isOverlayEligible(viewport: { rotation: number }): boolean {
  return viewport.rotation === 0
}

/**
 * Maps one Block's PDF-point geometry (tool-parse docs/CONTRACT.md "Block
 * coordinate semantics": 1-based page, top-left origin, y down, crop-box
 * relative — identical to a pdf.js viewport at scale 1) to a CSS rect inside
 * the rendered page's canvas. Guaranteed only for non-rotated pages; callers
 * must not invoke this for a page where pdf.js reports `rotate !== 0`.
 * Returns null for invalid/non-finite geometry so a bad block never breaks
 * the page.
 */
export function blockToViewportRect(block: Block, viewport: PageViewport): OverlayRect | null {
  if (!isValidGeometry(block)) return null
  // Block coords are top-left origin and crop-box relative (contract); convertToViewportPoint
  // expects absolute native PDF user-space (bottom-left origin, media-box relative), so both
  // the crop-box offset and the y-flip must be applied: native = (pageX + x, pageY + pageHeight - y).
  // pdf.js types rawDims as `object`; it is always { pageWidth, pageHeight, pageX, pageY }.
  const { pageX, pageY, pageHeight } = viewport.rawDims as { pageX: number; pageY: number; pageHeight: number }
  const [x1, y1] = viewport.convertToViewportPoint(pageX + block.x, pageY + pageHeight - block.y)
  const [x2, y2] = viewport.convertToViewportPoint(pageX + block.x + block.width, pageY + pageHeight - (block.y + block.height))
  const left = Math.min(x1, x2)
  const top = Math.min(y1, y2)
  const width = Math.abs(x2 - x1)
  const height = Math.abs(y2 - y1)
  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null
  return { left, top, width, height }
}
