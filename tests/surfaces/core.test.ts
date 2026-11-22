import { describe, expect, it } from "vitest"
import { CATALOG, type Workflow } from "@/lib/workflows"
import type { SurfaceConfig } from "@/surfaces/contract"
import { enabledWorkflows, findEnabledWorkflow, resolveSurface } from "@/surfaces/core"
import { SURFACES, lawyerlab, signalLawyers } from "@/surfaces"

const catalog = [
  { id: "docalias", label: "A", description: "a", action: "Alias", icon: "FileKey2", disabled: false, samples: [], options: [], guide: [] },
  { id: "contract-review", label: "B", description: "b", action: "Review", icon: "FileSearch", disabled: false, samples: [], options: [], guide: [] },
  { id: "lease-review", label: "C", description: "c", action: "Review", icon: "SearchCheck", disabled: false, samples: [], options: [], guide: [] },
] as unknown as Workflow[]

describe("resolveSurface", () => {
  it("empty or absent id selects lawyerlab", () => {
    expect(resolveSurface(undefined, SURFACES)).toBe(lawyerlab)
    expect(resolveSurface("", SURFACES)).toBe(lawyerlab)
  })

  it("unknown id throws", () => {
    expect(() => resolveSurface("nope", SURFACES)).toThrow(/Unknown VITE_SURFACE/)
  })

  it("inherited Object.prototype keys throw rather than fail open", () => {
    for (const id of ["__proto__", "constructor", "toString"]) {
      expect(() => resolveSurface(id, SURFACES)).toThrow(/Unknown VITE_SURFACE/)
    }
  })

  it("resolves through the supplied registry", () => {
    const custom = { custom: { id: "custom", name: "C", home: "/", workflows: [], copy: { workflowEyebrow: "", disclaimer: "" } } }
    expect(resolveSurface("custom", custom as typeof SURFACES).id).toBe("custom")
    expect(() => resolveSurface(undefined, custom as typeof SURFACES)).toThrow()
  })
})

describe("enabledWorkflows", () => {
  it("keeps only surface workflows and applies overrides", () => {
    const surface = { ...signalLawyers, workflows: ["docalias", "contract-review"], overrides: { "contract-review": { label: "Override", description: "o" } } } as unknown as SurfaceConfig
    const out = enabledWorkflows(catalog, surface)
    expect(out.map((w) => w.id)).toEqual(["docalias", "contract-review"])
    expect(out[0].id).toBe("docalias")
    expect(out[1].label).toBe("Override")
    expect(out[1].id).toBe("contract-review")
    expect(out[1].description).not.toBe(catalog[1].description)
  })

  it("does not mutate the catalog", () => {
    enabledWorkflows(catalog, signalLawyers)
    expect(catalog[1].label).toBe("B")
  })

  it("override samples replace the workflow samples while label/description survive", () => {
    const out = enabledWorkflows(catalog, {
      id: "signal-lawyers",
      name: "SL",
      home: "/",
      icon: "x",
      workflows: ["docalias", "contract-review"],
      copy: { workflowEyebrow: "", disclaimer: "" },
      overrides: {
        "contract-review": {
          label: "B",
          description: "b",
          samples: [{ label: "New sample", url: "/tests/fixtures/x.docx", filename: "x.docx" }],
        },
      },
    } as unknown as SurfaceConfig)
    expect(out[1].samples).toEqual([{ label: "New sample", url: "/tests/fixtures/x.docx", filename: "x.docx" }])
    expect(out[1].label).toBe("B")
    expect(out[1].description).toBe("b")
    expect(out[1].id).toBe("contract-review")
  })
})

describe("findEnabledWorkflow", () => {
  it("returns undefined for workflows the surface disables", () => {
    expect(findEnabledWorkflow(catalog, signalLawyers, "lease-review")).toBeUndefined()
    expect(findEnabledWorkflow(catalog, signalLawyers, null)).toBeUndefined()
  })

  it("returns the enabled workflow", () => {
    expect(findEnabledWorkflow(catalog, lawyerlab, "docalias")?.id).toBe("docalias")
  })
})

describe("workflow inputModes", () => {
  it("session workflows expose their supported source modes", () => {
    expect(CATALOG.length).toBeGreaterThan(0)
    for (const w of CATALOG) expect(w.inputModes, w.id).toEqual(["hr-hiring", "hiring-package", "transaction-review"].includes(w.id) ? ["file", "text"] : ["file"])
  })

  it("json is absent by default; text is limited to supported sessions", () => {
    for (const w of CATALOG) {
      expect(w.inputModes).not.toContain("json")
      if (!["hr-hiring", "hiring-package", "transaction-review"].includes(w.id)) expect(w.inputModes).not.toContain("text")
    }
  })

  it("a surface override restricts inputModes to the intersection with the catalog and leaves other fields intact", () => {
    const out = enabledWorkflows(catalog.map((w) => ({ ...w, inputModes: ["file", "json"] })) as Workflow[], {
      id: "custom",
      name: "C",
      home: "/",
      icon: "x",
      workflows: ["contract-review"],
      copy: { workflowEyebrow: "", disclaimer: "" },
      overrides: { "contract-review": { inputModes: ["file", "text"] } },
    } as unknown as SurfaceConfig)
    expect(out[0].inputModes).toEqual(["file"])
    expect(out[0].label).toBe("B")
    expect(out[0].description).toBe("b")
    expect(out[0].samples).toEqual([])
  })
})
