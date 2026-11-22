import type { ComponentType } from "react"
import { DocaliasPanel } from "@/components/DocaliasPanel"
import { HrHiring } from "@/pages/HrHiring"
import { HiringPackage } from "@/pages/HiringPackage"
import { HrOnboarding } from "@/pages/HrOnboarding"
import { TransactionReview } from "@/pages/TransactionReview"
import { TermIsolation } from "@/components/TermIsolation"
import { ContractReviewPanel } from "@/components/ContractReviewPanel"
import { AgreementReview } from "@/components/AgreementReview"
import { acceptsContractReviewArtifact } from "@/lib/api"
import type { Workflow, WorkflowId } from "@/lib/workflows"
import type { WorkflowPanelProps } from "@/components/WorkflowShell"

// job: rendered inside WorkflowShell (/v1 job lifecycle). own-frame: renders its own WorkflowPage (session APIs).
export type WorkflowPanel =
  | { kind: "job"; Panel: ComponentType<WorkflowPanelProps<any>>; accepts: (result: any) => boolean; result: "markdown" | "report" | "artifact" }
  | { kind: "own-frame"; Page: ComponentType<{ workflow: Workflow }> }

// Page-level map stays explicit while protected workflows are being proven. Do not turn manifests into executable UI instructions.
export const WORKFLOW_PANELS: Partial<Record<WorkflowId, WorkflowPanel>> = {
  "contract-review": { kind: "job", Panel: ContractReviewPanel, accepts: acceptsContractReviewArtifact, result: "artifact" },
  "agreement-review": { kind: "own-frame", Page: AgreementReview },
  docalias: { kind: "own-frame", Page: DocaliasPanel },
  "hr-hiring": { kind: "own-frame", Page: HrHiring },
  "hiring-package": { kind: "own-frame", Page: HiringPackage },
  "hr-onboarding": { kind: "own-frame", Page: HrOnboarding },
  "transaction-review": { kind: "own-frame", Page: TransactionReview },
  "term-isolation": { kind: "own-frame", Page: TermIsolation },
}
