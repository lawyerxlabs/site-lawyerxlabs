// Workflow catalog. A surface (src/surface.ts) selects which of these it serves.
import { surface } from "@/surface"
import { enabledWorkflows, findEnabledWorkflow } from "@/surfaces/core"

export type WorkflowId = "docalias" | "transaction-review" | "contract-review" | "case-analysis" | "agreement-review" | "hr-hiring" | "hr-onboarding" | "term-isolation" | "hiring-package"

export type SampleDocument = { label: string; url: string; filename: string }

export type InputMode = "file" | "text" | "json" | "sample"

export type WorkflowHandling = {
  capability: "none" | "fixed" | "selectable"
  choices: readonly ("reject" | "redact" | "off" | "pseudonymise")[]
  default: "reject" | "redact" | "off" | "pseudonymise" | null
}

export type Workflow = {
  id: WorkflowId
  label: string
  // Imperative verb label shown on the sidebar action.
  action: string
  description: string
  icon: "FileKey2" | "ListChecks" | "SearchCheck" | "FileSearch"
  disabled: boolean
  // Backend catalog id this presentation submits to. Must match a record from GET /v1/workflows.
  // null = presentation-only (launching soon); never submittable.
  backendId: string | null
  // Value sent as the upload `workflow` field. Absent = upload without a workflow (plain redaction).
  uploadId?: string
  // Approved sample documents offered on the upload form.
  samples: readonly SampleDocument[]
  // Input modes the workflow accepts. Only "file" is enabled until text/json ship.
  inputModes: readonly InputMode[]
  // File extensions the backend accepts for this workflow. Absent = static default (PDF, DOCX).
  acceptedFileTypes?: readonly string[]
  // Handling capability from the backend overlay. Absent = static fallback (no picker).
  handling?: WorkflowHandling
  // Read-only guarantees and notices shown in the Guide tab. Selectable choices belong to the Options tab (handling).
  notes: { title: string; body: string }[]
  guide: string[]
}


export const CATALOG: readonly Workflow[] = [
  {
    id: "docalias",
    backendId: "docalias",
    label: "Alias",
    action: "Alias Document",
    description: "Replace personal information in one PDF or DOCX with placeholders, and get a report of what was found.",
    icon: "FileKey2",
    disabled: false,
    uploadId: "docalias",
    samples: [
      { label: "Purchase Agreement", url: "/tests/fixtures/synthetic-agreement.pdf", filename: "synthetic-agreement.pdf" },
      { label: "Email", url: "/tests/fixtures/synthetic-email.pdf", filename: "synthetic-email.pdf" },
      { label: "Invoice", url: "/tests/fixtures/synthetic-invoice.pdf", filename: "synthetic-invoice.pdf" },
    ],
    inputModes: ["file"],
    notes: [
      { title: "Personal information is identified", body: "The report shows what was found and replaced, so you always know what changed." },
      { title: "Redaction is always on", body: "Every upload is prepared the same way. Redaction cannot be switched off." },
      { title: "Source pages are rendered locally", body: "Pages are rendered in your browser and are never returned by the result API." },
      { title: "Outputs are temporary", body: "Results expire automatically. Anonymous results are also removed once both the document and the report have been read." },
    ],
    guide: [
      "Upload a PDF or DOCX. Personal information is identified and replaced.",
      "You get a working copy plus a report of what was found.",
      "Review every output. Source pages are rendered locally; outputs are temporary.",
    ],
  },
  {
    id: "contract-review",
    backendId: "contract-review",
    label: "Contract review",
    action: "Review contract",
    description: "Prepare a protected contract review with one grounded point for lawyer review.",
    icon: "FileSearch",
    disabled: false,
    uploadId: "contract-review",
    samples: [],
    inputModes: ["file"],
    acceptedFileTypes: [".pdf", ".docx"],
    handling: { capability: "fixed", choices: ["pseudonymise"], default: "pseudonymise" },
    notes: [
      { title: "Personal information is pseudonymised", body: "Names and similar information are replaced with protected tokens before review output is created." },
      { title: "No restoration", body: "This workspace does not restore protected tokens to original values." },
      { title: "One grounded point", body: "The result contains a short summary and, when available, one exact protected quote from the document." },
      { title: "Outputs are temporary", body: "Results expire automatically. Review every output before use." },
    ],
    guide: [
      "Upload a contract as PDF or DOCX while signed in.",
      "Personal information is pseudonymised before the protected review is created.",
      "Review the summary and grounded quote. This tool does not restore original values or provide legal advice.",
    ],
  },
  {
    id: "transaction-review",
    backendId: "transaction-session-intake",
    label: "Transaction Review",
    action: "Review transaction",
    description: "Extract parties and key terms from an Ontario agreement of purchase and sale for signed-in lawyer review.",
    icon: "ListChecks",
    disabled: false,
    samples: [],
    inputModes: ["file", "text"],
    acceptedFileTypes: [".pdf"],
    notes: [
      { title: "Signed-in review", body: "Review the extracted parties and terms with a signed-in lawyer." },
      { title: "Outputs are temporary", body: "Review every output before use." },
    ],
    guide: [
      "Paste the text of an Ontario agreement of purchase and sale, or upload one PDF.",
      "You get the parties and key terms the parser located, with their page and source label.",
      "Review every output with a signed-in lawyer. Outputs are temporary.",
    ],
  },
  {
    id: "case-analysis",
    backendId: null,
    label: "Case analysis",
    action: "Review decision",
    description: "Case analysis — launching soon",
    icon: "SearchCheck",
    disabled: true,
    samples: [{ label: "Synthetic email", url: "/tests/fixtures/synthetic-email.pdf", filename: "synthetic-email.pdf" }],
    inputModes: ["file"],
    notes: [],
    guide: [],
  },
  {
    id: "agreement-review",
    backendId: "agreement-review",
    label: "Agreement analysis",
    action: "Analyze agreement",
    description: "Review key clauses in an Ontario commercial agreement with source excerpts.",
    icon: "FileSearch",
    disabled: true,
    samples: [],
    inputModes: ["file"],
    acceptedFileTypes: [".pdf", ".docx"],
    handling: { capability: "fixed", choices: ["pseudonymise"], default: "pseudonymise" },
    notes: [
      { title: "Personal information is pseudonymised", body: "Detected identifiers are protected before analysis. Pseudonymisation does not guarantee anonymity." },
      { title: "Professional review required", body: "Check every finding against the cited passage. This tool does not provide legal advice." },
    ],
    guide: ["Upload one text-based PDF or DOCX commercial agreement.", "Review the findings and short protected source excerpts.", "Check every finding against the agreement before use."],
  },
  {
    id: "hr-hiring",
    backendId: "hr-hiring",
    label: "Structured Job Description Review",
    action: "Review job description",
    description: "Prepare an improved job description from one PDF or pasted text for professional review.",
    icon: "FileSearch",
    disabled: false,
    samples: [],
    inputModes: ["file", "text"],
    acceptedFileTypes: [".pdf"],
    notes: [
      { title: "Sign in required", body: "Preparing and generating a job description requires sign in." },
      { title: "One source per session", body: "Upload one PDF or paste the text of one job description." },
      { title: "Review before generation", body: "Each criterion is confirmed, corrected, excluded, or left unresolved before the improved job description is generated." },
      { title: "Synthetic or sanitised only", body: "Do not upload real candidate or employee information." },
    ],
    guide: [
      "Upload one PDF or paste the job description text.",
      "Review the prepared source preview and confirm, correct, or exclude each extracted criterion. With Off handling, personal information may remain.",
      "Generate the improved job description and review it before use.",
    ],
  },
  {
    id: "hiring-package",
    backendId: "hiring-package",
    label: "Hiring Package",
    action: "Prepare job description",
    description: "Screen one job description from PDF or pasted text, then prepare an approved version for members.",
    icon: "ListChecks",
    disabled: false,
    samples: [],
    inputModes: ["file", "text"],
    acceptedFileTypes: [".pdf"],
    notes: [
      { title: "Sign in required", body: "Preparing and approving a job description requires sign in." },
      { title: "Screened before use", body: "Text is screened for personal information before generation. Edited text is screened again before approval." },
      { title: "Approve before use", body: "Only the approved text is kept. Copy or download it before leaving this page." },
      { title: "Synthetic or sanitised only", body: "Do not upload real candidate or employee information." },
    ],
    guide: [
      "Upload one PDF or paste the text of one job description.",
      "Review the generated draft. Edits are screened again before approval.",
      "Approve the description, then copy or download it.",
    ],
  },
  {
    id: "hr-onboarding",
    backendId: "hr-onboarding",
    label: "Onboarding",
    action: "Prepare onboarding sequence",
    description: "Prepare a source-grounded onboarding sequence from a job description and employer policy documents.",
    icon: "FileSearch",
    disabled: false,
    samples: [],
    inputModes: ["file"],
    acceptedFileTypes: [".pdf", ".docx", ".txt"],
    // The /onboard/v1 intake explicitly requests Redact and verifies the returned effective mode.
    handling: { capability: "fixed", choices: ["redact"], default: "redact" },
    notes: [
      { title: "Job description required", body: "Every run must include a job description. Up to 5 files total." },
      { title: "Accepted formats", body: "PDF, DOCX, and plain text." },
      { title: "Sequence generation", body: "After confirming document types, you can generate an onboarding sequence. Generation is unavailable until LLM configuration is set up; if unconfigured, the workflow reports this and offers retry or start over." },
      { title: "Synthetic or sanitised only", body: "Do not upload real employee or candidate information." },
    ],
    guide: [
      "Upload a job description and any employer policy or procedure documents (up to 5 files).",
      "Review and confirm the file classifications. Correct any that are wrong.",
      "The checklist is drafted with AI from the confirmed documents. Review it before use.",
    ],
  },
  {
    id: "term-isolation",
    // Presentation-only: never advertised or fetched from GET /v1/workflows. Identity is static (see identityRequirement).
    backendId: null,
    label: "Isolate Terms",
    action: "Isolate Terms",
    description: "Extract terms for review against your source document; this is not legal advice.",
    icon: "FileSearch",
    disabled: false,
    samples: [],
    inputModes: ["file"],
    notes: [
      { title: "Review against the source", body: "Check extracted terms against your source document; this is not legal advice." },
      { title: "One-time result", body: "Copy or download the result before leaving this page." },
    ],
    guide: [
      "Upload one PDF or DOCX of an agreement of purchase and sale.",
      "Template required: only OREA Form 100 (Agreement of Purchase and Sale) is supported. Other documents are rejected.",
      "The result is one-time. Copy or download it before you leave this page.",
    ],
  },
]

/** Workflows served by the active surface, with its copy overrides applied. */
export const WORKFLOWS: readonly Workflow[] = enabledWorkflows(CATALOG, surface)

function canonicalWorkflowId(id: string | null | undefined) {
  return id === "alias-doc" || id === "prepare-doc" ? "docalias" : id
}

/** Display lookup: includes disabled workflows so "launching soon" copy can render. */
export function getWorkflow(id: WorkflowId | string | null | undefined): Workflow | undefined {
  const canonicalId = canonicalWorkflowId(id)
  return WORKFLOWS.find((w) => w.id === canonicalId)
}

/** Routing lookup: disabled workflows never resolve. */
export function getRoutableWorkflow(id: WorkflowId | string | null | undefined): Workflow | undefined {
  return findEnabledWorkflow(CATALOG, surface, canonicalWorkflowId(id))
}

/** Alias entry surfaces need capabilities from a routable workflow only. */
export function getAliasWorkflow(): Workflow | undefined {
  return getRoutableWorkflow("docalias")
}
