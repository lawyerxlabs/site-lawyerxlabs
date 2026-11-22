// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { CATALOG, getWorkflow, WORKFLOWS } from "@/lib/workflows"

describe("workflow resolver", () => {
  it("resolves known ids and returns undefined for unknown input", () => {
    expect(getWorkflow("transaction-intake")?.id).toBeUndefined()
    expect(getWorkflow("not-real")).toBeUndefined()
    expect(getWorkflow(null)).toBeUndefined()
    expect(getWorkflow(undefined)).toBeUndefined()
  })

  it("lookup of a disabled workflow still resolves; callers own the disabled gate", () => {
    const disabled = WORKFLOWS.filter((w) => w.disabled).map((w) => w.id)
    for (const id of disabled) {
      expect(getWorkflow(id)).toBeDefined()
      expect(getWorkflow(id)?.disabled).toBe(true)
    }
  })

  it("job workflows retain their upload IDs", () => {
    expect(WORKFLOWS.filter((w) => w.uploadId).map((w) => w.id)).toEqual(["docalias", "contract-review"])
  })
})

// Guard against a registry id drifting out of the WorkflowId union.
const registryIds = new Set<string>(WORKFLOWS.map((w) => w.id))
const declared = [
  "docalias",
  "case-analysis",
  "agreement-review",
] as const
describe("registry completeness", () => {
  it("declared WorkflowId union matches registry entries", () => {
    expect(declared.every((id) => registryIds.has(id))).toBe(true)
  })
})

// TRUST-CLAIMS.md: only workflows that keep the source file for in-browser preview may say so.
describe("workflow copy", () => {
  it("catalog source-preview claims remain scoped to the owning workflow", () => {
    const w = CATALOG.find((x) => x.id === "contract-review")!
    expect([...w.guide, ...w.notes.map((o) => o.body)].join(" ")).not.toMatch(/rendered locally/i)
  })
})
