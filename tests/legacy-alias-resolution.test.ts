import { describe, expect, it } from "vitest"
import { getWorkflow } from "@/lib/workflows"

describe("legacy alias workflow ids", () => {
  it("resolves prepare-doc and alias-doc to the docalias workflow", () => {
    expect(getWorkflow("prepare-doc")?.id).toBe("docalias")
    expect(getWorkflow("alias-doc")?.id).toBe("docalias")
  })

  it("does not resolve near-miss legacy ids", () => {
    expect(getWorkflow("prepare-docx")).toBeUndefined()
    expect(getWorkflow("alias-docs")).toBeUndefined()
  })
})
