import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"
import { beforeAll, describe, expect, it } from "vitest"
import { blockToViewportRect, hasRedactionPlaceholder, isOverlayEligible } from "@/lib/blockTransform"
import type { Block } from "@/lib/api"

const FIXTURE = join(import.meta.dirname, "fixtures", "synthetic-redaction.pdf")
const ROTATED_FIXTURE = join(import.meta.dirname, "fixtures", "rotated-page1.pdf")
const CROPBOX_FIXTURE = join(import.meta.dirname, "fixtures", "cropbox-offset.pdf")

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: "b-1-1",
    page: 1,
    type: "paragraph",
    text: "SYNTHETIC FIXTURE - Alice Example",
    x: 72,
    y: 72,
    width: 400,
    height: 18,
    confidence: 0.95,
    engine: "liteparse",
    ...overrides,
  }
}

describe("blockToViewportRect", () => {
  let page: pdfjs.PDFPageProxy

  beforeAll(async () => {
    const data = new Uint8Array(readFileSync(FIXTURE))
    const pdf = await pdfjs.getDocument({ data }).promise
    page = await pdf.getPage(1)
  })

  it("maps a known block to the expected rect at scale 1", () => {
    const viewport = page.getViewport({ scale: 1 })
    const rect = blockToViewportRect(makeBlock(), viewport)
    expect(rect).toEqual({ left: 72, top: 72, width: 400, height: 18 })
  })

  it("scales linearly at a second scale", () => {
    const viewport = page.getViewport({ scale: 2 })
    const rect = blockToViewportRect(makeBlock(), viewport)
    expect(rect).toEqual({ left: 144, top: 144, width: 800, height: 36 })
  })

  it("scales linearly at a third, non-integer scale", () => {
    const viewport = page.getViewport({ scale: 1.5 })
    const rect = blockToViewportRect(makeBlock(), viewport)
    expect(rect).toEqual({ left: 108, top: 108, width: 600, height: 27 })
  })

  it("skips invalid geometry (non-finite) without throwing", () => {
    const viewport = page.getViewport({ scale: 1 })
    expect(blockToViewportRect(makeBlock({ width: NaN }), viewport)).toBeNull()
    expect(blockToViewportRect(makeBlock({ x: Infinity }), viewport)).toBeNull()
  })

  it("skips zero/negative-size geometry", () => {
    const viewport = page.getViewport({ scale: 1 })
    expect(blockToViewportRect(makeBlock({ width: 0 }), viewport)).toBeNull()
    expect(blockToViewportRect(makeBlock({ height: -5 }), viewport)).toBeNull()
  })
})

describe("blockToViewportRect with a non-zero crop box", () => {
  it("accounts for the crop-box offset, not just the y-flip", async () => {
    // Fixture's CropBox is [36, 36, 612, 792] (36pt inset on the left/bottom edges of a
    // [0, 0, 612, 792] MediaBox).
    // Known text item sits at native PDF point (72, 720); contract-space block coords
    // (crop-box relative, top-left origin) for that point are (36, 72) — see tool-parse
    // docs/CONTRACT.md "Block coordinate semantics" crop-box-relative clause.
    const data = new Uint8Array(readFileSync(CROPBOX_FIXTURE))
    const pdf = await pdfjs.getDocument({ data }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const block = makeBlock({ x: 36, y: 72, width: 1, height: 1 })
    const rect = blockToViewportRect(block, viewport)
    expect(rect).not.toBeNull()
    expect(rect!.left).toBeCloseTo(36, 5)
    expect(rect!.top).toBeCloseTo(72, 5)
  })
})

describe("isOverlayEligible", () => {
  it("suppresses overlays on a rotated page (per contract, out of scope)", async () => {
    const data = new Uint8Array(readFileSync(ROTATED_FIXTURE))
    const pdf = await pdfjs.getDocument({ data }).promise
    const rotatedPage = await pdf.getPage(1)
    const uprightPage = await pdf.getPage(2)
    expect(isOverlayEligible(rotatedPage.getViewport({ scale: 1 }))).toBe(false)
    expect(isOverlayEligible(uprightPage.getViewport({ scale: 1 }))).toBe(true)
  })
})

describe("hasRedactionPlaceholder", () => {
  it("detects a placeholder in block text", () => {
    expect(hasRedactionPlaceholder(makeBlock({ text: "Dear [PERSON_A1B2C3D4_1]," }))).toBe(true)
  })

  it("returns false for plain text", () => {
    expect(hasRedactionPlaceholder(makeBlock({ text: "No placeholders here." }))).toBe(false)
  })

  it("does not false-positive on unrelated bracketed text", () => {
    expect(hasRedactionPlaceholder(makeBlock({ text: "See [Figure 1] for details." }))).toBe(false)
  })
})
