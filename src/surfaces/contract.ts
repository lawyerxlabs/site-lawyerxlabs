import type { Workflow, WorkflowId } from "@/lib/workflows"

export type LlTokenName =
  | "--ll-primary"
  | "--ll-primary-pressed"
  | "--ll-accent"
  | "--ll-ink"
  | "--ll-ink-2"
  | "--ll-ink-3"
  | "--ll-ink-4"
  | "--ll-muted"
  | "--ll-page"
  | "--ll-surface"
  | "--ll-surface-2"
  | "--ll-surface-3"
  | "--ll-rule"
  | "--ll-hairline"
  | "--ll-border"
  | "--ll-focus-ring"
  | "--ll-danger"
  | "--ll-danger-pressed"
  | "--ll-info-surface"
  | "--ll-warn-surface"
  | "--ll-warn-border"
  | "--ll-warn-ink"
  | "--ll-ok-surface"
  | "--ll-ok-border"
  | "--ll-ok-ink"
  | "--ll-primary-shadow"
  | "--ll-font-sans"
  | "--ll-font-serif"
  | "--ll-font-mono"
  | "--ll-font"
  | "--ll-step--1"
  | "--ll-step-0"
  | "--ll-step-1"
  | "--ll-step-2"
  | "--ll-step-3"
  | "--ll-step-4"
  | "--ll-step-5"
  | "--ll-step-6"
  | "--ll-tnum"
  | "--ll-dur-fast"
  | "--ll-dur-base"
  | "--ll-ease"
  | "--ll-width-content"
  | "--ll-width-app"
  | "--ll-width-wide"
  | "--ll-width-narrow"
  | "--ll-gutter"
  | "--ll-gutter-mobile"

export type SurfaceConfig = {
  id: string
  name: string
  home: string
  icon: string
  workflows: readonly WorkflowId[]
  copy: {
    workflowEyebrow: string
    disclaimer: string
    trustTitle: string
    sidebarNote: string
    contactUrl?: string
    trustPoints: readonly (readonly [title: string, body: string])[]
  }
  /** Where the header "Join Waitlist" button goes: the form lives on the lawyerlab landing page. */
  waitlistUrl: string
  theme?: Partial<Record<LlTokenName, string>>
  overrides?: Partial<Record<WorkflowId, Partial<Pick<Workflow, "action" | "label" | "description" | "notes" | "guide" | "samples" | "inputModes">>>>
}
