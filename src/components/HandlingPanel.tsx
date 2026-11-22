import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react"
import { AlertTriangle, LockKeyhole, ScanText } from "lucide-react"
import { useHandlingContext } from "@/lib/handlingContext"
import type { Workflow } from "@/lib/workflows"

export type Panel = "options" | "guide"

const CHOICE_LABELS: Record<string, string> = {
  redact: "Redact",
  reject: "Reject",
  off: "Off",
  pseudonymise: "Pseudonymize",
}
const CHOICE_DESCRIPTIONS: Record<string, string> = {
  redact: "Replace detected personal information with placeholders before processing.",
  reject: "Reject the source when screening detects personal information.",
  off: "Do not replace detected personal information before processing.",
  pseudonymise: "Replace detected identifiers with tokens for this workflow's protected processing.",
}
const OFF_WARNING = "Personal information may remain in the material processed by this tool."

export function HandlingPanel({ workflow, panel, onPanelChange, optionsSlot, focusOptionsRequest = 0, handlingStatus = "ready" }: { workflow: Workflow; panel: Panel; onPanelChange: (panel: Panel) => void; optionsSlot?: ReactNode; focusOptionsRequest?: number; handlingStatus?: "checking" | "unavailable" | "ready" | "notApplicable" }) {
  const refs = { options: useRef<HTMLButtonElement>(null), guide: useRef<HTMLButtonElement>(null) }
  const groupRef = useRef<HTMLFieldSetElement>(null)
  const { handling: cap } = workflow
  // Options tab is shown only when there is something to choose or an optionsSlot.
  const hasOptions = (cap?.capability === "selectable") || optionsSlot != null
  const { selected, setSelected, runPrepared, submissionPending } = useHandlingContext()

  useEffect(() => {
    if (focusOptionsRequest > 0 && panel === "options") groupRef.current?.focus()
  }, [focusOptionsRequest, panel])

  function select(next: Panel) {
    onPanelChange(next)
    refs[next].current?.focus()
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!hasOptions) return
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); select(panel === "guide" ? "options" : "guide") }
    if (event.key === "Home") { event.preventDefault(); select("guide") }
    if (event.key === "End") { event.preventDefault(); select("options") }
  }
  const panels: Panel[] = hasOptions ? ["guide", "options"] : ["guide"]

  return (
    <>
      <h2 className="upload-aside-title"><ScanText size={15} aria-hidden="true" /> {workflow.label}</h2>
      <div className="handling-tabs" role="tablist" aria-label={`${workflow.label} guide and options`}>
        {panels.map((id) => (
          <button key={id} ref={refs[id]} type="button" role="tab" id={`handling-tab-${id}`} aria-selected={panel === id} aria-controls={`handling-panel-${id}`} tabIndex={panel === id ? 0 : -1} className={panel === id ? "active" : ""} onClick={() => select(id)} onKeyDown={onKeyDown}>
            {id === "guide" ? "Guide" : "Options"}
          </button>
        ))}
      </div>
      {panels.map((id) => (
        <div key={id} id={`handling-panel-${id}`} role="tabpanel" aria-labelledby={`handling-tab-${id}`} hidden={panel !== id}>
          {workflow.disabled ? (
            <div className="workflow-guide"><p><AlertTriangle size={15} aria-hidden="true" /> This workflow is not available yet.</p></div>
          ) : id === "options" && handlingStatus !== "ready" && handlingStatus !== "notApplicable" ? (
            <section className="workflow-guide" aria-live="polite">
              <p>{handlingStatus === "checking" ? "Checking available handling options…" : "Handling options are unavailable. Reload before submitting another source."}</p>
            </section>
          ) : id === "guide" ? (
            <section className="workflow-guide">
              {workflow.guide.map((line, i) => <p key={line} className={i === workflow.guide.length - 1 ? "upload-aside-note" : undefined}>{line}</p>)}
              {cap?.capability === "fixed" && cap.default && (workflow.id === "hr-onboarding"
                ? <p>At intake, screening checks each source's extracted text for personal information. Redact retains screened facts and their source locations; screening can miss sensitive values. Review the source documents and generated checklist—employers must confirm each task. This frontend requests Redact and displays a prepared source only after the server confirms Redact. The backend may support other choices; this workflow does not offer them.</p>
                : <p>{handlingStatus === "ready"
                  ? `The backend confirms personal information handling is fixed at ${CHOICE_LABELS[cap.default] ?? cap.default} for this workflow.`
                  : `This workflow's local definition lists ${CHOICE_LABELS[cap.default] ?? cap.default} handling, but backend confirmation is ${handlingStatus === "checking" ? "still pending" : "unavailable"}.`}{" "}Replacing a source clears current work.</p>)}
            </section>
          ) : (
            <>
              {cap?.capability === "selectable" && (
                <fieldset ref={groupRef} tabIndex={-1} className="handling-picker">
                  <legend>Personal information handling</legend>
                  {submissionPending && <p>This choice is being submitted and cannot be changed while the request is pending.</p>}
                  {runPrepared && <p>This choice applies to the prepared source and cannot be changed.</p>}
                  {cap.choices.map((choice) => {
                    const descriptionId = `handling-description-${choice}`
                    const warningId = `handling-warning-${choice}`
                    const offWarning = choice === "off" && selected === "off"
                      ? `${OFF_WARNING}${workflow.id === "hr-hiring" ? " Screening still rejects prohibited identifiers and sources with too many detected people. Use only synthetic or sanitised documents." : ""}`
                      : null
                    return <div key={choice} className="handling-choice">
                      <label htmlFor={`handling-choice-${choice}`}>
                      <input
                        id={`handling-choice-${choice}`}
                        type="radio"
                        name="handling"
                        value={choice}
                        checked={selected === choice}
                        aria-describedby={`${descriptionId}${offWarning ? ` ${warningId}` : ""}`}
                        disabled={runPrepared || submissionPending}
                        onChange={() => setSelected(choice)}
                      />
                      {CHOICE_LABELS[choice] ?? choice}</label>
                      <p id={descriptionId}>{CHOICE_DESCRIPTIONS[choice] ?? "Use the handling specified by this workflow."}</p>
                      {offWarning && <p id={warningId} role="note" className="handling-warning"><AlertTriangle size={15} aria-hidden="true" /> {offWarning}</p>}
                    </div>
                  })}
                </fieldset>
              )}
              {optionsSlot}
            </>
          )}
        </div>
      ))}
      {!workflow.disabled && workflow.notes.length > 0 && <section className="handling-trust" aria-labelledby="handling-trust-title">
        <h3 id="handling-trust-title">Trust centre</h3>
        <ul className="handling-list">{workflow.notes.map(({ title, body }) => <li key={title}><span className="handling-list-icon" aria-hidden="true"><LockKeyhole size={16} /></span><div><h4>{title}</h4><p>{body}</p></div></li>)}</ul>
      </section>}
    </>
  )
}
