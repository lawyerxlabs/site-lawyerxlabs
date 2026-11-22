// Session-lifetime cache with a fixed cap: the oldest-unused jobId is dropped
// when the cache is full. Reads promote recency so eviction follows actual use.
// Acceptable for a browser session; revisit if uploads grow unbounded.
const MAX_ENTRIES = 2
const entries = new Map<string, File>()

// Shown when a completed job has no in-session File (refresh, new tab, direct link). Product copy from #15 LL-5; pending approval.
export const SOURCE_SESSION_UNAVAILABLE =
  "Source preview is available only in the browser session where this file was uploaded. Derived output remains available until it expires."

function touch(jobId: string) {
  const file = entries.get(jobId)
  if (file) {
    entries.delete(jobId)
    entries.set(jobId, file)
  }
}

export function setSource(jobId: string, file: File): void {
  entries.delete(jobId)
  entries.set(jobId, file)
  while (entries.size > MAX_ENTRIES) {
    entries.delete(entries.keys().next().value as string)
  }
}

export function getSource(jobId: string): File | undefined {
  touch(jobId)
  return entries.get(jobId)
}

export function clearSource(jobId: string): void {
  entries.delete(jobId)
}
