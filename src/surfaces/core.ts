import type { Workflow, WorkflowId } from "@/lib/workflows"
import type { SurfaceConfig } from "./contract"

// Fail closed on unknown ids — including inherited Object.prototype keys like
// "__proto__" — by checking own properties only. Empty/absent selects the
// default surface from the supplied registry.
export function resolveSurface(id: string | undefined, surfaces: Record<string, SurfaceConfig>): SurfaceConfig {
  const key = id === undefined || id === "" ? "lawyerlab" : id
  if (!Object.hasOwn(surfaces, key)) throw new Error(`Unknown VITE_SURFACE "${id}"`)
  return surfaces[key]
}

/** Catalog workflows served by a surface, with copy overrides applied without widening capabilities or changing identity. */
export function enabledWorkflows(catalog: readonly Workflow[], surface: SurfaceConfig): Workflow[] {
  return catalog
    .filter((w) => surface.workflows.includes(w.id))
    .map((w) => {
      const override = surface.overrides?.[w.id]
      const { inputModes, ...copy } = override ?? {}
      return {
        ...w,
        ...copy,
        inputModes: inputModes === undefined ? w.inputModes : w.inputModes.filter((mode) => inputModes.includes(mode)),
        id: w.id,
        uploadId: w.uploadId,
      }
    })
}

export function findEnabledWorkflow(catalog: readonly Workflow[], surface: SurfaceConfig, id: WorkflowId | string | null | undefined): Workflow | undefined {
  // Disabled workflows stay listed for display ("launching soon") but are never routable.
  return enabledWorkflows(catalog, surface).find((w) => w.id === id && !w.disabled)
}