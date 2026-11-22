import { useEffect, useRef, useState, type ReactNode } from "react"
import { FileUp } from "lucide-react"
import { HandlingPanel, type Panel } from "@/components/HandlingPanel"
import { HandlingContext, type Choice } from "@/lib/handlingContext"
import { useTier } from "@/lib/useTier"
import { handlingCapabilityStatus, identityRequirement, overlayCapability, refreshWorkflowCapabilities, useWorkflowCatalog } from "@/lib/useWorkflowCapabilities"
import type { Workflow } from "@/lib/workflows"
import { surface } from "@/surface"

type WorkflowPageProps = {
  workflow: Workflow
  uploadLabel: string
  children: ReactNode
  // Extra Options-tab content owned by the page (e.g. TransactionReview template select).
  optionsSlot?: ReactNode
}

export function WorkflowPage({ workflow, uploadLabel, children, optionsSlot }: WorkflowPageProps) {
  const { me, signedIn, identity } = useTier()
  const identityKey = JSON.stringify(identity)
  const authRef = useRef({ signedIn, identityKey, revision: 0 })
  if (authRef.current.signedIn !== signedIn || authRef.current.identityKey !== identityKey) {
    authRef.current = { signedIn, identityKey, revision: authRef.current.revision + 1 }
  }
  const [panel, setPanel] = useState<Panel>("guide")
  const [focusOptionsRequest, setFocusOptionsRequest] = useState(0)
  const [picked, setPicked] = useState<Choice | null>(null)
  const [runHandling, setRunHandling] = useState<Choice | undefined>()
  const [runPrepared, setRunPrepared] = useState(false)
  const [pendingHandling, setPendingHandling] = useState<Choice | undefined>()
  const [selectionInvalidated, setSelectionInvalidated] = useState(false)
  const resolvedCapability = useRef(false)
  const initialCatalog = useWorkflowCatalog()
  const [catalog, setCatalog] = useState(initialCatalog)
  useEffect(() => { setCatalog(initialCatalog) }, [initialCatalog])
  const capability = handlingCapabilityStatus(workflow, catalog)
  const resolvedWorkflow = overlayCapability(workflow, catalog)
  const cap = capability.handling ?? workflow.handling
  const protectedWorkflow = identityRequirement(workflow, catalog) === "protected"
  const selected = runHandling ?? (!selectionInvalidated && picked && cap?.choices.includes(picked) ? picked : null)
  const selectionValid = cap?.capability !== "selectable" || (selected !== null && cap.choices.includes(selected))
  const submitted = capability.status === "ready" && cap?.capability === "selectable" && selectionValid && selected ? selected : undefined
  const setSelected = (choice: Choice) => { setSelectionInvalidated(false); setPicked(choice) }
  const validateIntake = async () => {
    if (workflow.backendId === null) return { valid: true, submitted }
    const authAtStart = authRef.current
    setCatalog(undefined)
    const latest = await refreshWorkflowCapabilities()
    setCatalog(latest)
    if (authAtStart.revision !== authRef.current.revision) return { valid: false }
    const fresh = handlingCapabilityStatus(workflow, latest)
    if (fresh.status !== "ready") return { valid: false }
    if (fresh.handling?.capability === "selectable") {
      return { valid: !!selected && fresh.handling.choices.includes(selected), submitted: selected ?? undefined }
    }
    return { valid: submitted === undefined && fresh.handling?.default === cap?.default, submitted: undefined }
  }
  const handling = {
    selected: runPrepared ? runHandling ?? selected : pendingHandling ?? selected,
    setSelected: (choice: Choice) => { if (!runPrepared && pendingHandling === undefined) setSelected(choice) },
    runPrepared,
    submissionPending: pendingHandling !== undefined,
    submitted,
    beginSubmission: (choice?: Choice) => setPendingHandling(choice ?? selected ?? undefined),
    cancelSubmission: () => setPendingHandling(undefined),
    freezeRun: (choice?: Choice) => { setRunHandling(choice ?? pendingHandling ?? selected ?? undefined); setPendingHandling(undefined); setRunPrepared(true) },
    clearRun: () => { setRunHandling(undefined); setPendingHandling(undefined); setRunPrepared(false) },
    validateIntake,
  }
  const handlingReady = (runPrepared || capability.status === "ready" || capability.status === "notApplicable") && (runPrepared || selectionValid)
  const openOptions = () => { setPanel("options"); setFocusOptionsRequest((n) => n + 1) }

  useEffect(() => {
    if (capability.status !== "ready") return
    if (!resolvedCapability.current) {
      resolvedCapability.current = true
      setPicked(cap?.default ?? null)
      return
    }
    if (picked && !cap?.choices.includes(picked)) { setPicked(null); setSelectionInvalidated(true) }
  }, [capability.status, cap, picked])

  return (
    <HandlingContext.Provider value={handling}>
      <div className="playground-heading">
        <span className="playground-eyebrow"><FileUp size={13} aria-hidden="true" /> {surface.copy.workflowEyebrow}</span>
        <h1>{workflow.label}</h1>
        <p>{workflow.description}</p>
      </div>

      <div className="upload-layout">
        <section className="upload-column" aria-label={uploadLabel}>
          {/* Native fieldset disables every control inside (file input, sample, submit) when signed out. Alias stays open to guests. */}
          <fieldset className="workflow-gate" disabled={(!signedIn && protectedWorkflow) || (!runHandling && !handlingReady)}>{children}</fieldset>
          {workflow.backendId !== null && (
            <section className="handling-summary" aria-label="Selected personal information handling">
              {runPrepared ? <p>Personal information handling for this prepared source: {handlingLabel(runHandling ?? cap?.default ?? "redact")}. New sources use current handling options.</p>
                : pendingHandling !== undefined ? <p>Submitting source with personal information handling: {handlingLabel(pendingHandling)}.</p>
                : capability.status === "checking" ? <p role="status">Checking available handling options…</p>
                : capability.status === "unavailable" ? <p role="alert">Handling options are unavailable. Reload before submitting another source.</p>
                : cap?.capability === "selectable" && !selectionValid ? <p role="alert">Handling options changed. Review the available choices before submitting. <button type="button" className="handling-summary-change" onClick={openOptions}>Review options</button></p>
                : cap?.capability === "selectable" ? <p>Personal information handling: {selected ? handlingLabel(selected) : "Choose an option"}. <button type="button" className="handling-summary-change" onClick={openOptions}>Change</button></p>
                : workflow.id === "hr-onboarding" ? <p>Personal information handling: Redact (this workflow requests Redact and verifies the server response).</p>
                  : <p>Personal information handling: {cap?.default ? handlingLabel(cap.default) : "Unavailable"} (fixed for this workflow).</p>}
              {(runPrepared ? runHandling : pendingHandling ?? selected) === "off" && <p className="handling-summary-warning">Personal information may remain in the material processed by this tool.{workflow.id === "hr-hiring" ? " Screening still rejects prohibited identifiers and sources with too many detected people. Use only synthetic or sanitised documents." : ""}</p>}
            </section>
          )}
        </section>
        <aside className="upload-aside" aria-label="How this tool works">
          <HandlingPanel workflow={resolvedWorkflow} panel={panel} onPanelChange={setPanel} optionsSlot={optionsSlot} focusOptionsRequest={focusOptionsRequest} handlingStatus={capability.status} />
          <p className="surface-disclaimer">{surface.copy.disclaimer}</p>
          {!signedIn && me?.tier === "anonymous" && (
            <p className="tier-notice">Public limits — {me.quota.limit} documents per day.</p>
          )}
        </aside>
      </div>
    </HandlingContext.Provider>
  )
}

function handlingLabel(choice: Choice): string {
  return choice === "pseudonymise" ? "Pseudonymize" : choice === "redact" ? "Redact" : choice === "reject" ? "Reject" : "Off"
}
