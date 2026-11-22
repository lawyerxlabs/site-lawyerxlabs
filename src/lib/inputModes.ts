import type { InputMode } from "@/lib/workflows"

// Product ceiling for everyone; local until gateway job limits are available pre-upload.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MODE_LABELS: Record<InputMode, string> = { file: "Upload file", text: "Paste text", json: "Import JSON", sample: "Use sample" }
const MODE_ORDER: readonly InputMode[] = ["file", "text", "json"]

/** Enabled modes in display order; falls back to file so a misconfigured list never leaves the form empty. */
export function orderedInputModes(modes: readonly InputMode[]): InputMode[] {
  const ordered = MODE_ORDER.filter((mode) => modes.includes(mode))
  return ordered.length ? ordered : ["file"]
}

// Static fallback when the backend catalog is unavailable.
export const DEFAULT_FILE_TYPES: readonly string[] = [".pdf", ".docx"]

/** ".pdf,.docx" -> "PDF or DOCX" for copy. */
export function listFileTypes(types: readonly string[]): string {
  return types.map((t) => t.slice(1).toUpperCase()).join(" or ")
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

/** Pasted text as a File, or an error message when it cannot be submitted. */
export function pastedTextFile(text: string): File | string {
  if (!text.trim()) return "Paste some text before submitting."
  if (utf8ByteLength(text) > MAX_UPLOAD_BYTES) return "Pasted text is larger than 10 MB."
  return new File([text], "pasted-text.txt", { type: "text/plain;charset=utf-8" })
}

// Iterative: deeply nested JSON must not overflow the call stack.
function hasNonFiniteNumber(root: unknown): boolean {
  const stack: unknown[] = [root]
  while (stack.length) {
    const value = stack.pop()
    if (typeof value === "number") { if (!Number.isFinite(value)) return true }
    else if (Array.isArray(value)) { for (const item of value) stack.push(item) }
    else if (value !== null && typeof value === "object") { for (const item of Object.values(value)) stack.push(item) }
  }
  return false
}

/** Pasted JSON as a File (re-serialized from its parsed value), or an error message. */
export function pastedJsonFile(text: string): File | string {
  if (!text.trim()) return "Paste some JSON before submitting."
  if (utf8ByteLength(text) > MAX_UPLOAD_BYTES) return "JSON is larger than 10 MB."
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return "That is not valid JSON."
  }
  if (hasNonFiniteNumber(value)) return "JSON numbers must be finite."
  return new File([JSON.stringify(value)], "imported-data.json", { type: "application/json;charset=utf-8" })
}

/** Error message for a selected .json file, or null. The file itself is never rewritten. */
export async function checkJsonFile(file: File): Promise<string | null> {
  if (file.name.split(".").pop()?.toLowerCase() !== "json") return "Choose a JSON file."
  if (file.size === 0) return "File cannot be empty."
  if (file.size > MAX_UPLOAD_BYTES) return "File is larger than 10 MB. Choose a smaller JSON file."
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())
    JSON.parse(text)
    return null
  } catch {
    return "That file is not valid JSON."
  }
}
