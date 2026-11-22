// @vitest-environment jsdom
// Resolver invariants at the core seam (injected catalog + surfaces).
import { describe, expect, it } from "vitest"
import { CATALOG, type Workflow, type WorkflowId } from "@/lib/workflows"
import { WORKFLOW_PANELS } from "@/lib/workflowPanels"
import { SURFACES } from "@/surfaces"
import { enabledWorkflows, findEnabledWorkflow } from "@/surfaces/core"
import type { SurfaceConfig } from "@/surfaces/contract"

const base = SURFACES.lawyerlab
const withSurface = (patch: Partial<SurfaceConfig>): SurfaceConfig => ({ ...base, ...patch })
const byId = (id: WorkflowId): Workflow => CATALOG.find((w) => w.id === id)!
type Override = NonNullable<SurfaceConfig["overrides"]>[WorkflowId]

describe("resolver invariants: surface membership", () => {
  it("explicit empty intersection fails closed (no workflows, no route, no file fallback)", () => {
    const s = withSurface({ workflows: [] })
    expect(enabledWorkflows(CATALOG, s)).toEqual([])
    expect(findEnabledWorkflow(CATALOG, s, "docalias")).toBeUndefined()
    expect(findEnabledWorkflow(CATALOG, s, null)).toBeUndefined()
  })

  it("workflows omitted from a surface are neither exposed nor routable", () => {
    const s = withSurface({ workflows: ["docalias"] })
    expect(enabledWorkflows(CATALOG, s).map((w) => w.id)).toEqual(["docalias"])
    expect(findEnabledWorkflow(CATALOG, s, "agreement-review")).toBeUndefined()
  })

  // Disabled stays listed for display, but routing never resolves it.
  it("disabled catalog workflows are not routable through a surface", () => {
    const s = withSurface({ workflows: ["case-analysis"] })
    expect(findEnabledWorkflow(CATALOG, s, "case-analysis")).toBeUndefined()
  })
})

describe("resolver invariants: input modes and backend identity", () => {
  // Overrides may restrict inputModes but never widen them.
  it("surface overrides cannot widen catalog inputModes", () => {
    const s = withSurface({ overrides: { docalias: { inputModes: ["file", "text", "json"] } } })
    expect(findEnabledWorkflow(CATALOG, s, "docalias")?.inputModes).toEqual(byId("docalias").inputModes)
  })

  // Catalog identity wins over any override-supplied id/uploadId.
  it("catalog backend identity (id, uploadId) cannot be overridden", () => {
    const hostile = { id: "docalias", uploadId: "hijack" } as unknown as Override
    const s = withSurface({ overrides: { docalias: hostile } })
    const w = findEnabledWorkflow(CATALOG, s, "docalias")
    expect(w?.id).toBe("docalias")
    expect(w?.backendId).toBe("docalias")
  })
})

describe("resolver invariants: panel binding", () => {
  it("every enabled, non-disabled workflow on every shipped surface has a panel binding", () => {
    for (const s of Object.values(SURFACES)) {
      for (const w of enabledWorkflows(CATALOG, s)) {
        if (w.disabled) continue
        expect(WORKFLOW_PANELS[w.id], `${s.id}:${w.id}`).toBeDefined()
      }
    }
  })
})

describe("resolver invariants: samples are surface-scoped", () => {
  it("a surface override does not bleed into the catalog or other surfaces", () => {
    const original = structuredClone(byId("docalias").samples)
    const injected = [{ label: "Injected", url: "/tests/fixtures/x.pdf", filename: "x.pdf" }]
    const s = withSurface({ overrides: { docalias: { samples: injected } } })
    expect(findEnabledWorkflow(CATALOG, s, "docalias")?.samples).toEqual(injected)
    expect(byId("docalias").samples).toEqual(original)
    expect(findEnabledWorkflow(CATALOG, base, "docalias")?.samples).toEqual(original)
  })

  it("shipped surfaces serve catalog samples unchanged for every shared workflow", () => {
    for (const s of Object.values(SURFACES)) {
      for (const w of enabledWorkflows(CATALOG, s)) expect(w.samples, `${s.id}:${w.id}`).toEqual(byId(w.id).samples)
    }
  })
})
