import type { ReactNode, Ref } from "react"

type ReviewWorkspaceProps = {
  headingRef?: Ref<HTMLHeadingElement>
  title: ReactNode
  notice?: ReactNode
  actions?: ReactNode
  source: ReactNode
  output: ReactNode
  outputLabel?: string
}

// Presentation only: each workflow keeps its own result acquisition and retention rules.
export function ReviewWorkspace({ headingRef, title, notice, actions, source, output, outputLabel = "Review output" }: ReviewWorkspaceProps) {
  return <div className="document-view review-workspace-root">
    <h2 ref={headingRef} className="job-status-line" tabIndex={-1}><span role="status">{title}</span></h2>
    {(notice || actions) && <div className="review-workspace-meta">{notice}{actions}</div>}
    <section className="workspace-source" aria-label="Source document"><h3 className="workspace-panel-heading">Source document</h3>{source}</section>
    <section className="workspace-results" aria-label={outputLabel}><h3 className="workspace-panel-heading">{outputLabel}</h3>{output}</section>
  </div>
}
