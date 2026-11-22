import { useEffect, useRef, type ReactNode } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { Shell } from "@/components/Shell"
import { WorkflowPage } from "@/components/WorkflowPage"
import { WorkflowShell } from "@/components/WorkflowShell"
import { hasResult, isListed, identityRequirement, useResolvedWorkflow, useWorkflowCatalog } from "@/lib/useWorkflowCapabilities"
import { useTier } from "@/lib/useTier"
import { WORKFLOW_PANELS } from "@/lib/workflowPanels"
import { getRoutableWorkflow, getWorkflow, WORKFLOWS, type Workflow, type WorkflowId } from "@/lib/workflows"

export function Playground() {
  return <CatalogPlayground />
}

// Permanent gate heading. Focuses when it replaces prior content after the first Playground commit, never on initial render.
function Gate({ heading, focus, children }: { heading: string; focus: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  // Runs on mount and whenever the message changes; `focus` is the render-time snapshot, so [heading] is the intended trigger.
  useEffect(() => { if (focus) ref.current?.focus() }, [heading])
  return <div className="playground-empty"><h2 ref={ref} tabIndex={-1}>{heading}</h2>{children}</div>
}

function CatalogPlayground() {
  const [searchParams] = useSearchParams()
  const requestedId = searchParams.get("workflow")
  // Legacy ?workflow=prepare-doc links resolve to docalias; any other unknown id stays unavailable.
  const requested = getRoutableWorkflow(requestedId === "prepare-doc" ? "docalias" : requestedId as WorkflowId | null)
  const displayWorkflow = getWorkflow(requestedId)
  const catalog = useWorkflowCatalog()
  const unknownWorkflow = !requested && !displayWorkflow && searchParams.has("workflow")
  const workflow = useResolvedWorkflow(requested ?? displayWorkflow ?? WORKFLOWS[0])
  // Dropped from the backend catalog (successful fetch only): same unavailable state as an unknown id.
  const unlisted = !isListed(workflow, catalog)
  const entry = WORKFLOW_PANELS[workflow.id]
  const agreement = workflow.id === "agreement-review" ? catalog?.find((capability) => capability.id === workflow.backendId) : undefined
  const incompatibleAgreement = workflow.id === "agreement-review" && (!agreement || agreement.identity_requirement !== "public" || agreement.pii_profile !== "protected-document" || agreement.handling.capability !== "fixed" || agreement.handling.default !== "pseudonymise" || agreement.handling.choices.length !== 1 || agreement.handling.choices[0] !== "pseudonymise" || !agreement.results.artifact || !agreement.intake_modes.includes("file") || !agreement.accepted_file_types.some((type) => type === ".pdf" || type === ".docx"))
  const unsupportedResult = incompatibleAgreement || entry?.kind === "job" && !hasResult(workflow, entry.result, catalog)
  const { signedIn, ready } = useTier()
  // Protected workflows mount no shell (uploads, job polling) until auth resolves: pending while unknown, gated if signed out.
  const protectedWorkflow = identityRequirement(workflow, catalog) === "protected"
  const pending = protectedWorkflow && !ready
  const locked = protectedWorkflow && ready && !signedIn
  // False only during the first commit, so the initial gate doesn't steal focus; later gates take it.
  const committed = useRef(false)
  const focusGate = committed.current
  useEffect(() => { committed.current = true }, [])
  // location.key changes on every navigation, including a same-URL "Alias document" Link, so workflow state remounts.
  const { key: navKey } = useLocation()

  return (
    <Shell workflowId={unknownWorkflow || unlisted ? undefined : workflow.id}>
      {unknownWorkflow ? (
        <WorkflowPage workflow={workflow} uploadLabel={`${workflow.label} unavailable`}>
          <Gate heading="Workflow unavailable" focus={focusGate}><p>This workflow does not exist.</p></Gate>
        </WorkflowPage>
      ) : workflow.disabled ? (
        <WorkflowPage workflow={workflow} uploadLabel={`${workflow.label} unavailable`}>
          <Gate heading="Launching soon" focus={focusGate}><p>{workflow.description}</p></Gate>
        </WorkflowPage>
      ) : unlisted ? (
        <WorkflowPage workflow={workflow} uploadLabel={`${workflow.label} unavailable`}>
          <Gate heading="Workflow unavailable" focus={focusGate}><p>{workflow.description}</p></Gate>
        </WorkflowPage>
      ) : unsupportedResult ? (
        <WorkflowPage workflow={workflow} uploadLabel={`${workflow.label} unavailable`}>
          <Gate heading="Workflow unavailable" focus={focusGate}><p>{workflow.description}</p></Gate>
        </WorkflowPage>
      ) : pending ? (
        <div className="playground-empty" role="status"><p>Checking your session…</p></div>
      ) : locked ? (
        <WorkflowPage workflow={workflow} uploadLabel={`${workflow.label} requires sign-in`}>
          <Gate heading="Sign in to use this workflow" focus={focusGate}><p>Workspace workflows require sign in.</p></Gate>
        </WorkflowPage>
      ) : entry?.kind === "own-frame" ? (
        <entry.Page key={`${workflow.id}:${navKey}`} workflow={workflow} />
      ) : entry?.kind === "job" ? (
        // key resets lifecycle state when switching workflows or re-entering the same URL
        <WorkflowShell key={`${workflow.id}:${navKey}`} workflow={workflow} accepts={entry.accepts}>{(props) => <entry.Panel {...props} />}</WorkflowShell>
      ) : (
        <WorkflowPage workflow={workflow} uploadLabel={`${workflow.label} unavailable`}>
          <Gate heading="Workflow unavailable" focus={focusGate}><p>{workflow.description}</p></Gate>
        </WorkflowPage>
      )}
    </Shell>
  )
}
