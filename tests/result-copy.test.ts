import { describe, expect, it } from "vitest"
import { serializeRedactionReport, serializeRenderedDocument, serializePlaygroundBlocks } from "@/lib/resultCopy"
import type { Block, Report } from "@/lib/api"

const block: Block = {
  id: "b1", page: 2, type: "heading", text: "Summary", x: 0, y: 0, width: 10, height: 10,
  confidence: 0.6, engine: "synthetic",
}
const report: Report = {
  schema_version: "2", entity_counts: { PERSON: 2, EMAIL_ADDRESS: 1 }, low_confidence_spans: [{}],
  unprocessed_pages: [3], dropped_images: 1, blocks: [block],
}

describe("result copy serializers", () => {
  it("includes report notice, total, labels, counts, and all rendered quality metadata", () => {
    const text = serializeRedactionReport(report)
    for (const detail of ["Review outputs before use in your practice.", "3 items found", "Email addresses: 1", "People: 2", "Low-confidence spans: 1", "Unprocessed pages: 3", "Dropped images: 1"]) {
      expect(text).toContain(detail)
    }
  })

  it("preserves rendered document headings and list structure without invented page/type metadata", () => {
    expect(serializeRenderedDocument([
      { ...block, type: "heading", text: "Summary" },
      { ...block, id: "b2", type: "list_item", text: "First item" },
      { ...block, id: "b3", type: "paragraph", text: "Details" },
    ])).toBe("## Summary\n\n- First item\n\nDetails")
  })

  it("copies all visible block flags and text from the playground block list", () => {
    expect(serializePlaygroundBlocks([{ ...block, text: "[PERSON_1A2B3C4D_1]" }])).toBe("heading · p.2 · low confidence · block-level, approximate\n[PERSON_1A2B3C4D_1]")
  })

  it("copies the visible empty-state text instead of hidden document content", () => {
    expect(serializePlaygroundBlocks([])).toBe("No structured blocks.\nThis document type has no block layout (DOCX/TXT). Use the Markdown view.")
  })
})
