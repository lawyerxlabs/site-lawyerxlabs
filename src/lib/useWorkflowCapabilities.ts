import { useEffect, useMemo, useRef, useState } from "react"
import { fetchWorkflowCapabilities, type WorkflowCapability } from "@/lib/api"
import type { InputMode, Workflow } from "@/lib/workflows"

type Catalog = readonly WorkflowCapability[]

// One request per session, shared by every page. A failed request settles as null (static fallback).
let request: Promise<Catalog | null> | undefined
let settled: Catalog | null | undefined
let refreshRequest: Promise<Catalog | null> | undefined

export function loadWorkflowCapabilities(): Promise<Catalog | null> {
  request ??= fetchWorkflowCapabilities().catch(() => null).then((catalog) => (settled = catalog))
  return request
}

export function refreshWorkflowCapabilities(): Promise<Catalog | null> {
  if (refreshRequest) return refreshRequest
  request = undefined
  settled = undefined
  refreshRequest = loadWorkflowCapabilities()
  const current = refreshRequest
  void current.finally(() => { if (refreshRequest === current) refreshRequest = undefined })
  return current
}

export function resetWorkflowCapabilitiesForTests() {
  request = undefined
  settled = undefined
  refreshRequest = undefined
}

/** Backend overlay. undefined = still loading (no sample tab until confirmed); null = static fallback. */
export function overlayCapability(workflow: Workflow, catalog: Catalog | null | undefined): Workflow {
  if (catalog === null || workflow.backendId === null) return workflow
  if (catalog === undefined) return { ...workflow, samples: [] }
  const capability = catalog.find((c) => c.id === workflow.backendId)
  // Not in the backend catalog: no input mode left, so intake shows its existing "needs an update" state.
  if (!capability) return { ...workflow, inputModes: [], samples: [] }
  const modes = capability.intake_modes
  const inputModes: InputMode[] = []
  if (modes.includes("file") && workflow.inputModes.includes("file")) inputModes.push("file")
  if (modes.includes("text") && workflow.inputModes.includes("text")) inputModes.push("text")
  // Backend never offers json; local JSON import survives only where the static catalog has it.
  if (workflow.inputModes.includes("json")) inputModes.push("json")
  // Static restriction (e.g. contract-review PDF/DOCX only) caps whatever the backend advertises.
  const accepted = workflow.acceptedFileTypes
  return {
    ...workflow,
    inputModes,
    samples: modes.includes("sample") ? workflow.samples : [],
    acceptedFileTypes: accepted ? capability.accepted_file_types.filter((t) => accepted.includes(t)) : capability.accepted_file_types,
    handling: workflow.handling?.capability === "fixed" ? workflow.handling : capability.handling,
  }
}

export function handlingCapabilityStatus(workflow: Workflow, catalog: Catalog | null | undefined): { status: "checking" | "unavailable" | "ready" | "notApplicable"; handling?: WorkflowCapability["handling"] } {
  if (workflow.backendId === null) return { status: "notApplicable" }
  if (catalog === undefined) return { status: "checking" }
  if (catalog === null) return { status: "unavailable" }
  const capability = catalog.find((item) => item.id === workflow.backendId)
  if (!capability || capability.handling.capability === "none") return { status: "unavailable" }
  if (workflow.id !== "docalias" && workflow.id !== "agreement-review" && workflow.id !== "hiring-package" && capability.identity_requirement !== "protected") return { status: "unavailable" }
  if (capability.pii_profile !== (workflow.id === "docalias" ? "public-redaction" : "protected-document")) return { status: "unavailable" }
  const fixed = workflow.handling
  // Onboarding always submits Redact in its dedicated multipart request and
  // verifies the response. It is safe to offer that workflow only when the
  // backend supports Redact and its default also resolves to Redact.
  if (workflow.id === "hr-onboarding") {
    if (capability.handling.default !== "redact" || !capability.handling.choices.includes("redact")) return { status: "unavailable" }
    return { status: "ready", handling: fixed }
  }
  if (fixed?.capability === "fixed" && (capability.handling.capability !== "fixed"
    || fixed.default !== capability.handling.default
    || fixed.choices.length !== capability.handling.choices.length
    || fixed.choices.some((choice) => !capability.handling.choices.includes(choice)))) return { status: "unavailable" }
  return { status: "ready", handling: fixed?.capability === "fixed" ? fixed : capability.handling }
}

/** Who may open a workflow. Backend-backed entries use the validated capability; presentation-only ones are static members-only. */
export function identityRequirement(workflow: Workflow, catalog: Catalog | null | undefined): "public" | "protected" {
  if (workflow.backendId === null) return "protected"
  return catalog?.find((c) => c.id === workflow.backendId)?.identity_requirement ?? "protected"
}

/** False only after a successful catalog omits the workflow. Loading and fallback (undefined/null) keep it listed. */
export function isListed(workflow: Workflow, catalog: Catalog | null | undefined): boolean {
  if (!catalog || workflow.backendId === null) return true
  return catalog.some((c) => c.id === workflow.backendId)
}

/** A job panel may only mount when its declared result endpoint is available. */
export function hasResult(workflow: Workflow, result: keyof WorkflowCapability["results"], catalog: Catalog | null | undefined): boolean {
  if (workflow.backendId === null || catalog === null) return true
  return catalog === undefined || catalog.find((capability) => capability.id === workflow.backendId)?.results[result] === true
}

export function useWorkflowCatalog(): Catalog | null | undefined {
  const [catalog, setCatalog] = useState(settled)
  useEffect(() => {
    let live = true
    // Refresh on each effect setup. React Strict Mode runs setup, cleanup,
    // setup in development; a ref guard here would cancel the only live load.
    void refreshWorkflowCapabilities().then((next) => { if (live) setCatalog(next) })
    return () => { live = false }
  }, [])
  return catalog
}

export function useResolvedWorkflow<T extends Workflow | undefined>(workflow: T): T {
  const catalog = useWorkflowCatalog()
  return useMemo(() => (workflow && overlayCapability(workflow, catalog)) as T, [workflow, catalog])
}
