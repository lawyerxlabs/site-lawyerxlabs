import { describe, expect, it } from "vitest"
import { CATALOG } from "@/lib/workflows"

// Presentation invariants from ADR 0006. A new workflow entry that breaks one of these fails here, not in production.
describe("static workflow catalog invariants", () => {
  it("has unique ids", () => {
    const ids = CATALOG.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("maps backend-backed workflows to a backend id", () => {
    for (const w of CATALOG) {
      if (w.backendId !== null) expect(w.backendId, `${w.id} backendId`).toMatch(/^[a-z][a-z0-9-]+$/)
    }
  })

  it("never shares a backend id between workflows", () => {
    const ids = CATALOG.map((w) => w.backendId).filter((id): id is string => id !== null)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("only declares known input modes", () => {
    for (const w of CATALOG) for (const m of w.inputModes) expect(["file", "text", "json", "sample"], `${w.id} mode ${m}`).toContain(m)
  })
})
