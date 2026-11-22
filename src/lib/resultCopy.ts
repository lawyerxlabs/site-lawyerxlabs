import type { Block, Report } from "@/lib/api"
import { hasRedactionPlaceholder } from "@/lib/blockTransform"
import { entityLabels } from "@/lib/entityLabels"

export const LOW_CONFIDENCE_THRESHOLD = 0.8

type ReportCopyOptions = {
  emptyMessage?: string
  confidenceLabel?: "items" | "spans"
  emptyPagesLabel?: "None" | "none"
}

export function serializeRedactionReport(report: Report, options: ReportCopyOptions = {}): string {
  const entries = Object.entries(report.entity_counts)
    .map(([key, count]) => [entityLabels[key] ?? key.toLowerCase().replaceAll("_", " ").replace(/^./, (char) => char.toUpperCase()), count] as const)
    .sort(([a], [b]) => a.localeCompare(b))
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  const lines = [
    "Redaction report",
    "Review outputs before use in your practice.",
    "Detection summary",
    `${total} ${total === 1 ? "item" : "items"} found`,
    ...(entries.length ? entries.map(([label, count]) => `${label}: ${count}`) : [options.emptyMessage ?? "No personal information detected."]),
    `Low-confidence ${options.confidenceLabel ?? "spans"}: ${report.low_confidence_spans.length}`,
    `Unprocessed pages: ${report.unprocessed_pages.length ? report.unprocessed_pages.join(", ") : options.emptyPagesLabel ?? "none"}`,
    `Dropped images: ${report.dropped_images}`,
  ]
  return lines.join("\n")
}

export function serializeRenderedDocument(blocks: Block[]): string {
  return blocks.map((block) => {
    if (block.type === "heading") return `## ${block.text}`
    if (block.type === "list_item") return `- ${block.text}`
    return block.text
  }).join("\n\n")
}

export function serializePlaygroundBlocks(blocks: Block[]): string {
  if (!blocks.length) return "No structured blocks.\nThis document type has no block layout (DOCX/TXT). Use the Markdown view."
  return blocks.map((block) => {
    const metadata = [block.type, `p.${block.page}`]
    if (block.confidence < LOW_CONFIDENCE_THRESHOLD) metadata.push("low confidence")
    if (hasRedactionPlaceholder(block)) metadata.push("block-level, approximate")
    return `${metadata.join(" · ")}\n${block.text}`
  }).join("\n\n")
}
