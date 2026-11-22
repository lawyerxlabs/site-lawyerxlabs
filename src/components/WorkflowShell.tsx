import type { ReactNode } from "react"
import { JobWorkflowPanel, type WorkflowPanelProps } from "@/components/JobWorkflowPanel"
import { WorkflowPage } from "@/components/WorkflowPage"
import type { Workflow } from "@/lib/workflows"

export type { WorkflowPanelProps }

type WorkflowShellProps<T> = {
  workflow: Workflow
  accepts: (result: T) => boolean
  children: (props: WorkflowPanelProps<T>) => ReactNode
}

// Common frame for every workflow; backend-specific lifecycle stays in its panel.
export function WorkflowShell<T>({ workflow, accepts, children }: WorkflowShellProps<T>) {
  return <WorkflowPage workflow={workflow} uploadLabel="Upload a document"><JobWorkflowPanel workflow={workflow} accepts={accepts}>{children}</JobWorkflowPanel></WorkflowPage>
}